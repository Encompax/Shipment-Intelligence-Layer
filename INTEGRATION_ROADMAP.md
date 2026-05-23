# Integration Architecture & Roadmap

## Overview

Encompax will become a **unified data hub** by integrating APIs from your existing platforms (Paycom, Dynamics GP, Velocity, Microsoft, and LEAN Operating System tooling) and syncing relevant metrics into a normalized database. The frontend dashboard then displays these metrics as trending cards and customizable widgets.

---

## Strategic Value

### Why Integrate APIs?

1. **Eliminate Data Silos** 
   - Currently: Users context-switch between Paycom, GP, Velocity, and LEAN operating system tools
   - Future: One dashboard with all critical metrics
   
2. **Real-Time Insights**
   - Paycom → Headcount alerts when someone leaves
   - Dynamics GP → Revenue updates as orders close
   - Velocity → OEE changes with every shift report
   - LEAN Operating System → Daily management and kaizen status updates

3. **Cross-Functional Visibility**
   - Finance sees production delays (Velocity) affecting revenue forecasts (GP)
   - HR sees production needs (Velocity) and opens req in Paycom
   - Ops sees customer satisfaction (GP) tied to delivery performance (SIL tracking)

4. **Reduced Manual Labor**
   - No copy/paste; no manual dashboard updates
   - Single source of truth = compliance-ready

5. **Audit Trail**
   - Metric history: when did score drop? when did headcount change?
   - Linked to official systems (not manual entry)

---

## Target Integrations

### Phase 1 (Now) — Foundation
- **SIL + carrier tracking** ✅ (configurable)
- Shipment Intelligence feeds dashboard

### Phase 2 (Next 1-2 months) — Core Business
- **Dynamics GP** (highest ROI)
  - Customers, Orders, Revenue, AR Aging
  - Key metrics: Total AR, days overdue, customer OTIF
  
- **Paycom** (HR Visibility)
  - Headcount, Turnover, Cost per Employee, Open Reqs
  - Alerts: New hires, separations, anniversaries

### Phase 3 (2-3 months) — Operations & Goals
- **Velocity** (Production Metrics)
  - OEE, Changeovers, WIP, Schedule Attainment
  - Real-time floor data on executive dashboard

- **LEAN Operating System**
  - Daily management, standard work, kaizen, problem-solving boards
  - Sync operational health and continuous improvement signals

### Phase 4 (3+ months) — Communication & Insights
- **Microsoft Graph** (Teams, Outlook, Excel)
  - Shared Excel as data source (e.g., sales forecasts)
  - Teams channel notifications (opt-in alerts)
  - File-based data ingestion for ad-hoc reporting

---

## Architecture

### Integration Registry (Backend)

Similar to the SIL worker registry, but for data integrations:

```javascript
// backend/config/integrations.js
const INTEGRATION_REGISTRY = {
  paycom: {
    name: 'Paycom HR',
    enabled: !!process.env.PAYCOM_API_KEY,
    requiredEnvVars: ['PAYCOM_API_KEY', 'PAYCOM_COMPANY_ID'],
    syncInterval: 3600000, // 1 hour
    metrics: ['headcount', 'turnover', 'cost_per_employee'],
  },
  
  dynamics_gp: {
    name: 'Dynamics GP',
    enabled: !!process.env.GP_API_KEY,
    requiredEnvVars: ['GP_API_KEY', 'GP_TENANT_ID'],
    syncInterval: 1800000, // 30 min
    metrics: ['total_ar', 'days_overdue', 'revenue_mtd', 'customer_otif'],
  },
  
  velocity: {
    name: 'Velocity Production',
    enabled: !!process.env.VELOCITY_API_KEY,
    requiredEnvVars: ['VELOCITY_API_KEY', 'VELOCITY_FACILITY_ID'],
    syncInterval: 300000, // 5 min (real-time floor data)
    metrics: ['oee', 'changeovers', 'wip_count', 'schedule_attainment'],
  },
  
  lean_ops: {
    name: 'LEAN Operating System',
    enabled: process.env.LEAN_OPS_ENABLED === 'true',
    requiredEnvVars: ['LEAN_OPS_ENABLED'],
    syncInterval: 3600000, // 1 hour
    metrics: ['daily_management_health', 'kaizen_open_count', 'standard_work_adherence'],
  },
  
  // ... more integrations
};
```

