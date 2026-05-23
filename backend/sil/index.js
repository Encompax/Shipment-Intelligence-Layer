/**
 * index.js — Encompax Shipment Intelligence Layer
 *
 * Entry point. Starts the Express REST API server and launches
 * all background workers. Run with: node index.js
 */

'use strict';

require('dotenv').config();
const express      = require('express');
const path         = require('path');
const Database     = require('better-sqlite3');
const { initDb }   = require('./db/schema');

const SIL_DB_PATH = process.env.SIL_DB_PATH || './db/sil.db';
let silDb = null;

function getDb() {
  if (!silDb) {
    silDb = new Database(SIL_DB_PATH, { readonly: true });
  }
  return silDb;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT    = parseInt(process.env.SIL_PORT || '3001', 10);
const HOST    = process.env.SIL_HOST || '0.0.0.0';

// ─── Express App ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// CORS — allow the React dashboard (localhost:3000 or LAN) to call the API
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health check — useful for confirming the service is up
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'encompax-sil',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Worker registry debug — shows available and enabled workers
app.get('/api/sil/workers', (req, res) => {
  try {
    const { getRegistryInfo } = require('./config/workers');
    const registry = getRegistryInfo();
    const runningWorkers = Object.keys(workers);

    res.json({
      running: runningWorkers,
      registry: registry,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Worker status — shows last run time and record counts for each worker
app.get('/api/sil/worker-status', (req, res) => {
  try {
    const rows = getDb().prepare('SELECT * FROM capture_state').all();
    res.json({ workers: rows });
  } catch (err) {
    res.json({ workers: [], error: err.message });
  }
});

// Live feed — last 50 shipments, most recent first
app.get('/api/sil/live-feed', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT
        s.id,
        s.tracking_number,
        s.carrier_name,
        s.carrier_service,
        s.ship_date,
        s.estimated_delivery,
        s.dest_name,
        s.dest_city,
        s.dest_state,
        s.dest_zip,
        s.weight_lbs,
        s.pack_qty,
        s.applied_cost,
        s.gp_order_number,
        s.gp_po_number,
        s.gp_customer_id,
        s.is_hazmat,
        s.is_freight,
        s.status_code,
        s.starship_user,
        s.ud_field1,
        s.captured_at,
        fe.status_code      AS fedex_status,
        fe.status_description,
        fe.estimated_delivery AS fedex_est_delivery,
        fe.actual_delivery,
        fe.is_exception,
        fe.exception_reason,
        fe.is_delivered
      FROM shipments s
      LEFT JOIN fedex_events fe ON s.tracking_number = fe.tracking_number
      ORDER BY s.ship_date DESC, s.captured_at DESC
      LIMIT 50
    `).all();
    res.json({ shipments: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// In-transit — undelivered, non-exception shipments
app.get('/api/sil/in-transit', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT
        s.id,
        s.tracking_number,
        s.carrier_name,
        s.carrier_service,
        s.ship_date,
        s.dest_name,
        s.dest_city,
        s.dest_state,
        s.gp_order_number,
        s.gp_customer_id,
        s.weight_lbs,
        s.pack_qty,
        s.is_hazmat,
        fe.status_code,
        fe.status_description,
        fe.estimated_delivery,
        fe.is_exception,
        CAST(
          (julianday('now') - julianday(s.ship_date)) AS INTEGER
        ) AS days_in_transit
      FROM shipments s
      LEFT JOIN fedex_events fe ON s.tracking_number = fe.tracking_number
      WHERE (fe.is_delivered IS NULL OR fe.is_delivered = 0)
        AND (fe.is_exception IS NULL OR fe.is_exception = 0)
        AND s.ship_date IS NOT NULL
      ORDER BY s.ship_date ASC
    `).all();
    res.json({ shipments: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Exceptions — active carrier exception shipments
app.get('/api/sil/exceptions', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT
        s.id,
        s.tracking_number,
        s.carrier_name,
        s.carrier_service,
        s.ship_date,
        s.dest_name,
        s.dest_city,
        s.dest_state,
        s.gp_order_number,
        s.gp_customer_id,
        fe.status_code,
        fe.status_description,
        fe.exception_reason,
        fe.estimated_delivery,
        fe.last_checked_at
      FROM shipments s
      INNER JOIN fedex_events fe ON s.tracking_number = fe.tracking_number
      WHERE fe.is_exception = 1
        AND (fe.is_delivered IS NULL OR fe.is_delivered = 0)
      ORDER BY s.ship_date DESC
    `).all();
    res.json({ exceptions: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Metrics — summary stats for a date range
// Usage: GET /api/sil/metrics?from=2026-03-01&to=2026-03-10
app.get('/api/sil/metrics', (req, res) => {
  try {
    const db = getDb();

    const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to   = req.query.to   || new Date().toISOString().slice(0, 10);

    const summary = db.prepare(`
      SELECT
        COUNT(*)                                    AS total_shipments,
        SUM(applied_cost)                           AS total_freight_cost,
        AVG(applied_cost)                           AS avg_cost_per_shipment,
        SUM(CASE WHEN is_hazmat = 1 THEN 1 ELSE 0 END) AS hazmat_count,
        SUM(CASE WHEN is_freight = 1 THEN 1 ELSE 0 END) AS ltl_count,
        SUM(weight_lbs)                             AS total_weight_lbs,
        SUM(pack_qty)                               AS total_packages
      FROM shipments
      WHERE date(ship_date) BETWEEN ? AND ?
    `).get(from, to);

    const byCarrier = db.prepare(`
      SELECT carrier_name, COUNT(*) AS count, SUM(applied_cost) AS total_cost
      FROM shipments
      WHERE date(ship_date) BETWEEN ? AND ?
      GROUP BY carrier_name
      ORDER BY count DESC
    `).all(from, to);

    const byDay = db.prepare(`
      SELECT date(ship_date) AS day, COUNT(*) AS count, SUM(applied_cost) AS total_cost
      FROM shipments
      WHERE date(ship_date) BETWEEN ? AND ?
      GROUP BY day
      ORDER BY day ASC
    `).all(from, to);

    const topLanes = db.prepare(`
      SELECT dest_state, COUNT(*) AS count, SUM(applied_cost) AS total_cost
      FROM shipments
      WHERE date(ship_date) BETWEEN ? AND ?
        AND dest_state IS NOT NULL
      GROUP BY dest_state
      ORDER BY count DESC
      LIMIT 10
    `).all(from, to);

    const exceptionCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM shipments s
      INNER JOIN fedex_events fe ON s.tracking_number = fe.tracking_number
      WHERE fe.is_exception = 1
        AND date(s.ship_date) BETWEEN ? AND ?
    `).get(from, to);

    res.json({
      period: { from, to },
      summary,
      byCarrier,
      byDay,
      topLanes,
      exceptionCount: exceptionCount.count,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Workers ─────────────────────────────────────────────────────────────────

const workers = {};

function startWorkers() {
  const { getEnabledWorkers, validateWorkerConfig, loadWorker } = require('./config/workers');

  const enabledWorkers = getEnabledWorkers();

  if (enabledWorkers.length === 0) {
    console.warn('[SIL] No workers enabled — check environment variables');
    return;
  }

  for (const { workerId, config } of enabledWorkers) {
    // Validate required env vars
    const validation = validateWorkerConfig(workerId);
    if (!validation.valid) {
      console.error(`[SIL] Cannot start ${workerId}: missing env vars [${validation.missing.join(', ')}]`);
      continue;
    }

    // Load and start worker
    try {
      const workerModule = loadWorker(workerId);
      workers[workerId] = workerModule;
      workerModule.start();
      console.log(`[SIL] ${workerId} started. (${config.description})`);
    } catch (err) {
      console.error(`[SIL] Failed to start ${workerId}:`, err.message);
    }
  }
}

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`\n[SIL] Received ${signal}. Shutting down...`);
  Object.values(workers).forEach(w => {
    if (typeof w.stop === 'function') w.stop();
  });
  if (silDb) silDb.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, HOST, () => {
  console.log(`[SIL] API server running on http://${HOST}:${PORT}`);
  console.log(`[SIL] Health check: http://localhost:${PORT}/health`);
  
  // Initialize database before starting workers
  try {
    const dbPath = process.env.SIL_DB_PATH || './db/sil.db';
    initDb(dbPath);
    console.log(`[SIL] Database initialized at ${dbPath}`);
  } catch (err) {
    console.error('[SIL] Database initialization failed:', err.message);
    process.exit(1);
  }

  startWorkers();
});
