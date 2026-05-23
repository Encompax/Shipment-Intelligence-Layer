# StarShip → Karrio Migration Guide

## Overview

This document outlines the 4-phase migration path from StarShip to Karrio, an open-source shipping platform. The SIL (Shipment Intelligence Layer) has been designed to support this gradual transition without disrupting the current system.

**Key principle:** Each phase is production-ready before moving to the next.

---

## Architecture Decisions

### Multi-Source Support
The `shipments` table includes a `source` column (default: 'starship') to track which platform provided each record. This allows:
- **Phase 1-3:** Both StarShip and Karrio running simultaneously
- **Phase 4:** Seamless switch to Karrio-only
- **Audit trail:** Always know where each shipment record originated

### Worker Registry
All workers (StarShip poller, FedEx enricher, future Karrio, etc.) are pluggable via `config/workers.js`. This provides:
- Declarative worker configuration
- Environment variable-based feature flags
- Easy enable/disable without code changes
- Standardized lifecycle (start/stop/poll)

### Database Schema Compatibility
- `fedex_events` table already exists with all needed fields
- Multi-carrier tracking (FedEx, UPS, USPS, DHL support) via Karrio
- `capture_state` table tracks poll history per worker

---

## Migration Phases

### Phase 1: Current State ✅ (Now)
**Status:** Production

- StarShip is the only active shipment source
- `starshipPoller.js` polls `http://shipping-system.local:180/Setup/GetMaintainData`
- FedEx enricher adds tracking events (read-only)
- Encompax SIL is purely an observer—does not modify StarShip data
- React dashboard queries the local SQLite database

**Environment:**
```
STARSHIP_USER=<credentials>
STARSHIP_PASS=<credentials>
STARSHIP_BASE_URL=http://shipping-system.local:180
FEDEX_CLIENT_ID=<credentials>
FEDEX_CLIENT_SECRET=<credentials>
```

**Active workers:** `starshipPoller`, `fedexEnricher`

---

### Phase 2: Karrio Parallel Run (Soon)
**Status:** Stage before cutover

**What happens:**
1. **Karrio is deployed** on your LAN (Docker Compose or VM)
   - Pull: `git clone https://github.com/karrioapi/karrio.git`
   - Set up admin user, API key, and carrier accounts (FedEx, UPS, USPS, DHL, LTL)
   - Integrate Karrio's label generation and rate shopping (optional, out-of-scope for SIL)

2. **`karrio.js` worker is activated** to poll Karrio in parallel
   - Runs on the same SIL interval (configurable)
   - Records shipments to `shipments` table with `source = 'karrio'`
   - Both StarShip and Karrio shipments coexist in the database

3. **Dashboard shows all shipments** from both sources
   - New shipments go to Karrio (manual routing or via main backend)
   - Legacy StarShip shipments continue to be observed

4. **Testing period:** 2-4 weeks
   - Validate Karrio capturing shipments correctly
   - Verify FedEx enricher works with Karrio shipments
   - Test dashboard filtering and metrics

**Enable Karrio worker:**
```bash
# Add to .env
ENABLE_KARRIO=1
KARRIO_API_KEY=<token from Karrio admin>
KARRIO_BASE_URL=http://karrio:8000/api  # or wherever Karrio is hosted
KARRIO_POLL_INTERVAL_MS=300000  # 5 minutes
```

**Activate:**
```bash
# Restart SIL
npm restart  # or docker-compose restart
# Check logs: both workers should start
# Verify: GET http://localhost:3001/api/sil/workers
```

**Active workers:** `starshipPoller`, `fedexEnricher`, `karrio`

---

### Phase 3: Cutover — New Shipments → Karrio
**Status:** Production with planned downtime

**What happens:**
1. **Last poll from StarShip** (confirm no backlog)
2. **Disable StarShip poller** (set `STARSHIP_USER` and `STARSHIP_PASS` to empty or unset)
3. **Main backend routes NEW shipments to Karrio** instead of StarShip
   - Old shipments remain in DB (read-only history)
   - New shipments recorded with `source = 'karrio'`
