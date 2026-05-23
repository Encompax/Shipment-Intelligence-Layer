/**
 * backend/integrations/dynamics-gp.js
 * 
 * Dynamics GP integration STUB — Phase 2 implementation
 * 
 * Fetches customer, order, and financials from Dynamics GP.
 * Normalizes to metrics:
 * - Total AR
 * - AR days overdue
 * - Revenue MTD / YTD
 * - Customer count
 * - Average invoice value
 */

'use strict';

require('dotenv').config();
const axios = require('axios');
const IntegrationWorker = require('../lib/integration-worker');

const API_KEY = process.env.DYNAMICS_GP_API_KEY;
const TENANT_ID = process.env.DYNAMICS_GP_TENANT_ID;
const GP_BASE_URL = 'https://api.businesscentral.dynamics.com/v2.0/';

class DynamicsGPIntegration extends IntegrationWorker {
  async sync() {
    const startTime = Date.now();
    
    try {
      this.log('Syncing from Dynamics GP...');
      
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
   * Fetch financials from Dynamics GP API.
   * 
   * TODO: Implement GP API integration.
   * Reference: https://docs.microsoft.com/en-us/dynamics365/business-central/dev-itpro/api-reference/
   */
  async fetchData() {
    this.log('Fetching financials from Dynamics GP (STUB)...');

    // TODO: Replace with actual GP API calls
    // const client = axios.create({
    //   baseURL: GP_BASE_URL,
    //   headers: {
    //     'Authorization': `Bearer ${API_KEY}`,
    //     'Content-Type': 'application/json',
    //   },
    // });
    
    // const [customers, invoices, salesOrders] = await Promise.all([
    //   client.get(`/companies/${TENANT_ID}/customers`),
    //   client.get(`/companies/${TENANT_ID}/salesInvoices`),
    //   client.get(`/companies/${TENANT_ID}/salesOrders`),
    // ]);
    
    // return { customers: customers.data, invoices: invoices.data, orders: salesOrders.data };

    // STUB: Return mock data
    return {
      ar_total: 2450000,
      ar_overdue_30_plus: 125000,
      customers_active: 287,
      revenue_mtd: 425000,
      revenue_ytd: 2100000,
      open_orders: 42,
    };
  }

  /**
   * Normalize GP data to metrics.
   */
  normalizeToMetrics(data) {
    const metrics = [
      {
        metric_key: 'total_ar',
        value: data.ar_total,
        metadata: { currency: 'USD' },
      },
      {
        metric_key: 'ar_days_overdue',
        value: 28, // TODO: Calculate from actual invoice dates
        metadata: { threshold_days: 30 },
      },
      {
        metric_key: 'revenue_mtd',
        value: data.revenue_mtd,
        metadata: { month: new Date().getMonth() + 1 },
      },
      {
        metric_key: 'revenue_ytd',
        value: data.revenue_ytd,
        metadata: { year: new Date().getFullYear() },
      },
      {
        metric_key: 'customer_count',
        value: data.customers_active,
        metadata: { status: 'active' },
      },
      {
        metric_key: 'order_count_open',
        value: data.open_orders,
        metadata: { status: 'open' },
      },
    ];

    return metrics;
  }
}

async function start(config, db) {
  const worker = new DynamicsGPIntegration('dynamics_gp', config, db);
  await worker.start();
  return worker;
}

function stop(worker) {
  worker.stop();
}

module.exports = { start, stop };
