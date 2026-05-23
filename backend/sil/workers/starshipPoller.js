/**
 * starshipPoller.js — Encompax SIL
 *
 * Polls the StarShip (legacy shipping) web app at STARSHIP_BASE_URL using an authenticated
 * session (ASP.NET cookie + anti-forgery token). Fetches shipment data from
 * POST /Setup/GetMaintainData and upserts into the local SQLite database.
 *
 * Auth flow:
 *   1. GET  /  → parse __RequestVerificationToken from HTML + capture session cookie
 *   2. POST /Account/Login → authenticate, capture updated session cookie
 *   3. POST /Setup/GetMaintainData → shipment JSON (repeats on each poll)
 *
 * On session expiry (redirect to login page) the worker automatically re-authenticates.
 *
 * Dependencies:
 *   npm install axios axios-cookiejar-support tough-cookie cheerio better-sqlite3 dotenv
 */

'use strict';

require('dotenv').config();
const axios          = require('axios');
const { wrapper }    = require('axios-cookiejar-support');
const { CookieJar }  = require('tough-cookie');
const cheerio        = require('cheerio');
const Database       = require('better-sqlite3');
const path           = require('path');

// ─── Configuration ────────────────────────────────────────────────────────────

const BASE_URL   = process.env.STARSHIP_BASE_URL;
const SS_USER    = process.env.STARSHIP_USER;
const SS_PASS    = process.env.STARSHIP_PASS;
const DB_PATH    = process.env.SIL_DB_PATH || './sil.db';
const POLL_MS    = parseInt(process.env.STARSHIP_POLL_INTERVAL_MS || '60000', 10);
const PAGE_SIZE      = 500;   // rows per request (UI default is 20; 500 is max for bulk pull)
const HANDSHAKE_MS   = 5 * 60 * 1000;  // keep-alive interval — 5 minutes
const WORKER_ID  = 'starshipPoller';

if (!BASE_URL) {
  throw new Error('STARSHIP_BASE_URL must be set in .env');
}

if (!SS_USER || !SS_PASS) {
  throw new Error('STARSHIP_USER and STARSHIP_PASS must be set in .env');
}

