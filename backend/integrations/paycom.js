/**
 * backend/integrations/paycom.js
 * 
 * Paycom HR integration STUB — Phase 2 implementation
 * 
 * Fetches employee data from Paycom API and normalizes to metrics:
 * - Headcount (current active employees)
 * - Turnover YTD
 * - Cost per employee
 * - Open requisitions
 * - Average tenure
 */

'use strict';

require('dotenv').config();
const axios = require('axios');
const IntegrationWorker = require('../lib/integration-worker');

const API_KEY = process.env.PAYCOM_API_KEY;
const COMPANY_ID = process.env.PAYCOM_COMPANY_ID;
const PAYCOM_BASE_URL = 'https://secure.paycom.net/api/';
const DEFAULT_TENANT_NAME = process.env.TENANT_NAME || 'Client Organization';

class PaycomIntegration extends IntegrationWorker {
  async sync() {
    const startTime = Date.now();
    
    try {
      this.log('Syncing from Paycom...');
      
      const data = await this.fetchData();
      const metrics = this.normalizeToMetrics(data);
      this.saveMetrics(metrics);
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      this.log(`Sync complete in ${elapsed}s — ${metrics.length} metrics`);
    } catch (err) {
      this.error(`Sync failed: ${err.message}`);
      this.recordState('error', 0, err.message);
      throw err;
    }
  }

  /**
   * Fetch employee data from Paycom.
   * 
   * TODO: Implement the actual Paycom API calls.
   * Reference: https://developer.paycom.com/docs/api/
   */
  async fetchData() {
    this.log('Fetching employee data from Paycom (STUB)...');

    // TODO: Replace with actual Paycom API calls
    // const client = axios.create({
    //   baseURL: PAYCOM_BASE_URL,
    //   headers: { 'Authorization': `Bearer ${API_KEY}` },
    // });
    
    // const employees = await client.get('/employees', { params: { companyId: COMPANY_ID } });
    // return employees.data;

    // STUB: Return mock data for now
    return {
      employees: [
        { id: 1, name: 'John Doe', status: 'A', hireDate: '2020-01-15',department: 'Operations' },
        { id: 2, name: 'Jane Smith', status: 'A', hireDate: '2021-06-01', department: 'Finance' },
        // ... more employees
      ],
      company: { id: COMPANY_ID, name: DEFAULT_TENANT_NAME },
    };
  }

  /**
   * Normalize Paycom data to metric format.
   * 
   * @param {object} data - raw Paycom API response
   * @returns {Array} metrics
   */
  normalizeToMetrics(data) {
    // STUB: Parse and calculate metrics
    const employees = data.employees || [];
    const activeEmployees = employees.filter(e => e.status === 'A');
    
    const metrics = [
      {
        metric_key: 'headcount',
        value: activeEmployees.length,
        metadata: { department: 'All', status: 'active' },
      },
      {
        metric_key: 'turnover_ytd',
        value: employees.filter(e => e.status === 'T').length, // T = terminated
        metadata: { year: new Date().getFullYear() },
      },
      {
        metric_key: 'cost_per_employee',
        value: 125000, // TODO: Calculate from actual data
        metadata: { basis: 'annual_total_comp' },
      },
    ];

    return metrics;
  }
}

// Export start/stop functions for registry
async function start(config, db) {
  const worker = new PaycomIntegration('paycom', config, db);
  await worker.start();
  return worker;
}

function stop(worker) {
  worker.stop();
}

module.exports = { start, stop };
