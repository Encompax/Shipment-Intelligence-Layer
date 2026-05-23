/**
 * karrio.js — Encompax SIL (Karrio Worker)
 *
 * MIGRATION PHASE 2-4: Karrio shipping platform integration
 *
 * This worker is a placeholder/stub for the future Karrio integration.
 * When Karrio replaces StarShip, this worker will:
 *   1. Poll the Karrio API for shipment events
 *   2. Enrich local database with tracking data
 *   3. Support the same multi-carrier reconciliation as StarShip
 *
 * Timeline:
 *   Phase 1 (now):     StarShip poller running, SIL is observer
 *   Phase 2 (soon):    Karrio running on LAN, this worker polls it
 *   Phase 3 (cutover): New shipments route through Karrio; StarkShip retired
 *   Phase 4 (long):    Main backend integrates Karrio directly
 *
 * Unlike starshipPoller (which is read-only observer of an external app),
 * Karrio is self-hosted, so this worker can:
 *   - Query shipment data via REST API
 *   - Receive webhooks for real-time updates (future enhancement)
 *   - Reconcile multi-carrier tracking directly
 *
 * Supported carriers (per Karrio docs):
 *   - FedEx (all services)
 *   - UPS (all services)
 *   - USPS (domestic + international)
 *   - DHL (all services)
 *   - LTL carriers (R+L, YRC, ABF, etc.)
 *
 * Reference: https://github.com/karrioapi/karrio
 */

'use strict';

require('dotenv').config();
const axios   = require('axios');
const Database = require('better-sqlite3');

// ─── Configuration ────────────────────────────────────────────────────────────

const KARRIO_API_KEY  = process.env.KARRIO_API_KEY;
const KARRIO_BASE_URL = process.env.KARRIO_BASE_URL || 'http://karrio:8000/api';
const DB_PATH         = process.env.SIL_DB_PATH || './db/sil.db';
const POLL_MS         = parseInt(process.env.KARRIO_POLL_INTERVAL_MS || '300000', 10); // 5min default
const WORKER_ID       = 'karrio';

if (!KARRIO_API_KEY) {
  throw new Error('KARRIO_API_KEY must be set in .env to enable Karrio worker');
}

// ─── Database ─────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);

const upsertShipment = db.prepare(`
  INSERT INTO shipments (
    id, tracking_number, source, carrier_name, carrier_service,
    ship_date, estimated_delivery,
    dest_name, dest_city, dest_state, dest_zip, dest_country,
    weight_lbs, pack_qty, rated_cost, applied_cost,
    gp_order_number, gp_po_number, gp_customer_id,
    is_hazmat, is_freight, status_code, captured_at
  ) VALUES (
    ?, ?, ?, ?, ?,
    ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, datetime('now')
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
    weight_lbs         = excluded.weight_lbs,
    pack_qty           = excluded.pack_qty,
    rated_cost         = excluded.rated_cost,
    applied_cost       = excluded.applied_cost,
    gp_order_number    = excluded.gp_order_number,
    gp_po_number       = excluded.gp_po_number,
    gp_customer_id     = excluded.gp_customer_id,
    is_hazmat          = excluded.is_hazmat,
    is_freight         = excluded.is_freight,
    status_code        = excluded.status_code
`);

const setState = db.prepare(`
  INSERT INTO capture_state (worker, last_run, records_last_run)
  VALUES (@worker, datetime('now'), @count)
  ON CONFLICT(worker) DO UPDATE SET
    last_run         = excluded.last_run,
    records_last_run = excluded.records_last_run
`);

// ─── Karrio API Client ────────────────────────────────────────────────────────

const client = axios.create({
  baseURL: KARRIO_BASE_URL,
  headers: {
    'Authorization': `Token ${KARRIO_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

/**
 * Fetch shipments from Karrio API.
 * For now, this is a stub. In Phase 2, implement:
 *   1. Query /shipments/ endpoint with pagination
 *   2. Filter for shipments modified since last_run
 *   3. Map Karrio response format to our shipments table
 *
 * Karrio shipment response includes:
 *   - id, reference (order number), status
 *   - carrier_name, service, tracking_number
 *   - shipment_date, estimated_delivery
 *   - recipient (name, address)
 *   - charges (weight, dimensions)
 *   - etc.
 */
async function fetchShipments() {
  console.log(`[${WORKER_ID}] fetchShipments() stub — not yet implemented`);
  return [];
}

/**
 * Map Karrio shipment object to our DB schema.
 */
function mapKarrioShipment(shipment) {
  // TODO: Implement actual mapping when Karrio is deployed
  return null;
}

// ─── Core Poll Function ───────────────────────────────────────────────────────

/**
 * Poll Karrio API for shipment updates and upsert to DB.
 * Stub implementation — full implementation Phase 2+.
 */
async function poll() {
  const startTime = Date.now();
  let totalRows = 0;

  try {
    console.log(`[${WORKER_ID}] Starting poll (stub)`);

    // TODO: Implement full poll logic
    // const shipments = await fetchShipments();
    // const upsertMany = db.transaction((rows) => {
    //   for (const row of rows) {
    //     try {
    //       upsertShipment.run(...mapValues(row));
    //     } catch (err) {
    //       console.warn(`[${WORKER_ID}] Upsert failed: ${err.message}`);
    //     }
    //   }
    // });
    // upsertMany(shipments);
    // totalRows = shipments.length;

    setState.run({ worker: WORKER_ID, count: totalRows });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${WORKER_ID}] Poll complete — ${totalRows} shipments in ${elapsed}s`);

  } catch (err) {
    console.error(`[${WORKER_ID}] Poll error:`, err.message);
  }
}

// ─── Worker Lifecycle ─────────────────────────────────────────────────────────

let pollTimer = null;

async function start() {
  console.log(`[${WORKER_ID}] Starting (PHASE 2+ STUB). Poll interval: ${POLL_MS}ms`);
  console.log(`[${WORKER_ID}] Karrio API: ${KARRIO_BASE_URL}`);
  
  try {
    // Verify connectivity to Karrio
    const health = await client.get('/health/');
    console.log(`[${WORKER_ID}] Connected to Karrio — status: ${health.status}`);
  } catch (err) {
    console.warn(`[${WORKER_ID}] Could not reach Karrio at ${KARRIO_BASE_URL}: ${err.message}`);
    console.log(`[${WORKER_ID}] Continuing anyway — Karrio may come online later`);
  }

  try {
    await poll();
  } catch (err) {
    console.error(`[${WORKER_ID}] Startup poll error:`, err.message);
  }

  // Set recurring poll interval
  pollTimer = setInterval(async () => {
    try {
      await poll();
    } catch (err) {
      console.error(`[${WORKER_ID}] Unhandled poll error:`, err.message);
    }
  }, POLL_MS);
}

function stop() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
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
