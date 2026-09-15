const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { once } = require('node:events');
const { PrismaClient } = require('@prisma/client');
const express = require('express');
const fileUpload = require('express-fileupload');

test('intake isolates authenticated organizations and preserves unowned legacy records', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sil-intake-tenancy-'));
  const databasePath = path.join(directory, 'test.db');
  const previousUploadDir = process.env.UPLOAD_DIR;
  const previousMirror = process.env.SIL_FIRESTORE_ENABLED;
  const previousPrimary = process.env.SIL_FIRESTORE_PRIMARY_ENABLED;
  process.env.UPLOAD_DIR = directory;
  process.env.SIL_FIRESTORE_ENABLED = 'false';
  process.env.SIL_FIRESTORE_PRIMARY_ENABLED = 'false';
  let prisma;
  let server;
  let originalPrisma;
  let prismaModule;
  try {
    const database = new DatabaseSync(databasePath);
    try {
      const migrations = path.join(__dirname, '../prisma/migrations');
      for (const migration of fs.readdirSync(migrations).filter((name) => fs.statSync(path.join(migrations, name)).isDirectory()).sort()) {
        if (migration === '20260914120000_scope_sil_intake') {
          database.exec(`
            INSERT INTO Datasource (id, name, type, updatedAt) VALUES ('legacy-source', 'Legacy', 'csv_excel', CURRENT_TIMESTAMP);
            INSERT INTO Job (id, dataSourceId, status, updatedAt) VALUES (900, 19, 'Completed', CURRENT_TIMESTAMP);
            INSERT INTO Upload (id, jobId, originalName, storedPath, sizeBytes, contentType)
              VALUES (900, 900, 'private.csv', '/must-not-read', 10, 'text/csv');
          `);
        }
        database.exec(fs.readFileSync(path.join(migrations, migration, 'migration.sql'), 'utf8'));
      }
      assert.equal(database.prepare('SELECT orgScope FROM Datasource WHERE id = ?').get('legacy-source').orgScope, null);
      assert.equal(database.prepare('SELECT orgScope FROM Job WHERE id = 900').get().orgScope, null);
    } finally {
      database.close();
    }

    prisma = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replaceAll('\\', '/')}` } } });
    prismaModule = require('../dist/src/lib/prisma.js');
    originalPrisma = prismaModule.prisma;
    prismaModule.prisma = prisma;
    const persistence = require('../dist/src/services/shipmentIntelligence/silPersistenceService.js');
    const app = express();
    app.use(express.json());
    app.use(fileUpload());
    // Only this local fixture maps synthetic tokens to already-verified identities.
    app.use((req, _res, next) => {
      const orgScope = { 'Bearer test-alpha': 'org-alpha', 'Bearer test-beta': 'org-beta' }[req.headers.authorization];
      if (orgScope) req.silAuth = { uid: `user-${orgScope}`, orgScope, profile: {} };
      next();
    });
    require('../dist/src/routes/datasources.js').registerDatasourceRoutes(app);
    require('../dist/src/routes/jobs.js').registerJobRoutes(app);
    require('../dist/src/routes/uploads.js').registerUploadRoutes(app);
    app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = async (route, org, body, method = body === undefined ? 'GET' : 'POST') => {
      const headers = {};
      if (org) headers.Authorization = `Bearer test-${org}`;
      if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
      const response = await fetch(base + route, {
        method, headers, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    const expectStatus = (result, expected) => assert.equal(result.status, expected, JSON.stringify(result.body));
    const csv = 'customer,origin_city,origin_state,destination_city,destination_state,carrier,median_rate\nExample,Detroit,MI,Columbus,OH,Shared Carrier,1234\n';
    const upload = (source, org, contents = csv) => {
      const form = new FormData();
      form.append('dataSourceId', source);
      form.append('orgScope', 'attacker-supplied-scope');
      form.append('file', new Blob([contents], { type: 'text/csv' }), 'same-name.csv');
      return request('/api/ingest/upload', org, form);
    };
    const mappings = {
      customerName: 'customer', originCity: 'origin_city', originState: 'origin_state',
      destinationCity: 'destination_city', destinationState: 'destination_state',
      carrierName: 'carrier', medianRate: 'median_rate',
    };

    await t.test('missing verified scope fails closed on reads and writes', async () => {
      for (const route of ['/api/datasources', '/api/jobs', '/api/ingest/uploads', '/api/ingest/uploads/900/preview']) {
        expectStatus(await request(route), 403);
      }
      for (const route of ['/api/datasources', '/api/jobs', '/api/ingest/upload', '/api/ingest/uploads/900/import-loads', '/api/ingest/uploads/900/import-carriers', '/api/ingest/uploads/900/import-lane-rates']) {
        expectStatus(await request(route, null, { orgScope: 'org-alpha' }), 403);
      }
    });

    const sources = {};
    const uploads = {};
    await t.test('new records take server scope and exact validated source ownership', async () => {
      for (const org of ['alpha', 'beta']) {
        const result = await request('/api/datasources', org, { name: org, type: 'csv_excel', orgScope: 'org-foreign' });
        expectStatus(result, 201);
        assert.equal(result.body.orgScope, `org-${org}`);
        sources[org] = result.body.id;
        const uploaded = await upload(sources[org], org);
        expectStatus(uploaded, 201);
        assert.equal(uploaded.body.orgScope, `org-${org}`);
        assert.equal(uploaded.body.dataSourceRef, sources[org]);
        uploads[org] = uploaded.body.uploads[0];
      }
      assert.notEqual(uploads.alpha.storedPath, uploads.beta.storedPath);
      const filesBefore = fs.readdirSync(directory).sort();
      for (const source of [sources.beta, 'legacy-source', 'missing-source']) {
        expectStatus(await upload(source, 'alpha'), 404);
      }
      assert.deepEqual(fs.readdirSync(directory).sort(), filesBefore);
    });

    await t.test('lists and guessed upload IDs never expose another organization or legacy data', async () => {
      for (const org of ['alpha', 'beta']) {
        const foreignOrg = org === 'alpha' ? 'beta' : 'alpha';
        assert.deepEqual((await request('/api/datasources', org)).body.map((source) => source.id), [sources[org]]);
        assert.deepEqual((await request('/api/ingest/uploads', org)).body.uploads.map((row) => row.id), [uploads[org].id]);
        const ownPreview = await request(`/api/ingest/uploads/${uploads[org].id}/preview`, org);
        expectStatus(ownPreview, 200);
        assert.equal(ownPreview.body.rows[0].customer, 'Example');
        for (const id of [uploads[foreignOrg].id, 900, 999999, 'invalid', '-1']) {
          for (const action of ['preview', 'import-loads', 'import-carriers', 'import-lane-rates']) {
            const result = await request(`/api/ingest/uploads/${id}/${action}`, org, action === 'preview' ? undefined : { mapping: mappings });
            expectStatus(result, 404);
            assert.deepEqual(result.body, { error: 'Upload not found' });
          }
        }
      }
      assert.equal(await prisma.upload.count({ where: { id: 900 } }), 1);
    });

    await t.test('all imports use authenticated workspace and prevent shared-name overwrites', async () => {
      const imported = {};
      for (const org of ['alpha', 'beta']) {
        imported[org] = {};
        for (const action of ['import-loads', 'import-carriers', 'import-lane-rates']) {
          const result = await request(`/api/ingest/uploads/${uploads[org].id}/${action}`, org, {
            mapping: mappings, workspaceId: 'org-foreign', orgScope: 'org-foreign',
          });
          expectStatus(result, 201);
          assert.equal(result.body.importedCount, 1, JSON.stringify(result.body));
          assert.equal(result.body.imported[0].workspaceId, `org-${org}`);
          imported[org][action] = result.body.imported[0];
        }
      }
      for (const [action, field] of [['import-loads', 'loadId'], ['import-carriers', 'carrierId'], ['import-lane-rates', 'laneId']]) {
        assert.notEqual(imported.alpha[action][field], imported.beta[action][field]);
      }
      const repeated = await request(`/api/ingest/uploads/${uploads.alpha.id}/import-loads`, 'alpha', { mapping: mappings });
      expectStatus(repeated, 201);
      assert.equal(repeated.body.importedCount, 0);
      assert.equal(repeated.body.skippedCount, 1);
      for (const org of ['alpha', 'beta']) {
        const filter = { workspaceId: `org-${org}` };
        assert.equal((await persistence.listSilLoads(filter)).length, 1);
        assert.equal((await persistence.listSilCarriers(filter)).length, 1);
        assert.equal((await persistence.listSilLanes(filter)).length, 1);
        const rates = await persistence.listSilMarketRates(filter);
        assert.equal(rates.length, 1);
        assert.equal(rates[0].laneId, imported[org]['import-lane-rates'].laneId);
      }
    });

    await t.test('queue lists remain scoped and reject foreign source references', async () => {
      for (const org of ['alpha', 'beta']) {
        const result = await request('/api/jobs', org, {
          type: 'datasource_import', orgScope: 'org-foreign', payload: { dataSourceId: sources[org] },
        });
        expectStatus(result, 201);
        assert.equal(result.body.orgScope, `org-${org}`);
      }
      expectStatus(await request('/api/jobs', 'alpha', { type: 'datasource_import', payload: { dataSourceId: sources.beta } }), 404);
      expectStatus(await request('/api/jobs', 'alpha', { type: 'datasource_import', payload: { dataSourceRef: 'legacy-source' } }), 404);
      for (const org of ['alpha', 'beta']) {
        const result = await request('/api/jobs', org);
        assert.equal(result.body.length, 1);
        assert.equal(result.body[0].orgScope, `org-${org}`);
      }
    });
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (prisma) await prisma.$disconnect();
    if (prismaModule) prismaModule.prisma = originalPrisma;
    if (originalPrisma) await originalPrisma.$disconnect();
    for (const [key, value] of Object.entries({ UPLOAD_DIR: previousUploadDir, SIL_FIRESTORE_ENABLED: previousMirror, SIL_FIRESTORE_PRIMARY_ENABLED: previousPrimary })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('sil-intake-tenancy-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