4. **FedEx enricher** continues working (remains active)
5. **Dashboard remains unchanged** — filters still work across both sources

**Timeline:**
- `10 AM`: notify team, confirm Karrio is running
- `10:10 AM`: disable StarShip poller in .env
- `10:15 AM`: restart SIL, verify logs
- `10:20 AM`: route first test shipment to Karrio via main backend
- `10:30 AM`: confirm metrics and enrichment: `GET /api/sil/metrics?from=2026-03-12&to=2026-03-12`

**Disable StarShip:**
```bash
# Edit .env
# STARSHIP_USER=  (leave empty)
# STARSHIP_PASS=  (leave empty)

# Restart SIL
npm restart
# Check logs: starshipPoller should show "STARSHIP_USER/PASS not set — StarShip poller disabled"
```

**Verify Karrio is capturing:**
```bash
# GET /api/sil/live-feed
# Should show recent shipments with source='karrio'

# GET /api/sil/worker-status
# Should show karrio last_run time is recent
```

**Active workers:** `fedexEnricher`, `karrio` (starshipPoller disabled)

---

### Phase 4: Direct Karrio Integration (Long-term)
**Status:** Post-SIL, native integration

**What happens:**
1. **Main backend integrates Karrio directly** (no SIL needed)
   - Backend calls Karrio API for label generation, rate shopping, tracking
   - SIL becomes optional/monitoring layer
   - Faster feedback loop (no batch polling)

2. **SIL becomes monitoring/audit layer** (optional)
   - Can query Karrio for historical validation
   - Health checks and metrics
   - Could add webhook listener for real-time updates

3. **StarShip data archived** (rows remain in DB for history)

**Scope:** Outside this document (main backend team)

---

## Implementation Checklist

### Phase 1 ✅
- [x] StarShip poller created (`workers/starshipPoller.js`)
- [x] FedEx enricher created (`workers/fedexEnricher.js`)
- [x] Database schema initialized (`db/schema.js`)
- [x] Worker registry created (`config/workers.js`)
- [x] Multi-worker support in `index.js`
- [x] Debug endpoint `/api/sil/workers` added

### Phase 2 (Upcoming)
- [ ] **Deploy Karrio** (IT team)
  - [ ] Docker Compose or VM setup
  - [ ] Admin user created
  - [ ] API key generated
  - [ ] Carrier accounts configured (FedEx, UPS, USPS, DHL)
  - [ ] Test label generation and rate shopping
  
- [ ] **Implement `karrio.js` polling**
  - [ ] Replace stub with full shipment fetch logic
  - [ ] Implement Karrio → `shipments` table mapping
  - [ ] Implement tracking event parsing (if Karrio provides webhook)
  
- [ ] **Test multi-source dashboard**
  - [ ] Verify metrics endpoint works with mixed sources
  - [ ] Test filtering by carrier
  - [ ] Test exception reporting
  
- [ ] **Staged deployment**
  - [ ] Set `ENABLE_KARRIO=1` in staging first
  - [ ] Run parallel polling for 2-4 weeks
  - [ ] Validate data quality and enrichment

### Phase 3 (Cutover)
- [ ] **Finalize main backend Karrio integration** (partial)
  - [ ] Route new shipments to Karrio API
  - [ ] Test label generation flow
  - [ ] Test tracking reconciliation
  
- [ ] **Disable StarShip poller**
  - [ ] Set `STARSHIP_USER` and `STARSHIP_PASS` to empty
  - [ ] Confirm SIL logs show "StarShip poller disabled"
  - [ ] Verify Karrio worker is still running
  
- [ ] **Monitor cutover**
  - [ ] Watch error logs for 24 hours
  - [ ] Verify FedEx enrichment continues
  - [ ] Confirm dashboard metrics are accurate

### Phase 4 (Post-SIL)
- [ ] **Full Karrio integration in main backend**
  - [ ] Remove direct StarShip integration
  - [ ] Call Karrio API for shipping operations
  - [ ] Implement webhook listener for real-time updates (optional)
  
