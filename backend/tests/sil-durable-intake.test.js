const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const express = require('express');
const fileUpload = require('express-fileupload');
const XLSX = require('xlsx');

// SDK boundary fixtures: independent API instances share remote records, never a local DB.
function remoteFixture() {
  const records = new Map();
  const objects = new Map();
  const state = { records, objects, failRead: false, failWrite: false, failBlob: false };
  const copy = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const snapshot = (key) => ({ exists: records.has(key), data: () => copy(records.get(key)) });
  const apply = (actions) => {
    if (state.failWrite) throw new Error('Injected metadata write failure');
    for (const [operation, ref] of actions) {
      if (operation === 'create' && records.has(ref.path)) throw new Error('Already exists');
      if (operation === 'update' && !records.has(ref.path)) throw new Error('Not found');
    }
    for (const [operation, ref, value] of actions) records.set(ref.path,
      operation === 'update' ? { ...records.get(ref.path), ...copy(value) } : copy(value));
  };
  const doc = (key) => ({
    path: key, collection: (name) => collection(`${key}/${name}`),
    get: async () => { if (state.failRead) throw new Error('Injected metadata read failure'); return snapshot(key); },
    create: async (value) => apply([['create', { path: key }, value]]),
    set: async (value) => apply([['set', { path: key }, value]]),
    update: async (value) => apply([['update', { path: key }, value]]),
  });
  const collection = (prefix, order, direction, count) => ({
    firestore: db,
    doc: (id) => doc(`${prefix}/${id}`),
    orderBy: (field, dir = 'asc') => collection(prefix, field, dir, count),
    limit: (limit) => collection(prefix, order, direction, limit),
    get: async () => {
      if (state.failRead) throw new Error('Injected metadata read failure');
      let rows = [...records].filter(([key, value]) => key.startsWith(`${prefix}/`)
        && key.split('/').length === prefix.split('/').length + 1 && (!order || value[order] !== undefined));
      if (order) rows.sort((a, b) => String(a[1][order]).localeCompare(String(b[1][order])) * (direction === 'desc' ? -1 : 1));
      if (count) rows = rows.slice(0, count);
      return { docs: rows.map(([key]) => snapshot(key)) };
    },
  });
  const db = {
    collection: (name) => collection(name),
    batch: () => {
      const actions = [];
      const batch = { create: (ref, value) => { actions.push(['create', ref, value]); return batch; },
        set: (ref, value) => { actions.push(['set', ref, value]); return batch; }, commit: async () => apply(actions) };
      return batch;
    },
  };
  const bucket = { file: (name, options = {}) => ({
    save: async (bytes, settings) => {
      if (state.failBlob) throw new Error('Injected object write failure');
      assert.equal(settings.preconditionOpts.ifGenerationMatch, 0);
      assert.equal(settings.metadata.cacheControl, 'private, no-store');
      assert.equal(settings.validation, 'crc32c');
      assert.equal(objects.has(name), false);
      objects.set(name, { bytes: Buffer.from(bytes), generation: String(objects.size + 1) });
    },
    getMetadata: async () => [{ generation: objects.get(name)?.generation }],
    download: async () => {
      const object = objects.get(name);
      if (!object || object.generation !== options.generation) throw new Error('Missing object generation');
      return [Buffer.from(object.bytes)];
    },
  }) };
  return { ...state, db, bucket, state };
}

