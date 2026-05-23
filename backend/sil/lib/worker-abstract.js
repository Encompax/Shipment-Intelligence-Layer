/**
 * lib/worker-abstract.js — Encompax SIL
 *
 * Abstract base class for SIL workers (StarShip poller, FedEx enricher, Karrio, etc).
 * Defines the standard lifecycle interface and common utilities.
 *
 * All workers should:
 * 1. Extend this class
 * 2. Implement start(), stop(), poll() methods
 * 3. Use the standard logging format with [WORKER_ID] prefix
 * 4. Export { start, stop } for index.js to manage lifecycle
 */

'use strict';

class SilWorker {
  /**
   * @param {string} workerId - Unique worker identifier (e.g., 'starshipPoller', 'karrio')
   * @param {object} options - Configuration options
   * @param {number} options.pollIntervalMs - Poll interval in milliseconds
   * @param {object} options.db - Database instance (optional, worker may create its own)
   */
  constructor(workerId, options = {}) {
    this.workerId = workerId;
    this.pollIntervalMs = options.pollIntervalMs || 60000;
    this.db = options.db;
    this.pollTimer = null;
    this.isRunning = false;
  }

  /**
   * Start the worker. Subclasses should override and call super.start()
   * Typical flow:
   *   1. Validate configuration
   *   2. Initialize resources (DB connection, auth, etc)
   *   3. Run initial poll
   *   4. Set recurring poll interval
   */
  async start() {
    if (this.isRunning) {
      this.log('Already running');
      return;
    }

    this.isRunning = true;
    this.log(`Starting (poll interval: ${this.pollIntervalMs}ms)`);
  }

  /**
   * Stop the worker. Subclasses should override and call super.stop()
   * Typical flow:
   *   1. Clear poll timer
   *   2. Close DB connection
   *   3. Clean up resources
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
   * Core polling logic. Must be implemented by subclass.
   * @throws {Error} if poll fails
   */
  async poll() {
    throw new Error(`${this.workerId}.poll() not implemented`);
  }

  /**
   * Set a recurring poll interval. Called from start() after initial poll.
   * @param {Function} pollFn - Async function to call at interval
   */
  setPollInterval(pollFn) {
    this.pollTimer = setInterval(async () => {
      try {
        await pollFn();
      } catch (err) {
        this.error(`Unhandled poll error: ${err.message}`);
      }
    }, this.pollIntervalMs);
  }

  /**
   * Standard logging with worker ID prefix
   */
  log(...args) {
    console.log(`[${this.workerId}]`, ...args);
  }

  /**
   * Standard warning logging with worker ID prefix
   */
  warn(...args) {
    console.warn(`[${this.workerId}]`, ...args);
  }

  /**
   * Standard error logging with worker ID prefix
   */
  error(...args) {
    console.error(`[${this.workerId}]`, ...args);
  }

  /**
   * Update worker state in capture_state table for monitoring.
   * Requires this.db to be set.
   */
  recordState(recordCount) {
    if (!this.db) return;

    try {
      const setState = this.db.prepare(`
        INSERT INTO capture_state (worker, last_run, records_last_run)
        VALUES (@worker, datetime('now'), @count)
        ON CONFLICT(worker) DO UPDATE SET
          last_run         = excluded.last_run,
          records_last_run = excluded.records_last_run
      `);
      setState.run({ worker: this.workerId, count: recordCount });
    } catch (err) {
      this.warn(`Failed to record state: ${err.message}`);
    }
  }
}

module.exports = SilWorker;
