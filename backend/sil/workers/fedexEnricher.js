/**
 * fedexEnricher.js — Encompax SIL
 *
 * Enriches shipment records in sil.db with live FedEx tracking events.
 * Polls the FedEx REST API at regular intervals, maps tracking data to the
 * fedex_events table, and updates shipment status for the React dashboard.
 *
 * Dependencies:
 *   axios (HTTP client), better-sqlite3 (local database), dotenv
 */

'use strict';

require('dotenv').config();
const axios   = require('axios');
const Database = require('better-sqlite3');
const path     = require('path');

// ─── Configuration ────────────────────────────────────────────────────────────

const CLIENT_ID     = process.env.FEDEX_CLIENT_ID;
const CLIENT_SECRET = process.env.FEDEX_CLIENT_SECRET;
const ACCOUNT_NUM   = process.env.FEDEX_ACCOUNT_NUMBER;
const DB_PATH       = process.env.SIL_DB_PATH || './db/sil.db';
const POLL_MS       = parseInt(process.env.FEDEX_ENRICHER_INTERVAL_MS || '900000', 10);
const WORKER_ID     = 'fedexEnricher';

const FEDEX_AUTH_URL    = 'https://apis.fedex.com/oauth/token';
const FEDEX_TRACK_URL   = 'https://apis.fedex.com/track/v1/trackingnumbers';
const BATCH_SIZE        = 30;

if (!CLIENT_ID || !CLIENT_SECRET) {
  throw new Error('FEDEX_CLIENT_ID and FEDEX_CLIENT_SECRET must be set in .env');
}

// ─── Database ─────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);

// Prepare reusable statements
const getUndeliveredTracking = db.prepare(`
  SELECT DISTINCT s.tracking_number
  FROM shipments s
  LEFT JOIN fedex_events fe ON s.tracking_number = fe.tracking_number
  WHERE s.tracking_number IS NOT NULL
    AND (fe.tracking_number IS NULL OR fe.is_delivered = 0)
  LIMIT ?
`);

const upsertFedexEvent = db.prepare(`
  INSERT INTO fedex_events (
    tracking_number, status_code, status_description,
    estimated_delivery, actual_delivery, is_exception, exception_reason,
    is_delivered, last_checked_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(tracking_number) DO UPDATE SET
    status_code        = excluded.status_code,
    status_description = excluded.status_description,
    estimated_delivery = excluded.estimated_delivery,
    actual_delivery    = excluded.actual_delivery,
    is_exception       = excluded.is_exception,
    exception_reason   = excluded.exception_reason,
    is_delivered       = excluded.is_delivered,
    last_checked_at    = datetime('now')
`);

const setState = db.prepare(`
  INSERT INTO capture_state (worker, last_run, records_last_run)
  VALUES (@worker, datetime('now'), @count)
  ON CONFLICT(worker) DO UPDATE SET
    last_run         = excluded.last_run,
    records_last_run = excluded.records_last_run
`);

// ─── Token Management ─────────────────────────────────────────────────────────

let cachedToken  = null;
let tokenExpiry  = null;

/**
 * Get a valid FedEx OAuth token, refreshing if necessary.
 * Token is cached in memory and refreshed when within 60 seconds of expiry.
 */
async function getToken() {
  const now = Date.now();

  // If token exists and has > 60 seconds left, return it
  if (cachedToken && tokenExpiry && (tokenExpiry - now) > 60000) {
    return cachedToken;
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);

    if (ACCOUNT_NUM) {
      params.append('account_number', ACCOUNT_NUM);
    }

    const res = await axios.post(FEDEX_AUTH_URL, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    });

    cachedToken = res.data.access_token;
    tokenExpiry = now + (res.data.expires_in * 1000);

    return cachedToken;
  } catch (err) {
    console.error(`[${WORKER_ID}] Token refresh failed: ${err.message}`);
    throw err;
  }
}

// ─── FedEx Tracking API ───────────────────────────────────────────────────────

/**
 * Extract FedEx event data from a tracking result object.
 * Maps FedEx JSON paths to fedex_events table schema.
 */
