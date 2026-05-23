/**
 * backend/integrations/integrations-manager.js
 * 
 * Integrations orchestrator — starts/manages all active integrations.
 * Similar to SIL's worker pattern, but runs integration-specific sync logic.
 * 
 * Run with: node integrations-manager.js
 */

'use strict';

require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const { initMetricsSchema } = require('../db/metrics-schema');
const INTEGRATION_REGISTRY = require('../config/integrations');

// ─── Database Setup ──────────────────────────────────────────────────────────

const DB_PATH = process.env.METRICS_DB_PATH || path.join(__dirname, '..', 'db', 'metrics.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // Better concurrency
initMetricsSchema(db);

console.log(`[Integrations] Database initialized at ${DB_PATH}`);

// ─── Integration Workers ─────────────────────────────────────────────────────

const INTEGRATION_MODULES = {
  paycom: () => require('./paycom'),
  dynamics_gp: () => require('./dynamics-gp'),
  velocity: () => require('./velocity'),
  lean_ops: () => require('./lean_ops'),
};

const runningWorkers = {};

/**
 * Start a single integration worker.
 * @param {string} integrationId - 'paycom', 'dynamics_gp', etc
 */
async function startIntegration(integrationId) {
  if (!INTEGRATION_REGISTRY[integrationId]) {
    console.error(`[Integrations] Unknown integration: ${integrationId}`);
    return;
  }

  const config = INTEGRATION_REGISTRY[integrationId];

  if (!config.enabled) {
    console.log(`[Integrations] ${config.name} disabled (env vars not set)`);
    return;
  }

  if (runningWorkers[integrationId]) {
    console.log(`[Integrations] ${config.name} already running`);
    return;
  }

  try {
    const WorkerClass = INTEGRATION_MODULES[integrationId]();
    const worker = new WorkerClass(integrationId, config, db);
    
    await worker.start();
    runningWorkers[integrationId] = worker;
    
    console.log(`[Integrations] ✓ Started ${config.name}`);
  } catch (err) {
    console.error(`[Integrations] ✗ Failed to start ${config.name}: ${err.message}`);
  }
}

/**
 * Start all enabled integrations.
 */
async function startAll() {
  console.log('[Integrations] Starting all enabled integrations...');
  
  for (const integrationId of Object.keys(INTEGRATION_REGISTRY)) {
    await startIntegration(integrationId);
  }

  const count = Object.keys(runningWorkers).length;
  console.log(`[Integrations] Started ${count} integration(s)`);
}

/**
 * Stop all running integrations.
 */
function stopAll() {
  console.log('[Integrations] Stopping all integrations...');
  
  for (const [id, worker] of Object.entries(runningWorkers)) {
    worker.stop();
    delete runningWorkers[id];
  }

  console.log('[Integrations] All stopped');
  db.close();
  process.exit(0);
}

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[Integrations] Manager starting...');
  await startAll();
  console.log('[Integrations] Ready for business');
}

main().catch((err) => {
  console.error('[Integrations] Fatal error:', err);
  process.exit(1);
});

module.exports = {
  db,
  startIntegration,
  stopAll,
  runningWorkers,
};
