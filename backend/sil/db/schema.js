/**
 * db/schema.js — Encompax SIL
 *
 * Database schema initialization. Exports a single function initDb(dbPath)
 * that opens the database and creates all tables in a transaction.
 */

'use strict';

const Database = require('better-sqlite3');

/**
 * Initialize the SIL database with all required tables.
 * 
 * @param {string} dbPath - Path to the SQLite database file
 * @returns {Database} - Open database instance
 */
function initDb(dbPath) {
  const db = new Database(dbPath);

  // Run all CREATE TABLE statements in a single transaction for atomicity
  db.exec(`
    CREATE TABLE IF NOT EXISTS shipments (
      id                 TEXT PRIMARY KEY,
      tracking_number    TEXT UNIQUE,
      source             TEXT DEFAULT 'starship',
      carrier_name       TEXT,
      carrier_service    TEXT,
      ship_date          TEXT,
      estimated_delivery TEXT,
      dest_name          TEXT,
      dest_city          TEXT,
      dest_state         TEXT,
      dest_zip           TEXT,
      dest_country       TEXT,
      origin_address_id  TEXT,
      weight_lbs         REAL,
      pack_qty           INTEGER,
      rated_cost         REAL,
      applied_cost       REAL,
      gp_order_number    TEXT,
      gp_po_number       TEXT,
      gp_customer_id     TEXT,
      billing_type       INTEGER,
      is_hazmat          INTEGER DEFAULT 0,
      is_freight         INTEGER DEFAULT 0,
      status_code        INTEGER,
      starship_user      TEXT,
      ud_field1          TEXT,
      captured_at        TEXT
    );

    CREATE TABLE IF NOT EXISTS fedex_events (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_number    TEXT UNIQUE NOT NULL,
      status_code        TEXT,
      status_description TEXT,
      estimated_delivery TEXT,
      actual_delivery    TEXT,
      is_exception       INTEGER DEFAULT 0,
      exception_reason   TEXT,
      is_delivered       INTEGER DEFAULT 0,
      last_checked_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS capture_state (
      worker             TEXT PRIMARY KEY,
      last_run           TEXT,
      records_last_run   INTEGER DEFAULT 0
    );
  `);

  return db;
}

module.exports = { initDb };
