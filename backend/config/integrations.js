/**
 * backend/config/integrations.js
 * 
 * Integration registry — defines all available data integrations (Paycom, GP, Velocity, etc).
 * Similar to the SIL worker registry pattern — pluggable, config-driven, env-var based.
 */

'use strict';

require('dotenv').config();

/**
 * Integration registry. Each platform defines:
 * - enabled: feature flag (check env vars)
 * - sync interval: how often to poll
 * - metrics: what data points to fetch and normalize
 * - auth: how to authenticate
 */
const INTEGRATION_REGISTRY = {
  paycom: {
    name: 'Paycom HR',
    enabled: !!process.env.PAYCOM_API_KEY,
    description: 'Employee data, headcount, turnover, compensation',
    requiredEnvVars: ['PAYCOM_API_KEY', 'PAYCOM_COMPANY_ID'],
    syncIntervalMs: parseInt(process.env.PAYCOM_SYNC_INTERVAL_MS || '3600000', 10), // 1 hour
    metrics: [
      'headcount',
      'turnover_ytd',
      'turnover_rate',
      'cost_per_employee',
      'open_reqs',
      'avg_tenure_months',
    ],
    dataPoints: {
      headcount: { type: 'number', description: 'Current active employees' },
      turnover_ytd: { type: 'number', description: 'Employees separated this year' },
      turnover_rate: { type: 'percentage', description: 'Annual turnover rate' },
      cost_per_employee: { type: 'currency', description: 'Average total comp per employee' },
      open_reqs: { type: 'number', description: 'Open job requisitions' },
    },
  },

  dynamics_gp: {
    name: 'Dynamics GP',
    enabled: !!process.env.DYNAMICS_GP_API_KEY,
    description: 'Financial data, customers, orders, revenue, AR aging',
    requiredEnvVars: ['DYNAMICS_GP_API_KEY', 'DYNAMICS_GP_TENANT_ID'],
    syncIntervalMs: parseInt(process.env.DYNAMICS_GP_SYNC_INTERVAL_MS || '1800000', 10), // 30 min
    metrics: [
      'total_ar',
      'ar_days_overdue',
      'revenue_mtd',
      'revenue_ytd',
      'customer_count',
      'avg_invoice_value',
      'order_count_open',
    ],
    dataPoints: {
      total_ar: { type: 'currency', description: 'Total accounts receivable' },
      ar_days_overdue: { type: 'number', description: 'Average days AR is overdue' },
      revenue_mtd: { type: 'currency', description: 'Revenue this month' },
      revenue_ytd: { type: 'currency', description: 'Revenue this year' },
      customer_count: { type: 'number', description: 'Total active customers' },
      order_count_open: { type: 'number', description: 'Open sales orders' },
    },
  },

  velocity: {
    name: 'Velocity Production',
    enabled: !!process.env.VELOCITY_API_KEY,
    description: 'Real-time production metrics: OEE, changeovers, WIP, schedule',
    requiredEnvVars: ['VELOCITY_API_KEY', 'VELOCITY_FACILITY_ID'],
    syncIntervalMs: parseInt(process.env.VELOCITY_SYNC_INTERVAL_MS || '300000', 10), // 5 min (real-time)
    metrics: [
      'oee_current',
      'oee_trend',
      'changeovers_today',
      'wip_count',
      'schedule_attainment',
      'unplanned_downtime_minutes',
    ],
    dataPoints: {
      oee_current: { type: 'percentage', description: 'Current overall equipment effectiveness' },
      oee_trend: { type: 'trend', description: '7-day OEE trend' },
      changeovers_today: { type: 'number', description: 'Changeovers completed today' },
      wip_count: { type: 'number', description: 'Work-in-process units' },
      schedule_attainment: { type: 'percentage', description: 'Production vs plan' },
      unplanned_downtime_minutes: { type: 'number', description: 'Unexpected downtime today' },
    },
  },

  lean_ops: {
    name: 'LEAN Operating System',
    enabled: process.env.LEAN_OPS_ENABLED === 'true',
    description: 'LEAN operating system tools (huddles, standard work, kaizen, daily management)',
    requiredEnvVars: ['LEAN_OPS_ENABLED'],
    syncIntervalMs: parseInt(process.env.LEAN_OPS_SYNC_INTERVAL_MS || '3600000', 10), // 1 hour
    metrics: [
      'daily_management_health',
      'kaizen_open_count',
      'kaizen_closed_count',
      'standard_work_adherence',
      'problem_solving_cycle_time',
    ],
    dataPoints: {
      daily_management_health: { type: 'percentage', description: 'Daily management health score' },
      kaizen_open_count: { type: 'number', description: 'Open kaizen items' },
      kaizen_closed_count: { type: 'number', description: 'Closed kaizen items' },
      standard_work_adherence: { type: 'percentage', description: 'Standard work adherence rate' },
      problem_solving_cycle_time: { type: 'number', description: 'Avg cycle time for problem resolution' },
    },
  },

  // Template for future integrations:
  // new_integration: {
  //   name: 'New Platform Name',
  //   enabled: !!process.env.NEW_INTEGRATION_API_KEY,
  //   description: '...',
  //   requiredEnvVars: ['NEW_INTEGRATION_API_KEY', ...],
  //   syncIntervalMs: 3600000,
  //   metrics: ['metric1', 'metric2', ...],
  //   dataPoints: { /* describe each metric */ },
  // },
};

/**
 * Get all enabled integrations
 * @returns {Array} Array of {integrationId, config} objects
 */
function getEnabledIntegrations() {
  return Object.entries(INTEGRATION_REGISTRY)
    .filter(([, config]) => config.enabled)
    .map(([integrationId, config]) => ({
      integrationId,
      config,
    }));
}

/**
 * Check if specific integration is enabled
 * @param {string} integrationId
 * @returns {boolean}
 */
function isIntegrationEnabled(integrationId) {
  return INTEGRATION_REGISTRY[integrationId]?.enabled || false;
}

/**
 * Validate required env vars for an integration
 * @param {string} integrationId
 * @returns {object} { valid: boolean, missing: string[] }
 */
function validateIntegrationConfig(integrationId) {
  const config = INTEGRATION_REGISTRY[integrationId];
  if (!config) {
    return { valid: false, missing: ['Integration not found in registry'] };
  }

  const missing = (config.requiredEnvVars || []).filter(envVar => !process.env[envVar]);

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Load integration module
 * @param {string} integrationId
 * @returns {object} Integration module
 */
function loadIntegration(integrationId, db) {
  const config = INTEGRATION_REGISTRY[integrationId];
  if (!config) {
    throw new Error(`Integration ${integrationId} not found in registry`);
  }

  try {
    const modulePath = `../integrations/${integrationId}`;
    const integrationModule = require(modulePath);
    return integrationModule;
  } catch (err) {
    throw new Error(`Failed to load integration ${integrationId}: ${err.message}`);
  }
}

/**
 * Get registry info for logging/monitoring
 */
function getRegistryInfo() {
  return Object.entries(INTEGRATION_REGISTRY).map(([integrationId, config]) => ({
    integrationId,
    name: config.name,
    enabled: config.enabled,
    description: config.description,
    syncIntervalMs: config.syncIntervalMs,
    metricsCount: config.metrics.length,
  }));
}

module.exports = {
  INTEGRATION_REGISTRY,
  getEnabledIntegrations,
  isIntegrationEnabled,
  validateIntegrationConfig,
  loadIntegration,
  getRegistryInfo,
};
