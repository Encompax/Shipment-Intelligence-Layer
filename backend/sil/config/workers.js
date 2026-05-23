/**
 * config/workers.js — Encompax SIL
 *
 * Worker registry and configuration. Defines which workers are available,
 * how to instantiate them, and which are enabled based on environment variables.
 *
 * This allows:
 * - Multiple workers to run simultaneously (e.g., both StarShip and Karrio)
 * - Easy enable/disable via env vars (ENABLE_STARSHIP_POLLER, ENABLE_KARRIO, etc)
 * - Pluggable extension for new workers (FedEx, UPS tracking enricher, etc)
 */

'use strict';

require('dotenv').config();

/**
 * Worker registry. Each entry defines a worker type and how to load/enable it.
 *
 * Structure:
 * {
 *   [workerId]: {
 *     path: './workers/...',
 *     enabled: boolean or env var check,
 *     description: string,
 *     config: { env vars needed for this worker }
 *   }
 * }
 */
const WORKER_REGISTRY = {
  starshipPoller: {
    path: './workers/starshipPoller',
    enabled: !!(process.env.STARSHIP_USER && process.env.STARSHIP_PASS),
    description: 'StarShip passive poller (ships data via GetMaintainData)',
    requiredEnvVars: ['STARSHIP_USER', 'STARSHIP_PASS', 'STARSHIP_BASE_URL'],
    source: 'starship',
  },

  fedexEnricher: {
    path: './workers/fedexEnricher',
    enabled: !!(process.env.FEDEX_CLIENT_ID && process.env.FEDEX_CLIENT_SECRET),
    description: 'FedEx tracking enricher (adds FedEx events to shipments)',
    requiredEnvVars: ['FEDEX_CLIENT_ID', 'FEDEX_CLIENT_SECRET'],
    source: 'fedex',
  },

  karrio: {
    path: './workers/karrio',
    enabled: !!process.env.ENABLE_KARRIO,
    description: 'Karrio shipping platform integration (future replacement for StarShip)',
    requiredEnvVars: ['KARRIO_API_KEY', 'KARRIO_BASE_URL'],
    source: 'karrio',
  },

  // Template for adding new workers:
  // newWorker: {
  //   path: './workers/newWorker',
  //   enabled: !!process.env.ENABLE_NEW_WORKER,
  //   description: 'Description of this worker',
  //   requiredEnvVars: ['ENV_VAR_1', 'ENV_VAR_2'],
  //   source: 'new-platform',
  // },
};

/**
 * Get all enabled workers.
 * @returns {Array} Array of {workerId, config} objects for enabled workers
 */
function getEnabledWorkers() {
  return Object.entries(WORKER_REGISTRY)
    .filter(([, config]) => config.enabled)
    .map(([workerId, config]) => ({ workerId, config }));
}

/**
 * Check if a specific worker is enabled.
 * @param {string} workerId
 * @returns {boolean}
 */
function isWorkerEnabled(workerId) {
  return WORKER_REGISTRY[workerId]?.enabled || false;
}

/**
 * Validate that required environment variables are set for a worker.
 * @param {string} workerId
 * @returns {object} { valid: boolean, missing: string[] }
 */
function validateWorkerConfig(workerId) {
  const config = WORKER_REGISTRY[workerId];
  if (!config) {
    return { valid: false, missing: ['Worker not found in registry'] };
  }

  const missing = (config.requiredEnvVars || []).filter(envVar => !process.env[envVar]);

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Load a worker module and return the exported instance.
 * @param {string} workerId
 * @returns {object} Worker module with start/stop/poll exports
 */
function loadWorker(workerId) {
  const config = WORKER_REGISTRY[workerId];
  if (!config) {
    throw new Error(`Worker ${workerId} not found in registry`);
  }

  try {
    const workerModule = require(config.path);
    return workerModule;
  } catch (err) {
    throw new Error(`Failed to load worker ${workerId}: ${err.message}`);
  }
}

/**
 * Get registry info for logging/debug.
 * @returns {object}
 */
function getRegistryInfo() {
  return Object.entries(WORKER_REGISTRY).map(([workerId, config]) => ({
    workerId,
    enabled: config.enabled,
    description: config.description,
    source: config.source,
    requiredEnvVars: config.requiredEnvVars,
  }));
}

module.exports = {
  WORKER_REGISTRY,
  getEnabledWorkers,
  isWorkerEnabled,
  validateWorkerConfig,
  loadWorker,
  getRegistryInfo,
};