test('durable intake retains ownership, original bytes, queue receipts, and imported records across API instances', async (t) => {
  const fixture = remoteFixture();
  const previousEnv = { ...process.env };
  process.env.SIL_FIRESTORE_PRIMARY_ENABLED = 'true';
  process.env.SIL_FIRESTORE_ENABLED = 'false';
  process.env.SIL_UPLOAD_BUCKET = 'isolated-test-bucket';
  const firestore = require('../dist/src/lib/firestore.js');
  const previousFirestore = firestore.getSilFirestore;
  firestore.getSilFirestore = () => fixture.db;
  const auth = require('../dist/src/lib/firebaseAdmin.js');
  const previousAuth = auth.getSilFirebaseAdminAuth;
  auth.getSilFirebaseAdminAuth = () => ({ app: {} });
  const storagePath = require.resolve('firebase-admin/storage');
  require(storagePath);
  const previousStorage = require.cache[storagePath].exports;
  require.cache[storagePath].exports = { getStorage: () => ({ bucket: (name) => {
    assert.equal(name, 'isolated-test-bucket'); return fixture.bucket;
  } }) };
  const prismaModule = require('../dist/src/lib/prisma.js');
  const previousPrisma = prismaModule.prisma;
  prismaModule.prisma = new Proxy({}, { get: () => { throw new Error('Cloud intake must not access SQLite'); } });
  const servers = [];
  const launch = async () => {
    const app = express();
    app.use(express.json());
    app.use(fileUpload());
    app.use((req, _res, next) => {
      const orgScope = { 'Bearer alpha': 'org-alpha', 'Bearer beta': 'org-beta' }[req.headers.authorization];
      if (orgScope) req.silAuth = { uid: `user-${orgScope}`, orgScope, profile: {} };
      next();
    });
    require('../dist/src/routes/datasources.js').registerDatasourceRoutes(app);
    require('../dist/src/routes/jobs.js').registerJobRoutes(app);
    require('../dist/src/routes/uploads.js').registerUploadRoutes(app);
    app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    servers.push(server);
    const base = `http://127.0.0.1:${server.address().port}`;
    return async (route, org = 'alpha', body) => {
      const headers = { Authorization: `Bearer ${org}` };
      if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
      const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers,
        body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
  };
  const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.body)); return result.body; };
  const csv = 'customer,origin_city,origin_state,destination_city,destination_state,carrier,median_rate\nExample,Detroit,MI,Columbus,OH,Shared Carrier,1234\n';
  const form = (source, bytes = csv, name = 'same-name.csv') => {
    const body = new FormData();
    body.append('dataSourceId', source);
    body.append('orgScope', 'forged');
    body.append('file', new Blob([bytes], { type: 'application/octet-stream' }), name);
    return body;
  };
  const mapping = { customerName: 'customer', originCity: 'origin_city', originState: 'origin_state',
    destinationCity: 'destination_city', destinationState: 'destination_state', carrierName: 'carrier', medianRate: 'median_rate' };
  try {
    const a = await launch();
    const sources = {};
    const uploads = {};
    const jobs = {};
    await t.test('cloud writes persist server ownership without leaking storage addresses', async () => {
      for (const org of ['alpha', 'beta']) {
        sources[org] = ok(await a('/api/datasources', org, { name: 'Test', type: 'csv_excel', orgScope: 'forged' }), 201).id;
        uploads[org] = ok(await a('/api/ingest/upload', org, form(sources[org])), 201).uploads[0];
        assert.equal(uploads[org].orgScope, `org-${org}`);
        assert.equal(uploads[org].uploadedBy, `user-org-${org}`);
        assert.match(uploads[org].sha256, /^[a-f0-9]{64}$/);
        assert.equal(uploads[org].storedPath, undefined);
        assert.equal(uploads[org].storageGeneration, undefined);
        jobs[org] = ok(await a('/api/jobs', org, { type: 'datasource_import', payload: { dataSourceRef: sources[org], rows: [['nested', 'JSON']] } }), 201);
        assert.equal(jobs[org].status, 'queued');
      }
      assert.notEqual(uploads.alpha.id, uploads.beta.id);
      assert.equal(fixture.objects.size, 2);
    });
    await new Promise((resolve) => servers[0].close(resolve));
    delete require.cache[require.resolve('../dist/src/services/intake/intakeStore.js')];
    delete require.cache[require.resolve('../dist/src/routes/jobs.js')];
    const b = await launch();
    await t.test('fresh API instance reads profiles, previews, and queued jobs; another tenant cannot', async () => {
      for (const org of ['alpha', 'beta']) {
        assert.deepEqual(ok(await b('/api/datasources', org)).map((source) => source.id), [sources[org]]);
        const queued = ok(await b('/api/jobs', org));
        assert.deepEqual(queued.map((job) => job.id), [jobs[org].id]);
        assert.deepEqual(queued[0].payload, jobs[org].payload);
        assert.equal(queued[0].payloadJson, undefined);
        const preview = ok(await b(`/api/ingest/uploads/${uploads[org].id}/preview`, org));
        assert.equal(preview.rows[0].customer, 'Example');
        assert.equal(preview.upload.storedPath, undefined);
      }
      for (const action of ['preview', 'import-loads', 'import-carriers', 'import-lane-rates']) {
        ok(await b(`/api/ingest/uploads/${uploads.beta.id}/${action}`, 'alpha', action === 'preview' ? undefined : { mapping }), 404);
      }
      const count = fixture.objects.size;
      ok(await b('/api/ingest/upload', 'alpha', form(sources.beta)), 404);
      ok(await b('/api/jobs', 'alpha', { type: 'sync', payload: { dataSourceRef: sources.beta } }), 404);
      assert.equal(fixture.objects.size, count);
    });
    const persistence = require('../dist/src/services/shipmentIntelligence/silPersistenceService.js');
    await t.test('all mapped import targets and load updates use durable tenant-scoped records', async () => {
      for (const org of ['alpha', 'beta']) {
        for (const action of ['import-loads', 'import-carriers', 'import-lane-rates']) {
          const result = ok(await b(`/api/ingest/uploads/${uploads[org].id}/${action}`, org, { mapping, workspaceId: 'forged' }), 201);
          assert.equal(result.importedCount, 1, JSON.stringify(result));
          assert.equal(result.imported[0].workspaceId, `org-${org}`);
        }
        const filters = { workspaceId: `org-${org}` };
        for (const list of [persistence.listSilLoads, persistence.listSilCarriers, persistence.listSilLanes, persistence.listSilMarketRates]) {
          const rows = await list(filters);
          assert.equal(rows.length, 1);
          assert.equal(rows[0].workspaceId, filters.workspaceId);
        }
        assert.equal((await persistence.listPersistedWorkflowEvents(filters)).length, 2);
      }
      const [load] = await persistence.listSilLoads({ workspaceId: 'org-alpha' });
      assert.equal(await persistence.getSilLoad(load.loadId, 'org-beta'), null);
      await persistence.updateSilLoadStatus(load.loadId, 'READY_TO_POST', 'org-alpha');
      assert.equal((await persistence.getSilLoad(load.loadId, 'org-alpha')).status, 'READY_TO_POST');
      const repeated = ok(await b(`/api/ingest/uploads/${uploads.alpha.id}/import-loads`, 'alpha', { mapping }), 201);
      assert.equal(repeated.importedCount, 0);
      assert.equal(repeated.skippedCount, 1);
      assert.deepEqual(await persistence.listSilLoads({ workspaceId: 'empty-org' }), []);
      await assert.rejects(persistence.listSilLoads(), /organization scope/);
    });
    await t.test('Excel previews read stored original bytes without a local file', async () => {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['customer'], ['Excel Customer']]), 'Import');
      const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      const upload = ok(await b('/api/ingest/upload', 'alpha', form(sources.alpha, bytes, 'book.xlsx')), 201).uploads[0];
      const preview = ok(await b(`/api/ingest/uploads/${upload.id}/preview`));
      assert.equal(preview.format, 'EXCEL');
      assert.equal(preview.sheetName, 'Import');
      assert.equal(preview.rows[0].customer, 'Excel Customer');
    });
    await t.test('failed storage, corrupt bytes, and invalid cloud configuration fail closed', async () => {
      fixture.state.failRead = true;
      ok(await b('/api/ingest/uploads'), 500);
      await assert.rejects(persistence.listSilLoads({ workspaceId: 'org-alpha' }), /read failure/);
      fixture.state.failRead = false;
      const before = fixture.records.size;
      fixture.state.failBlob = true;
      ok(await b('/api/ingest/upload', 'alpha', form(sources.alpha)), 500);
      assert.equal(fixture.records.size, before);
      fixture.state.failBlob = false;
      fixture.state.failWrite = true;
      ok(await b('/api/ingest/upload', 'alpha', form(sources.alpha)), 500);
      assert.equal(fixture.records.size, before);
      const failed = ok(await b(`/api/ingest/uploads/${uploads.alpha.id}/import-loads`, 'alpha', { mapping, allowDuplicates: true }), 201);
      assert.equal(failed.importedCount, 0);
      assert.equal(failed.rejectedCount, 1);
      assert.equal(fixture.records.size, before);
      fixture.state.failWrite = false;
      const store = require('../dist/src/services/intake/intakeStore.js');
      const storage = require('../dist/src/services/intake/uploadStorage.js');
      const stored = await store.findIntakeUpload('org-alpha', uploads.alpha.id);
      await assert.rejects(storage.readUploadBytes('org-beta', stored), /provenance/);
      fixture.objects.get(stored.storedPath).bytes = Buffer.from('tampered');
      ok(await b(`/api/ingest/uploads/${uploads.alpha.id}/preview`), 500);
      delete process.env.SIL_UPLOAD_BUCKET;
      assert.throws(store.assertIntakeStorageConfigured, /SIL_UPLOAD_BUCKET/);
      process.env.SIL_FIRESTORE_PRIMARY_ENABLED = 'false';
      process.env.K_SERVICE = 'test-cloud-run';
      assert.throws(store.assertIntakeStorageConfigured, /Firestore primary/);
    });
  } finally {
    for (const server of servers) if (server.listening) await new Promise((resolve) => server.close(resolve));
    firestore.getSilFirestore = previousFirestore;
    auth.getSilFirebaseAdminAuth = previousAuth;
    require.cache[storagePath].exports = previousStorage;
    prismaModule.prisma = previousPrisma;
    for (const name of Object.keys(process.env)) if (!(name in previousEnv)) delete process.env[name];
    Object.assign(process.env, previousEnv);
  }
});