// ─── Database ─────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS shipments (
    id                 TEXT PRIMARY KEY,        -- StarShip internal ID (numeric string)
    tracking_number    TEXT UNIQUE,             -- MasterTrackingID
    source             TEXT DEFAULT 'starship',
    carrier_name       TEXT,
    carrier_service    TEXT,
    ship_date          TEXT,                    -- ISO date string
    estimated_delivery TEXT,
    dest_name          TEXT,
    dest_city          TEXT,
    dest_state         TEXT,
    dest_zip           TEXT,
    dest_country       TEXT,
    origin_address_id  TEXT,                    -- Sender.AddressID
    weight_lbs         REAL,
    pack_qty           INTEGER,
    rated_cost         REAL,
    applied_cost       REAL,
    gp_order_number    TEXT,
    gp_po_number       TEXT,
    gp_customer_id     TEXT,
    billing_type       INTEGER,                 -- 0=Prepaid, 2=Recipient/Third-party
    is_hazmat          INTEGER DEFAULT 0,
    is_freight         INTEGER DEFAULT 0,       -- Freight / LTL
    status_code        INTEGER,                 -- 0=Open, 1=Processed
    starship_user      TEXT,
    ud_field1          TEXT,                    -- "Shipment Field 1" customer PO / ref
    captured_at        TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS fedex_events (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    tracking_number     TEXT UNIQUE,
    status_code         TEXT,
    status_description  TEXT,
    estimated_delivery  TEXT,
    actual_delivery     TEXT,
    is_exception        INTEGER DEFAULT 0,
    exception_reason    TEXT,
    last_checked_at     TEXT,
    is_delivered        INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS capture_state (
    worker        TEXT PRIMARY KEY,
    last_run      TEXT,
    records_last_run INTEGER
  );
`);

const upsertShipment = db.prepare(`
  INSERT INTO shipments (
    id, tracking_number, carrier_name, carrier_service,
    ship_date, estimated_delivery,
    dest_name, dest_city, dest_state, dest_zip, dest_country,
    origin_address_id, weight_lbs, pack_qty, rated_cost, applied_cost,
    gp_order_number, gp_po_number, gp_customer_id, billing_type,
    is_hazmat, is_freight, status_code, starship_user, ud_field1, captured_at
  ) VALUES (
    @id, @tracking_number, @carrier_name, @carrier_service,
    @ship_date, @estimated_delivery,
    @dest_name, @dest_city, @dest_state, @dest_zip, @dest_country,
    @origin_address_id, @weight_lbs, @pack_qty, @rated_cost, @applied_cost,
    @gp_order_number, @gp_po_number, @gp_customer_id, @billing_type,
    @is_hazmat, @is_freight, @status_code, @starship_user, @ud_field1,
    datetime('now')
  )
  ON CONFLICT(id) DO UPDATE SET
    tracking_number    = excluded.tracking_number,
    carrier_name       = excluded.carrier_name,
    carrier_service    = excluded.carrier_service,
    ship_date          = excluded.ship_date,
    estimated_delivery = excluded.estimated_delivery,
    dest_name          = excluded.dest_name,
    dest_city          = excluded.dest_city,
    dest_state         = excluded.dest_state,
    dest_zip           = excluded.dest_zip,
    dest_country       = excluded.dest_country,
    origin_address_id  = excluded.origin_address_id,
    weight_lbs         = excluded.weight_lbs,
    pack_qty           = excluded.pack_qty,
    rated_cost         = excluded.rated_cost,
    applied_cost       = excluded.applied_cost,
    gp_order_number    = excluded.gp_order_number,
    gp_po_number       = excluded.gp_po_number,
    gp_customer_id     = excluded.gp_customer_id,
    billing_type       = excluded.billing_type,
    is_hazmat          = excluded.is_hazmat,
    is_freight         = excluded.is_freight,
    status_code        = excluded.status_code,
    starship_user      = excluded.starship_user,
    ud_field1          = excluded.ud_field1
`);

const setState = db.prepare(`
  INSERT INTO capture_state (worker, last_run, records_last_run)
  VALUES (@worker, datetime('now'), @count)
  ON CONFLICT(worker) DO UPDATE SET
    last_run         = excluded.last_run,
    records_last_run = excluded.records_last_run
`);

// ─── HTTP Client ──────────────────────────────────────────────────────────────

const jar    = new CookieJar();
const client = wrapper(axios.create({
  baseURL: BASE_URL,
  jar,
  withCredentials: true,
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Encompax-SIL/1.0)',
    'Accept':     'application/json, text/html, */*',
  },
  maxRedirects: 5,
}));

let verificationToken = null;   // anti-forgery token cached after login

// ─── Auth Helpers ─────────────────────────────────────────────────────────────

/**
 * Fetch the login page and extract the __RequestVerificationToken from the form.
 */
async function fetchLoginToken() {
  const res = await client.get('/Account/Login');
  const $   = cheerio.load(res.data);
  const tok = $('input[name="__RequestVerificationToken"]').val();
  if (!tok) throw new Error('Could not find __RequestVerificationToken on login page');
  return tok;
}

/**
 * Authenticate against StarShip and cache the session token.
 * After this call the cookie jar holds the authenticated session cookie.
 */
async function login() {
  console.log(`[${WORKER_ID}] Authenticating with StarShip at ${BASE_URL}...`);
  const loginToken = await fetchLoginToken();

  const params = new URLSearchParams();
  params.append('__RequestVerificationToken', loginToken);
  params.append('UserName', SS_USER);
  params.append('Password', SS_PASS);
  params.append('RememberMe', 'false');

  const res = await client.post('/Account/Login', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    maxRedirects: 5,
  });

  // After login StarShip redirects to the main page — extract token from there
  const $ = cheerio.load(res.data);
  verificationToken = $('input[name="__RequestVerificationToken"]').val()
    || $('meta[name="__AjaxAntiForgeryForm"] + input[name="__RequestVerificationToken"]').val();

  // Some StarShip versions put the token in a meta tag
  if (!verificationToken) {
    verificationToken = $('[name="__RequestVerificationToken"]').first().val();
  }

  if (!verificationToken) {
    // Fall back to re-fetching the shipments page which has a form token
    const shipRes = await client.get('/Shipments');
    const $2 = cheerio.load(shipRes.data);
    verificationToken = $2('[name="__RequestVerificationToken"]').first().val();
  }

  if (!verificationToken) {
    throw new Error('Login succeeded but could not retrieve anti-forgery token from post-login page');
  }

  console.log(`[${WORKER_ID}] Authenticated. Token acquired.`);
}

/**
 * POST /Home/HandShake — keeps the ASP.NET session alive between polls.
 * StarShip's browser client calls this continuously; we call it every 5 minutes.
 * The ASPXAUTH + ASP.NET_SessionId cookies in the jar are what matter here.
 */
async function handshake() {
  try {
    const params = new URLSearchParams();
    params.append('__RequestVerificationToken', verificationToken || '');
    await client.post('/Home/HandShake', params, {
      headers: {
        'Content-Type':     'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
  } catch (err) {
    console.warn(`[${WORKER_ID}] HandShake failed (non-fatal): ${err.message}`);
  }
}

/**
 * Check whether the response looks like a redirect-to-login (session expired).
 */
function isLoginRedirect(responseData) {
  if (typeof responseData !== 'string') return false;
  return responseData.includes('/Account/Login') || responseData.includes('loginForm');
}

// ─── Data Helpers ─────────────────────────────────────────────────────────────

/**
 * Parse a StarShip .NET JSON date string like "/Date(1773151200000)/" into ISO string.
 * Returns null for sentinel dates (negative timestamps near year 1 or 1970 epoch nulls).
 */
function parseDotNetDate(raw) {
  if (!raw) return null;
  const m = String(raw).match(/\/Date\((-?\d+)\)\//);
  if (!m) return null;
  const ms = parseInt(m[1], 10);
  // Sentinel values used by StarShip for "no date":
  //   -62135578800000  ≈ year 0001  (null equivalent)
  //   -5364662162000   ≈ 1800s      (null equivalent)
  if (ms < 0 || ms < 1_000_000_000_000) return null;
  return new Date(ms).toISOString();
}

/**
 * Map a raw StarShip shipment row object to our DB schema.
 */
function mapRow(row) {
  const charges   = row.ShipmentCharges || {};
  const carrier   = row.ShipCarrier     || {};
  const recipient = row.Recipient       || {};
  const addr      = recipient.Address   || {};
  const sender    = row.Sender          || {};
  const fsi       = row.FSIDocInfo      || {};
  const orders    = fsi.Orders          || [];
  const firstOrder = orders[0]          || {};
  const status    = row.ShipmentStatus  || {};
  const udFields  = row.UDFields        || [];

  // Extract first UD field value (customer PO / external reference)
  const ud1 = (udFields.find(f => f.StarShipFieldID === 'UserField21') || {}).Value || null;

  // Determine if freight / LTL (CarrierType 0 in StarShip = Freight)
  const isFreight = carrier.CarrierType === 0 ? 1 : 0;

  // HazMat flag from ShipmentOptions
  const hazmatOpt = (row.ShipmentOptions?.OptionList || []).find(o => o.OptionType === 27);
  const isHazmat  = hazmatOpt ? 1 : 0;

  return {
    id:                String(row.ID),
    tracking_number:   row.ShippingData?.MasterTrackingID || null,
    carrier_name:      carrier.CarrierName    || null,
    carrier_service:   carrier.ServiceName    || null,
    ship_date:         parseDotNetDate(row.ShipDate),
    estimated_delivery: parseDotNetDate(status.EstimatedDelivery),
    dest_name:         addr.Name              || null,
    dest_city:         addr.City              || null,
    dest_state:        addr.StateProvinceCode || null,
    dest_zip:          addr.PostalCode        || null,
    dest_country:      addr.CountryCode       || null,
    origin_address_id: sender.AddressID       || null,
    weight_lbs:        row.ShippingData?.TotalWeight ?? null,
    pack_qty:          row.ShippingData?.TotalPackQty ?? null,
    rated_cost:        charges.ListCharges?.Total   ?? null,
    applied_cost:      charges.AppliedCharges?.Total ?? null,
    gp_order_number:   firstOrder.OrderNumber || fsi.DocumentKey || null,
    gp_po_number:      firstOrder.PONumber    || null,
    gp_customer_id:    recipient.CustomerID   || null,
    billing_type:      row.Billing?.BillingType ?? 0,
    is_hazmat:         isHazmat,
    is_freight:        isFreight,
    status_code:       status.Status ?? null,
    starship_user:     row.StarShipUser || null,
    ud_field1:         ud1,
  };
}

// ─── Core Poll Function ───────────────────────────────────────────────────────

/**
 * POST to GetMaintainData and return the parsed rows array.
 * @param {number} current  - page index (0-based)
 */
async function fetchPage(current = 0) {
  // The searchFilters value replicates the "Open and Processed" default query.
  // To capture ALL shipments (including older ones), omit or widen this filter.
  const searchFilters = JSON.stringify([{
    FieldName: 'Shipment.StatusData.PublicStatus',
    FieldType: 2,
    DisplayName: 'Status',
    Field: {
      ID:        'Shipment.StatusData.PublicStatus',
      FieldName: 'Shipment.ShipmentStatus.Status',
      FieldType: 2,
      ValueList: null,
      SearchID:  'Shipment.StatusData.PublicStatus',
      DisplayName: 'Status',
      ListType: 'ShipmentUserStatusType',
      IsDynamic: false,
      IsArchivedField: true,
      FilterType: 'ValueList',
    },
    Operator:      'Equals',
    Condition1:    '0,1',         // 0=Open, 1=Processed
    Condition2:    '',
    IsAddFilter:   false,
    ValueListKey:  'EnumIndex',
    HasValueList:  true,
  }]);

  const params = new URLSearchParams();
  params.append('current',                String(current));
  params.append('rowCount',               String(PAGE_SIZE));
  params.append('searchPhrase',           '');
  params.append('objType',                'APIShipment');
  params.append('searchFilters',          searchFilters);
  params.append('columnStr',              'Shipment.Recipient.Name,Shipment.StatusData.ReadyDateTime,Shipment.DocInfo.DocumentKey1,Shipment.MasterTrackingID,Shipment.PONumbers,actions');
  params.append('isDashboard',            'false');
  params.append('consolidateShipmentMode','false');
  params.append('__RequestVerificationToken', verificationToken);

  const res = await client.post('/Setup/GetMaintainData', params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  // Session expiry returns HTML redirect instead of JSON
  if (isLoginRedirect(res.data)) {
    throw new SessionExpiredError('Session expired during GetMaintainData');
  }

  let body;
  try {
    body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  } catch (parseErr) {
    throw new Error(`Failed to parse StarShip response: ${parseErr.message}`);
  }
  return body;
}

class SessionExpiredError extends Error {}

/**
 * Full poll cycle: login if needed, paginate through all results, upsert to DB.
 */
async function poll(isRetry = false) {
  const startTime = Date.now();
  let totalRows   = 0;
  let page        = 0;

  try {
    // Fetch first page
    let body = await fetchPage(page);

    const grandTotal = body.total || 0;
    const allRows    = [...(body.rows || [])];

    // Paginate if more rows exist
    const totalPages = Math.ceil(grandTotal / PAGE_SIZE);
    for (page = 1; page < totalPages; page++) {
      const next = await fetchPage(page);
      allRows.push(...(next.rows || []));
    }

    // Upsert all rows in a single transaction
    const upsertMany = db.transaction((rows) => {
      for (const row of rows) {
        try {
          upsertShipment.run(mapRow(row));
        } catch (err) {
          console.warn(`[${WORKER_ID}] Upsert failed for ID ${row.ID}: ${err.message}`);
        }
      }
    });

    upsertMany(allRows);
    totalRows = allRows.length;

    setState.run({ worker: WORKER_ID, count: totalRows });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${WORKER_ID}] Poll complete — ${totalRows} shipments in ${elapsed}s`);

  } catch (err) {
    if (!isRetry && (err instanceof SessionExpiredError || (err.response && err.response.status === 401))) {
      console.warn(`[${WORKER_ID}] Session expired — re-authenticating...`);
      await login();
      await poll(true);
    } else {
      console.error(`[${WORKER_ID}] Poll error:`, err.message);
    }
  }
}

