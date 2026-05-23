/**
 * backend/db/metrics-schema.js
 * 
 * Database tables for metric storage and tracking integrations.
 * Metrics are normalized data points from all integrations (Paycom, GP, Velocity, etc).
 */

'use strict';

/**
 * Initialize metrics database tables.
 * @param {Database} db - better-sqlite3 database instance
 */
function initMetricsSchema(db) {
  db.exec(`
    -- Normalized metrics from all integrations
    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      
      source TEXT NOT NULL,                   -- 'paycom', 'dynamics_gp', 'velocity', etc
      metric_key TEXT NOT NULL,               -- 'headcount', 'oee_current', 'revenue_mtd'
      
      value REAL,                             -- numeric value (headcount: 127, oee: 0.87)
      value_text TEXT,                        -- or text value ('On Track', 'Yellow')
      
      timestamp TEXT DEFAULT (datetime('now')), -- when the metric was recorded
      fetched_at TEXT,                        -- when we fetched it from the integration
      
      -- Metadata for filtering/grouping
      metadata JSON,                          -- e.g., { "department": "Operations", "location": "Warehouse 1" }
      
      UNIQUE(source, metric_key, timestamp)
    );
    
    CREATE INDEX IF NOT EXISTS idx_metrics_source_key 
      ON metrics(source, metric_key, timestamp DESC);
    
    CREATE INDEX IF NOT EXISTS idx_metrics_timestamp 
      ON metrics(timestamp DESC);

    -- Integration sync state (track last successful sync, errors, etc)
    CREATE TABLE IF NOT EXISTS integration_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      
      source TEXT UNIQUE NOT NULL,           -- which integration
      
      last_sync_at TEXT,                     -- when it last ran
      last_sync_status TEXT,                 -- 'success', 'error', 'partial'
      last_sync_record_count INTEGER,        -- how many records synced
      
      last_error TEXT,                       -- error message if failed
      error_count INTEGER DEFAULT 0,         -- consecutive errors
      
      next_sync_at TEXT,                     -- when it should run next
      
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- User dashboard layouts (for customizable dashboard builder)
    CREATE TABLE IF NOT EXISTS dashboard_layouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      
      user_id TEXT,                          -- or team_id for shared dashboards
      name TEXT,                             -- "My Finance Dashboard"
      is_default BOOLEAN DEFAULT 0,
      
      widgets JSON,                          -- Array of widgets, each with:
                                             -- { source, metricKey, position, size, format }
      
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    
    CREATE INDEX IF NOT EXISTS idx_dashboard_layouts_user 
      ON dashboard_layouts(user_id);

    -- Integration audit log (for compliance/debugging)
    CREATE TABLE IF NOT EXISTS integration_audits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      
      source TEXT NOT NULL,
      action TEXT NOT NULL,                  -- 'sync_started', 'sync_complete', 'sync_error'
      status TEXT NOT NULL,                  -- 'success', 'error', 'warning'
      
      records_synced INTEGER,
      error_message TEXT,
      
      details JSON,                          -- source-specific details
      
      timestamp TEXT DEFAULT (datetime('now'))
    );
    
    CREATE INDEX IF NOT EXISTS idx_integration_audits_source_timestamp 
      ON integration_audits(source, timestamp DESC);
  `);

  console.log('[Metrics] Database schema initialized');
  return db;
}

module.exports = { initMetricsSchema };
