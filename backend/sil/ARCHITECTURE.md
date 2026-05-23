# SIL Worker Architecture & Quick Start

## What We Built

A **pluggable multi-worker system** that allows Encompax to gradually migrate from StarShip to Karrio without disrupting production.

---

## File Structure

```
backend/sil/
├── config/
│   └── workers.js              ← Worker registry & feature flags
├── lib/
│   ├── worker-abstract.js      ← Base class (optional, for future)
│   ├── config.ts               ← (existing)
│   └── prisma.ts               ← (existing)
├── workers/
│   ├── starshipPoller.js       ← (existing) Phase 1 - StarShip observer
│   ├── fedexEnricher.js        ← (existing) FedEx tracking enrichment
│   └── karrio.js               ← NEW! Phase 2+ - Karrio stub (disabled by default)
├── db/
│   └── schema.js               ← Database initialization
├── index.js                    ← Refactored to use worker registry
├── MIGRATION.md                ← 4-phase migration plan
├── .env.example                ← Updated with Karrio vars
└── .nvmrc                      ← Node 20

```

---

## How It Works

### 1. Worker Registry (`config/workers.js`)
Central configuration for all workers. Each worker definition includes:
- File path to the worker module
- Enabled/disabled status (based on env vars)
- Required environment variables
- Description and data source identifier

**Example:**
```javascript
karrio: {
  path: './workers/karrio',
  enabled: !!process.env.ENABLE_KARRIO,
  description: 'Karrio shipping platform integration',
  requiredEnvVars: ['KARRIO_API_KEY', 'KARRIO_BASE_URL'],
  source: 'karrio',
}
```

### 2. Refactored `index.js`
Instead of hard-coded worker loading, now uses the registry:

```javascript
function startWorkers() {
  const { getEnabledWorkers, validateWorkerConfig, loadWorker } = require('./config/workers');
  
  for (const { workerId, config } of getEnabledWorkers()) {
    // Validate env vars
    const validation = validateWorkerConfig(workerId);
    if (!validation.valid) {
      console.error(`Missing vars: ${validation.missing.join(', ')}`);
      continue;
    }
    
    // Load and start
    const workerModule = loadWorker(workerId, db);
    workers[workerId] = workerModule;
    workerModule.start();
  }
}
```

**Benefits:**
- Adding a new worker = add entry to registry + implement worker module
- No changes to `index.js` needed
- Feature flags via environment variables

### 3. New Debug Endpoint
```bash
GET http://localhost:3001/api/sil/workers
```

Shows:
- Which workers are currently running
- Full registry (available workers + their status)
- Useful for debugging why a worker isn't starting

---

## Currently Running (Phase 1)

### Active Workers
```
starshipPoller   ← Polls StarShip at http://shipping-system.local:180
fedexEnricher    ← Enriches with FedEx tracking data
karrio           ← DISABLED (stub, for Phase 2+)
```

### Environment
```env
# Required for Phase 1
STARSHIP_USER=...
STARSHIP_PASS=...
FEDEX_CLIENT_ID=...
FEDEX_CLIENT_SECRET=...

# Phase 2 (currently disabled)
ENABLE_KARRIO=0  # Set to 1 when Karrio is deployed
```

---

## Quick Reference: Enabling Phases

### Phase 2 – Parallel Run
When Karrio is deployed on your LAN:

```bash
# Add to .env
ENABLE_KARRIO=1
KARRIO_API_KEY=<from Karrio admin>
KARRIO_BASE_URL=http://karrio:8000/api

# Restart SIL
npm restart

# Verify both workers running
curl http://localhost:3001/api/sil/workers
# Should show: "running": ["starshipPoller", "fedexEnricher", "karrio"]
```

### Phase 3 – Cutover
When you're ready to stop polling StarShip:

```bash
# Disable StarShip (leave API secret blank)
STARSHIP_USER=
STARSHIP_PASS=

# Restart
npm restart

# Verify
curl http://localhost:3001/api/sil/workers
# Should show: "running": ["fedexEnricher", "karrio"]
```

---

## Worker Module Interface

All workers follow this pattern:

```javascript
// workers/myWorker.js
async function start() {
  console.log('[myWorker] Starting...');
  // Initialize, run first poll
  // Set interval for recurring polls
}

function stop() {
  console.log('[myWorker] Stopped');
  // Clean up timers, close connections
}

async function poll() {
  // Main polling logic
}

module.exports = { start, stop, poll };
```

**Note:** Workers don't need to extend `worker-abstract.js` (it exists for future refactoring). They just need `start()`, `stop()`, and `poll()` exports.

---

## Database Multi-Source Support

The `shipments` table already includes a `source` column:

```sql
source TEXT DEFAULT 'starship'
```

During Phase 1-3, both get recorded:
- **StarShip records:** `source = 'starship'`
- **Karrio records:** `source = 'karrio'`

**Query all sources:**
```sql
SELECT source, COUNT(*) FROM shipments GROUP BY source;
```

**Query by phase:**
```sql
-- Phase 1: only StarShip
SELECT * FROM shipments WHERE source = 'starship';

-- Phase 2-3: mixed
SELECT * FROM shipments;

-- Phase 3+: only Karrio (historical data unchanged)
SELECT * FROM shipments WHERE source = 'karrio';
```

---

## Deployment Checklist

- [x] **Phase 1:** StarShip + FedEx enricher working
  - ✅ Workers: starshipPoller, fedexEnricher
  - ✅ Registry system in place
  - ✅ Debug endpoint added

- [ ] **Phase 2:** Enable Karrio when deployed
  - Set `ENABLE_KARRIO=1`
  - Implement full `karrio.js` polling logic
  - Test parallel data capture

- [ ] **Phase 3:** Disable StarShip, go Karrio-only
  - Clear `STARSHIP_USER` and `STARSHIP_PASS`
  - Restart SIL
  - Monitor for 24 hours

- [ ] **Phase 4:** Full backend integration (out of scope for SIL)

---

## Troubleshooting

### A worker isn't starting
```bash
# Verify it's enabled
curl http://localhost:3001/api/sil/workers

# Check logs for errors
tail -f sil.log  # or docker-compose logs -f sil
```

### Karrio stub won't connect
This is expected! The `karrio.js` stub tries to reach Karrio but continues even if it fails. Once Karrio is deployed and `KARRIO_API_KEY` is set, it will work.

### Need to add a new worker?
1. Create `workers/myworker.js` with `start()`, `stop()`, `poll()`
2. Add entry to `WORKER_REGISTRY` in `config/workers.js`
3. Set env var to enable it
4. Restart SIL

---

## For More Details
See [MIGRATION.md](MIGRATION.md) for the complete 4-phase plan and environment variable reference.
