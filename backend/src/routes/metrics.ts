/**
 * backend/src/routes/metrics.ts
 *
 * Metrics API — serves normalized metrics from all integrations.
 *
 * GET  /api/metrics                    — list all recent metrics
 * GET  /api/metrics?source=lean_ops    — filter by integration source
 * GET  /api/metrics?metric_key=...     — filter by metric key
 * GET  /api/metrics/summary            — aggregated metrics by source
 * GET  /api/metrics/integrations       — integration sync status
 */

import { Express, Request, Response, Router } from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { logger } from '../lib/logger';

const METRICS_DB_PATH = process.env.METRICS_DB_PATH || path.join(__dirname, '..', '..', 'db', 'metrics.db');

let metricsDb: Database.Database;

function getMetricsDb(): Database.Database {
  if (!metricsDb) {
    try {
      metricsDb = new Database(METRICS_DB_PATH, { readonly: true });
    } catch (err) {
      logger.error('Failed to open metrics database:', err);
      throw err;
    }
  }
  return metricsDb;
}

function parseIntParam(val: unknown, defaultVal: number, min: number, max: number): number | null {
  const parsed = parseInt(String(val ?? defaultVal), 10);
  if (isNaN(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

export function registerMetricsRoutes(app: Express) {
  const router = Router();

  /**
   * GET /api/metrics
   * ?source=lean_ops  ?metric_key=...  ?limit=100  ?hours=24
   */
  router.get('/', (req: Request, res: Response) => {
    try {
      const db = getMetricsDb();
      const { source, metric_key } = req.query;

      const limit = parseIntParam(req.query.limit, 100, 1, 1000);
      const hours = parseIntParam(req.query.hours, 24, 1, 8760);
      if (limit === null) return res.status(400).json({ error: 'limit must be an integer between 1 and 1000' });
      if (hours === null) return res.status(400).json({ error: 'hours must be an integer between 1 and 8760' });

      let sql = `
        SELECT
          id, source, metric_key, value, value_text,
          timestamp, fetched_at, metadata
        FROM metrics
        WHERE timestamp > datetime('now', '-' || ? || ' hours')
      `;

      const params: unknown[] = [hours];

      if (source) {
        sql += ' AND source = ?';
        params.push(source);
      }
      if (metric_key) {
        sql += ' AND metric_key = ?';
        params.push(metric_key);
      }

      sql += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(limit);

      const rows = db.prepare(sql).all(...params);

      res.json({
        count: rows.length,
        metrics: rows.map((row: any) => ({
          ...row,
          metadata: row.metadata ? JSON.parse(row.metadata) : null,
        })),
      });
    } catch (err) {
      logger.error('GET /api/metrics failed:', err);
      res.status(500).json({ error: 'Failed to fetch metrics' });
    }
  });

  /**
   * GET /api/metrics/latest
   * ?source=lean_ops  ?hours=24
   */
  router.get('/latest', (req: Request, res: Response) => {
    try {
      const db = getMetricsDb();
      const { source } = req.query;

      const hours = parseIntParam(req.query.hours, 24, 1, 8760);
      if (hours === null) return res.status(400).json({ error: 'hours must be an integer between 1 and 8760' });

      let sql = `
        SELECT
          source, metric_key, value, value_text, timestamp, fetched_at, metadata,
          ROW_NUMBER() OVER (PARTITION BY source, metric_key ORDER BY timestamp DESC) as rn
        FROM metrics
        WHERE timestamp > datetime('now', '-' || ? || ' hours')
      `;

      const params: unknown[] = [hours];

      if (source) {
        sql += ' AND source = ?';
        params.push(source);
      }

      sql = `SELECT source, metric_key, value, value_text, timestamp, fetched_at, metadata FROM (${sql}) WHERE rn = 1 ORDER BY source, metric_key`;

      const rows = db.prepare(sql).all(...params);

      res.json({
        count: rows.length,
        metrics: rows.map((row: any) => ({
          ...row,
          metadata: row.metadata ? JSON.parse(row.metadata) : null,
        })),
      });
    } catch (err) {
      logger.error('GET /api/metrics/latest failed:', err);
      res.status(500).json({ error: 'Failed to fetch latest metrics' });
    }
  });

  /**
   * GET /api/metrics/summary
   */
  router.get('/summary', (req: Request, res: Response) => {
    try {
      const db = getMetricsDb();

      const metricCounts = db.prepare(`
        SELECT source, COUNT(*) as metric_count
        FROM metrics
        GROUP BY source
      `).all();

      const integrations = db.prepare(`
        SELECT
          source,
          last_sync_at,
          last_sync_status,
          last_sync_record_count,
          error_count,
          next_sync_at
        FROM integration_state
        ORDER BY source
      `).all();

      res.json({
        metrics_summary: metricCounts,
        integrations,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.error('GET /api/metrics/summary failed:', err);
      res.status(500).json({ error: 'Failed to fetch metrics summary' });
    }
  });

  /**
   * GET /api/metrics/signal/:metric_key
   * ?source=lean_ops  ?days=7
   */
  router.get('/signal/:metric_key', (req: Request, res: Response) => {
    try {
      const db = getMetricsDb();
      const { metric_key } = req.params;
      const { source } = req.query;

      const days = parseIntParam(req.query.days, 7, 1, 365);
      if (days === null) return res.status(400).json({ error: 'days must be an integer between 1 and 365' });

      let sql = `
        SELECT
          source, metric_key, value, value_text,
          timestamp, metadata
        FROM metrics
        WHERE metric_key = ?
          AND timestamp > datetime('now', '-' || ? || ' days')
      `;

      const params: unknown[] = [metric_key, days];

      if (source) {
        sql += ' AND source = ?';
        params.push(source);
      }

      sql += ' ORDER BY timestamp ASC';

      const rows = db.prepare(sql).all(...params);

      res.json({
        metric_key,
        source: source || 'all',
        days,
        data_points: rows.length,
        data: rows.map((row: any) => ({
          source: row.source,
          value: row.value,
          value_text: row.value_text,
          timestamp: row.timestamp,
          metadata: row.metadata ? JSON.parse(row.metadata) : null,
        })),
      });
    } catch (err) {
      logger.error('GET /api/metrics/signal failed:', err);
      res.status(500).json({ error: 'Failed to fetch metric signal' });
    }
  });

  /**
   * GET /api/metrics/health
   */
  router.get('/health', (req: Request, res: Response) => {
    try {
      const db = getMetricsDb();

      const integrations = db.prepare(`
        SELECT
          source,
          last_sync_status,
          last_sync_at,
          error_count,
          next_sync_at
        FROM integration_state
        ORDER BY last_sync_at DESC
      `).all();

      const healthy   = integrations.filter((i: any) => i.last_sync_status === 'success');
      const unhealthy = integrations.filter((i: any) => i.last_sync_status !== 'success');

      res.json({
        status: unhealthy.length === 0 ? 'healthy' : 'degraded',
        healthy_count: healthy.length,
        unhealthy_count: unhealthy.length,
        total: integrations.length,
        healthy_integrations: healthy,
        unhealthy_integrations: unhealthy,
      });
    } catch (err) {
      logger.error('GET /api/metrics/health failed:', err);
      res.status(500).json({ error: 'Failed to fetch metrics health' });
    }
  });

  app.use('/api/metrics', router);
}