### Metric Normalization Layer

Each integration syncs to a unified **`metrics`** table:

```sql
CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  source TEXT NOT NULL,              -- 'paycom', 'gp', 'velocity', etc.
  metric_key TEXT NOT NULL,           -- 'headcount', 'oee', 'revenue_mtd'
  
  value REAL,                         -- numeric value
  value_text TEXT,                    -- or text (e.g., 'On Track')
  
  timestamp TEXT DEFAULT (datetime('now')),
  synced_at TEXT,
  
  metadata JSON,                      -- source-specific data (department, location, etc)
  
  UNIQUE(source, metric_key, timestamp)
);

-- Example rows:
-- (paycom, headcount, 127, 2026-03-12T14:30:00Z)
-- (gp, total_ar, 2450000, 2026-03-12T14:00:00Z)
-- (velocity, oee, 0.87, 2026-03-12T14:25:15Z)
```

### Worker Pattern (Similar to SIL)

Each integration runs as a background job:

```javascript
// backend/workers/paycom-syncer.js
class PaycomSyncer extends Worker {
  async poll() {
    const employees = await this.fetchPaycomEmployees();
    const metrics = this.normalizeToMetrics(employees);
    this.saveMetrics(metrics);
  }
  
  normalizeToMetrics(employees) {
    return {
      sources: 'paycom',
      metrics: [
        { metric_key: 'headcount', value: employees.length },
        { metric_key: 'turnover_ytd', value: employees.filter(e => e.separated).length },
        { metric_key: 'cost_per_employee', value: totalPayroll / employees.length },
      ]
    };
  }
}
```

---

## Frontend Enhancement

### 1. Metrics Widget System

Each dashboard card becomes a **metric component**:

```jsx
<MetricCard 
  source="paycom"
  metricKey="headcount"
  title="Headcount"
  trend={true}                // Show 7-day trend
  format="number"             // 127 ↑ +2 this week
/>
```

### 2. Customizable Dashboard Builder

**Data Sources Tab** becomes **Dashboard Editor**:
- Drag-and-drop widgets
- Suggestion engine (most-viewed metrics by role)
- Save as "My Dashboard" (per-user storage)
- Pre-built templates (Finance, Operations, Executive)

### 3. Trending Sparklines

In overview cards, show 7-day mini charts:
```
Sales:           [===↗===]  $425K  +$15K
Headcount:       [===↘===]  127    -2
OEE:             [===→===]  87%    -1%
OTIF:            [==↗====]  92%    +3%
```

### 4. Database for Dashboard Layouts

```sql
CREATE TABLE dashboard_layouts (
  id INTEGER PRIMARY KEY,
  user_id TEXT,              -- or team_id for shared dashboards
  name TEXT,                 -- "My Finance Dashboard"
  is_default BOOLEAN,
  
  widgets JSON,              -- Array of { source, metricKey, position, size }
  created_at TEXT,
  updated_at TEXT
);
```

---

## Implementation Roadmap

### Phase 2 Checklist

- [ ] Create integration registry (`backend/config/integrations.js`)
- [ ] Create base integration worker class
- [ ] Implement Dynamics GP integration
  - [ ] Fetch customers, orders, revenue
  - [ ] Normalize to metrics table
  - [ ] Handle pagination & error retries
- [ ] Implement Paycom integration
  - [ ] Fetch employees, headcount, turnover
  - [ ] Parse compensation for cost calculations
- [ ] Create `metrics` table schema
- [ ] Create `/api/metrics` endpoint (query by source, key, date range)
- [ ] Frontend: MetricCard component (displays value + trend)
- [ ] Frontend: Sample widget grid showing metrics

### Phase 3+

- [ ] Velocity integration (real-time OEE, WIP)
- [ ] LEAN Operating System integration (daily management, kaizen)
- [ ] Dashboard builder UI
- [ ] User dashboard layouts (saved preferences)
- [ ] Webhook listeners (real-time push from integrations)

---

## Security & Best Practices

