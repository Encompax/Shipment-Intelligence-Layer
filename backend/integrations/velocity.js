/**
 * backend/integrations/velocity.js
 * 
 * Velocity Production integration STUB — Phase 2 implementation
 * 
 * Fetches real-time production data.
 * Metrics:
 * - OEE (Overall Equipment Effectiveness)
 * - Changeovers today
 * - WIP count
 * - Schedule attainment
 * - Unplanned downtime
 */

'use strict';

require('dotenv').config();
const axios = require('axios');
const IntegrationWorker = require('../lib/integration-worker');

const API_KEY = process.env.VELOCITY_API_KEY;
const FACILITY_ID = process.env.VELOCITY_FACILITY_ID;
const VELOCITY_BASE_URL = 'https://api.velocity.com/';

class VelocityIntegration extends IntegrationWorker {
  async sync() {
    const startTime = Date.now();
    
    try {
      this.log('Pulling real-time production metrics...');
      
      const data = await this.fetchData();
      const metrics = this.normalizeToMetrics(data);
      this.saveMetrics(metrics);
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      this.log(`Synced in ${elapsed}s — ${metrics.length} metrics`);
    } catch (err) {
      this.error(`Sync failed: ${err.message}`);
      this.recordState('error', 0, err.message);
      throw err;
    }
  }

  async fetchData() {
    this.log('Fetching production metrics from Velocity (STUB)...');

    // TODO: Implement Velocity API calls (REST or database)
    // Velocity may offer real-time data via WebSocket or polling
    // Reference: Consult Velocity API docs

    // STUB: Return mock production data
    return {
      oee_current: 0.87,
      changeovers_today: 3,
      wip_count: 127,
      schedule_attainment: 0.92,
      unplanned_downtime_minutes: 45,
      timestamp: new Date().toISOString(),
    };
  }

  normalizeToMetrics(data) {
    const metrics = [
      {
        metric_key: 'oee_current',
        value: data.oee_current * 100, // Store as percentage
        metadata: { unit: 'percent' },
      },
      {
        metric_key: 'changeovers_today',
        value: data.changeovers_today,
        metadata: { facility_id: FACILITY_ID },
      },
      {
        metric_key: 'wip_count',
        value: data.wip_count,
        metadata: { unit: 'units' },
      },
      {
        metric_key: 'schedule_attainment',
        value: data.schedule_attainment * 100,
        metadata: { unit: 'percent' },
      },
      {
        metric_key: 'unplanned_downtime_minutes',
        value: data.unplanned_downtime_minutes,
        metadata: { today: true },
      },
    ];

    return metrics;
  }
}

async function start(config, db) {
  const worker = new VelocityIntegration('velocity', config, db);
  await worker.start();
  return worker;
}

function stop(worker) {
  worker.stop();
}

module.exports = { start, stop };