- [ ] **Archive or decommission SIL?** (team decision)
  - [ ] Keep as read-only monitoring layer
  - [ ] Decommission entirely
  - [ ] Migrate dashboard directly to Karrio API

---

## Environment Variables Reference

### Phase 1 (Current)
```env
# StarShip poller
STARSHIP_USER=<username>
STARSHIP_PASS=<password>
STARSHIP_BASE_URL=http://shipping-system.local:180

# FedEx enricher
FEDEX_CLIENT_ID=<client_id>
FEDEX_CLIENT_SECRET=<client_secret>

# Database
SIL_DB_PATH=./db/sil.db
SIL_PORT=3001
SIL_HOST=0.0.0.0
```

### Phase 2 (Add to above)
```env
# Karrio worker
ENABLE_KARRIO=1
KARRIO_API_KEY=<api_key>
KARRIO_BASE_URL=http://karrio:8000/api
KARRIO_POLL_INTERVAL_MS=300000  # optional, default 5 min
```

### Phase 3+ (Remove StarShip)
```env
# StarShip disabled
STARSHIP_USER=
STARSHIP_PASS=

# Karrio remains active
ENABLE_KARRIO=1
KARRIO_API_KEY=<api_key>
KARRIO_BASE_URL=http://karrio:8000/api
```

---

## Monitoring & Debugging

### Check running workers:
```bash
curl http://localhost:3001/api/sil/workers
```

**Response:**
```json
{
  "running": ["starshipPoller", "fedexEnricher"],
  "registry": [
    {
      "workerId": "starshipPoller",
      "enabled": true,
      "description": "StarShip passive poller...",
      "source": "starship"
    },
    ...
  ],
  "timestamp": "2026-03-12T12:34:56.789Z"
}
```

### Check worker execution history:
```bash
curl http://localhost:3001/api/sil/worker-status
```

**Response:**
```json
{
  "workers": [
    { "worker": "starshipPoller", "last_run": "2026-03-12T12:30:15.000Z", "records_last_run": 1250 },
    { "worker": "fedexEnricher", "last_run": "2026-03-12T12:29:45.000Z", "records_last_run": 89 },
    ...
  ]
}
```

### View current shipments by source:
```bash
# From SQLite
sqlite3 db/sil.db "SELECT source, COUNT(*) FROM shipments GROUP BY source;"

# Or from dashboard API
curl http://localhost:3001/api/sil/metrics?from=2026-03-10&to=2026-03-12
```

### Check SIL logs:
```bash
# If running locally
tail -f sil.log

# If running in Docker
docker-compose logs -f sil
```

---

## Troubleshooting

### Karrio worker won't start (Phase 2+)
```
[SIL] Cannot start karrio: missing env vars [KARRIO_API_KEY, KARRIO_BASE_URL]
```
**Fix:** Ensure `ENABLE_KARRIO=1` and both API vars are set in `.env`

### FedEx enrichment stops after Karrio cutover
**Likely cause:** FedEx worker crashed due to database lock
**Fix:** Restart SIL: `npm restart`

### StarShip data won't stop polling after disabling
**Problem:** Forgot to unset `STARSHIP_USER` or `STARSHIP_PASS`
**Fix:** Remove from `.env` and restart: `npm restart`

### Metric queries return no results after cutover
**Likely cause:** Date range doesn't include any Karrio records
**Fix:** Query with dates after Karrio went live: `/api/sil/metrics?from=2026-03-15`

---

## References

- **Karrio GitHub:** https://github.com/karrioapi/karrio
- **Karrio Docs:** https://docs.karrio.io
- **Karrio Docker:** https://hub.docker.com/r/karrioapi/karrio
- **FedEx REST API:** https://developer.fedex.com/api/en-us/get-started.html
- **SIL Source:** `backend/sil/`

---

## Questions?

Contact the Encompax team. This document should be updated as migration progresses.
