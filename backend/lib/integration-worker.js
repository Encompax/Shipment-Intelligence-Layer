/**
 * backend/lib/integration-worker.js
 * 
 * Base class for all data integrations (Paycom, GP, Velocity, etc).
 * Extends the worker pattern to handle metrics syncing.
 */

'use strict';

class IntegrationWorker {
  /**
   * @param {string} integrationId - 'paycom', 'dynamics_gp', etc
   * @param {object} config - integration config from registry
   * @param {Database} db - database instance
   */
  constructor(integrationId, config, db) {
    this.integrationId = integrationId;
    this.config = config;
    this.db = db;
    this.pollTimer = null;
    this.isRunning = false;
  }

  /**
   * Start the integration worker.
   * Subclasses override to add initialization logic.
   */
  async start() {
    if (this.isRunning) {
      this.log('Already running');
      return;
    }

    this.isRunning = true;
    this.log(`Starting (sync interval: ${this.config.syncIntervalMs}ms)`);

    try {
      // Run immediate first sync
      await this.sync();
    } catch (err) {
      this.error(`Startup sync error: ${err.message}`);
    }

    // Set recurring interval
    this.pollTimer = setInterval(async () => {
      try {
        await this.sync();
      } catch (err) {
        this.error(`Unhandled sync error: ${err.message}`);
      }
    }, this.config.syncIntervalMs);
  }

  /**
   * Stop the integration worker.
   */
  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isRunning = false;
    this.log('Stopped');
  }

  /**
   * Core sync logic. Must be implemented by subclass.
   * Should fetch data, normalize to metrics, and call this.saveMetrics()
   */
  async sync() {
    throw new Error(`${this.integrationId}.sync() not implemented`);
  }

  /**
   * Fetch data from the integration API.
   * Subclasses implement this to call their specific platform.
   *
   * @returns {Array} Array of raw data from the integration
   */
  async fetchData() {
    throw new Error(`${this.integrationId}.fetchData() not implemented`);
  }

  /**
   * Normalize integration-specific data to metric format.
   *
   * @param {Array} data - raw data from integration
   * @returns {Array} Array of { source, metric_key, value, metadata }
   */
  normalizeToMetrics(data) {
    throw new Error(`${this.integrationId}.normalizeToMetrics() not implemented`);
  }

  /**
   * Save metrics to the database.
   *
   * @param {Array} metrics - Array of { source, metric_key, value, metadata }
   */
  saveMetrics(metrics) {
    if (!metrics || metrics.length === 0) {
      return;
    }

    try {
      const insertMetric = this.db.prepare(`
        INSERT INTO metrics (source, metric_key, value, value_text, fetched_at, metadata)
        VALUES (?, ?, ?, ?, datetime('now'), ?)
        ON CONFLICT(source, metric_key, timestamp) DO UPDATE SET
          value = excluded.value,
          value_text = excluded.value_text,
          fetched_at = excluded.fetched_at
      `);

      const saveMany = this.db.transaction((metricList) => {
        for (const metric of metricList) {
          insertMetric.run(
            this.integrationId,
            metric.metric_key,
            metric.value || null,
            metric.value_text || null,
            metric.metadata ? JSON.stringify(metric.metadata) : null
          );
        }
      });

      saveMany(metrics);

      // Record successful sync
      this.recordState('success', metrics.length);
      this.log(`Synced ${metrics.length} metrics`);
    } catch (err) {
      this.error(`Failed to save metrics: ${err.message}`);
      this.recordState('error', 0, err.message);
      throw err;
    }
  }

  /**
   * Record sync state and audit log.
   */
  recordState(status, recordCount, errorMessage = null) {
    try {
      const upsertState = this.db.prepare(`
        INSERT INTO integration_state (source, last_sync_at, last_sync_status, last_sync_record_count, last_error, next_sync_at)
        VALUES (?, datetime('now'), ?, ?, ?, datetime('now', '+' || ? || ' milliseconds'))
        ON CONFLICT(source) DO UPDATE SET
          last_sync_at = excluded.last_sync_at,
          last_sync_status = excluded.last_sync_status,
          last_sync_record_count = excluded.last_sync_record_count,
          last_error = excluded.last_error,
          next_sync_at = excluded.next_sync_at,
          error_count = CASE WHEN excluded.last_sync_status = 'error' THEN error_count + 1 ELSE 0 END
      `);

      upsertState.run(
        this.integrationId,
        status,
        recordCount,
        errorMessage,
        this.config.syncIntervalMs
      );

      // Audit log
      const insertAudit = this.db.prepare(`
        INSERT INTO integration_audits (source, action, status, records_synced, error_message)
        VALUES (?, 'sync_complete', ?, ?, ?)
      `);

      insertAudit.run(this.integrationId, status, recordCount, errorMessage);
    } catch (err) {
      this.warn(`Failed to record state: ${err.message}`);
    }
  }

  /**
   * Logging utilities with [integrationId] prefix
   */
  log(...args) {
    console.log(`[${this.integrationId}]`, ...args);
  }

  warn(...args) {
    console.warn(`[${this.integrationId}]`, ...args);
  }

  error(...args) {
    console.error(`[${this.integrationId}]`, ...args);
  }
}

module.exports = IntegrationWorker;