// ─── Worker Lifecycle ─────────────────────────────────────────────────────────

let pollTimer      = null;
let handshakeTimer = null;

async function start() {
  console.log(`[${WORKER_ID}] Starting. Poll interval: ${POLL_MS}ms`);
  try {
    await login();
    await poll();
  } catch (err) {
    console.error(`[${WORKER_ID}] Startup error:`, err.message);
  }

  pollTimer = setInterval(async () => {
    try {
      await poll();
    } catch (err) {
      console.error(`[${WORKER_ID}] Unhandled poll error:`, err.message);
    }
  }, POLL_MS);

  // Keep session alive between polls via the HandShake endpoint
  handshakeTimer = setInterval(handshake, HANDSHAKE_MS);
}

function stop() {
  if (pollTimer)      { clearInterval(pollTimer);      pollTimer      = null; }
  if (handshakeTimer) { clearInterval(handshakeTimer); handshakeTimer = null; }
  console.log(`[${WORKER_ID}] Stopped.`);
  db.close();
}

process.on('SIGTERM', stop);
process.on('SIGINT',  stop);

// ─── Entry point ─────────────────────────────────────────────────────────────

if (require.main === module) {
  start().catch(err => {
    console.error(`[${WORKER_ID}] Fatal:`, err);
    process.exit(1);
  });
}

module.exports = { start, stop, poll };