function extractEventData(tracking) {
  const latestStatus = tracking.latestStatusDetail || {};
  const specialHandlings = tracking.specialHandlings || [];

  // Find exception handling if present
  const exception = specialHandlings.find(h => h.type === 'EXCEPTION');
  const isException = exception ? 1 : 0;
  const exceptionReason = exception ? exception.description : null;

  // Determine if delivered
  const isDelivered = (latestStatus.code === 'DL') ? 1 : 0;

  // Estimate delivery date from window
  let estimatedDelivery = null;
  const window = tracking.estimatedDeliveryTimeWindow?.window;
  if (window && window.ends) {
    estimatedDelivery = window.ends;
  }

  return {
    tracking_number:   tracking.trackingNumber,
    status_code:       latestStatus.code || null,
    status_description: latestStatus.description || null,
    estimated_delivery: estimatedDelivery,
    actual_delivery:    tracking.actualDeliveryTime || null,
    is_exception:       isException,
    exception_reason:   exceptionReason,
    is_delivered:       isDelivered,
  };
}

/**
 * Fetch tracking data for a batch of tracking numbers via FedEx API.
 * Returns array of extracted event data objects.
 */
async function fetchTrackingBatch(trackingNumbers, token, retry = false) {
  try {
    const body = {
      includeDetailedScans: false,
      trackingInfo: trackingNumbers.map(tn => ({
        trackingNumberInfo: { trackingNumber: tn },
      })),
    };

    const res = await axios.post(FEDEX_TRACK_URL, body, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    const trackingResults = res.data.output?.tracking || [];
    return trackingResults.map(extractEventData);

  } catch (err) {
    // If 401, token expired — force refresh and retry once
    if (err.response && err.response.status === 401 && !retry) {
      console.warn(`[${WORKER_ID}] Token expired (401) — refreshing and retrying...`);
      cachedToken = null;
      tokenExpiry = null;
      const newToken = await getToken();
      return fetchTrackingBatch(trackingNumbers, newToken, true);
    }

    console.error(`[${WORKER_ID}] Tracking fetch failed: ${err.message}`);
    throw err;
  }
}

// ─── Core Enrichment ───────────────────────────────────────────────────────────

/**
 * Poll for undelivered shipments, fetch FedEx data, and upsert to DB.
 */
async function enrich() {
  const startTime = Date.now();
  let totalEnriched = 0;

  try {
    const token = await getToken();

    // Get all undelivered tracking numbers (no limit initially, then batch)
    const undelivered = db.prepare(`
      SELECT DISTINCT s.tracking_number
      FROM shipments s
      LEFT JOIN fedex_events fe ON s.tracking_number = fe.tracking_number
      WHERE s.tracking_number IS NOT NULL
        AND (fe.tracking_number IS NULL OR fe.is_delivered = 0)
    `).all();

    if (undelivered.length === 0) {
      // No shipments to enrich
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[${WORKER_ID}] No undelivered shipments — skipped in ${elapsed}s`);
      setState.run({ worker: WORKER_ID, count: 0 });
      return;
    }

    // Process in batches of 30
    const trackingNumbers = undelivered.map(r => r.tracking_number);

    for (let i = 0; i < trackingNumbers.length; i += BATCH_SIZE) {
      const batch = trackingNumbers.slice(i, i + BATCH_SIZE);

      try {
        const events = await fetchTrackingBatch(batch, token);

        // Upsert each event
        const upsertMany = db.transaction((eventList) => {
          for (const event of eventList) {
            upsertFedexEvent.run(
              event.tracking_number,
              event.status_code,
              event.status_description,
              event.estimated_delivery,
              event.actual_delivery,
              event.is_exception,
              event.exception_reason,
              event.is_delivered
            );
          }
        });

        upsertMany(events);
        totalEnriched += events.length;

      } catch (err) {
        // Log batch error but continue with next batch
        console.warn(`[${WORKER_ID}] Batch [${i}-${i + batch.length}) failed: ${err.message}`);
        continue;
      }
    }

    setState.run({ worker: WORKER_ID, count: totalEnriched });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${WORKER_ID}] Enriched ${totalEnriched} shipments in ${elapsed}s`);

  } catch (err) {
    console.error(`[${WORKER_ID}] Enrichment error:`, err.message);
  }
}

// ─── Worker Lifecycle ─────────────────────────────────────────────────────────

let pollTimer = null;

async function start() {
  console.log(`[${WORKER_ID}] Starting. Poll interval: ${POLL_MS}ms`);
  try {
    // Run immediate first enrichment pass
    await enrich();
  } catch (err) {
    console.error(`[${WORKER_ID}] Startup enrichment error:`, err.message);
  }

  // Set recurring interval
  pollTimer = setInterval(async () => {
    try {
      await enrich();
    } catch (err) {
      console.error(`[${WORKER_ID}] Unhandled enrichment error:`, err.message);
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

module.exports = { start, stop, enrich };