### API Key Management
```env
# .env
PAYCOM_API_KEY=sk_live_...           # Encrypted in vault
DYNAMICS_GP_API_KEY=...             # Scoped to read-only
VELOCITY_API_KEY=...
LEAN_OPS_ENABLED=true

# No keys in git; use GitHub Secrets or vault
```

### Scoped Permissions
- **Read-only** for each integration
- Request minimum set of fields needed
- Example: Paycom → only `headcount`, `termination_date`, not SSN or Bank info

### Audit Logging
```sql
CREATE TABLE integration_audits (
  id INTEGER PRIMARY KEY,
  integration TEXT,
  action TEXT,          -- 'sync_started', 'sync_complete', 'sync_failed'
  status TEXT,          -- 'success', 'error'
  records_synced INTEGER,
  error_message TEXT,
  timestamp TEXT
);
```

### Rate Limiting
- Paycom: 100 req/min per API key
- GP: 300 req/min per API
- Velocity: Check docs (likely real-time)
- LEAN Ops: Internal service — batch when possible

---

## Database Schema (Phase 2)

```sql
-- Metrics table (unnormalized for fast queries)
CREATE TABLE metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  value REAL,
  value_text TEXT,
  timestamp TEXT DEFAULT (datetime('now')),
  metadata JSON,
  
  UNIQUE(source, metric_key, timestamp)
);

-- Index for fast lookups
CREATE INDEX idx_metrics_source_key_timestamp 
  ON metrics(source, metric_key, timestamp DESC);

-- Integration state (track last sync)
CREATE TABLE integration_state (
  source TEXT PRIMARY KEY,
  last_sync TEXT,
  last_error TEXT,
  next_sync TEXT,
  record_count INTEGER
);

-- User dashboard preferences
CREATE TABLE dashboard_layouts (
  id INTEGER PRIMARY KEY,
  user_id TEXT,
  name TEXT,
  is_default BOOLEAN,
  widgets JSON,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

---

## Example API Endpoints (Phase 2)

```javascript
// Get latest metrics for a specific source
GET /api/metrics/$source
// → { paycom: { headcount: 127, turnover_ytd: 5 } }

// Get metrics for date range
GET /api/metrics/$source/$metricKey?from=2026-03-01&to=2026-03-12
// → [ { timestamp: ..., value: 125 }, { timestamp: ..., value: 126 }, ... ]

// Get trending (last 7 days, 14 days, 30 days)
GET /api/metrics/trending?period=7d
// → { paycom: { headcount: { current: 127, prev: 125, change: +2 } }, ... }

// Save user dashboard layout
POST /api/dashboards
Body: { name: "My Dashboard", widgets: [...] }

// Get saved dashboard
GET /api/dashboards/:id
```

---

## CLI to Debug Integrations

```bash
# Check integration status
npm run inspect:integrations

# Manual sync (for testing)
npm run sync:paycom --force
npm run sync:gp --force

# View metrics
npm run query:metrics --source=paycom --metric=headcount
```

---

## Questions to Clarify

1. **Authentication Method:**
   - Paycom: OAuth or API key?
   - GP: Windows auth, SQL, or REST API?
   - Velocity: REST, GraphQL, or database connection?
   - LEAN Ops: internal service, REST or database?

2. **Real-Time vs Scheduled:**
   - Paycom/GP: Hourly sync? (data doesn't change constantly)
   - Velocity: 5-minute pull? Or subscribe to production events?
   - LEAN Ops: Daily/weekly (less volatile)?

3. **Data Retention:**
   - Keep all historical metrics (data warehouse)?
   - Or just last 90 days?
   - Aggregate for Tableau/Power BI eventually?

4. **Permissions:**
   - Should all metrics be visible to all users?
   - Or role-based (Finance sees AR, Ops sees OEE)?

---

## Next Steps

1. **Gather API Documentation** for each platform
2. **Decide on Phase 2 priority** (GP or Paycom first?)
3. **Set up secure vault** for API keys
4. **Create stub integration modules** to test connection
5. **Build metrics table** in database
6. **Create first `/api/metrics` endpoint**
7. **Build MetricCard component** in frontend

Would you like me to start implementing Phase 2? I'd recommend starting with **Dynamics GP** (highest business ROI) or **Paycom** (quickest win, HR is universally important).
