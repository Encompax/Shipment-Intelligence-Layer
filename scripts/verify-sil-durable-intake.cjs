const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const backendRequire = createRequire(path.join(__dirname, '../backend/package.json'));
const { Firestore } = backendRequire('@google-cloud/firestore');
const { OAuth2Client } = backendRequire('google-auth-library');

const [phase, base, stateFile] = process.argv.slice(2);
assert(['audit', 'seed', 'verify', 'cleanup'].includes(phase), 'Choose audit, seed, verify, or cleanup.');
assert(stateFile && /^https:\/\/[a-z0-9.-]+\.run\.app$/.test(base), 'Provide a Cloud Run URL and state file.');
const projectId = 'encompax-prod';
const bucket = 'encompax-prod-sil-intake';
const accessToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
assert(accessToken, 'A short-lived Google OAuth access token is required.');
const oauth = new OAuth2Client();
oauth.setCredentials({ access_token: accessToken });
const db = new Firestore({ projectId, authClient: oauth, customHeaders: { 'x-goog-user-project': projectId } });
let state;
const checks = [];
async function authRequest(action, body) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts${action}`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'x-goog-user-project': projectId, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(`Auth administration ${action}: ${response.status} ${result.error?.message || ''}`);
    error.code = result.error?.message === 'USER_NOT_FOUND' ? 'auth/user-not-found' : 'auth/request-failed';
    throw error;
  }
  return result;
}
const syntheticUid = (uid) => { assert(state && uid.startsWith(`${state.run}-`)); return uid; };
const auth = {
  getUserByEmail: async (email) => {
    const user = (await authRequest(':lookup', { email: [email] })).users?.[0];
    assert(user, 'Employee account not found'); return { uid: user.localId, email: user.email };
  },
  createUser: ({ uid, ...data }) => authRequest('', { localId: syntheticUid(uid), ...data }),
  updateUser: (uid, { disabled, ...data }) => authRequest(':update', { localId: syntheticUid(uid), ...data, ...(disabled !== undefined ? { disableUser: disabled } : {}) }),
  revokeRefreshTokens: (uid) => authRequest(':update', { localId: syntheticUid(uid), validSince: String(Math.floor(Date.now() / 1000)) }),
  deleteUser: (uid) => authRequest(':delete', { localId: syntheticUid(uid) }),
};
const save = () => {
  fs.mkdirSync(path.dirname(path.resolve(stateFile)), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
};
const check = (name, value) => { assert(value, name); checks.push(name); console.log(`PASS ${name}`); };
const csv = 'customer,origin_city,origin_state,destination_city,destination_state,carrier,median_rate\nSynthetic Customer,Detroit,MI,Columbus,OH,Synthetic Carrier,1234\n';
const mapping = { customerName: 'customer', originCity: 'origin_city', originState: 'origin_state', destinationCity: 'destination_city', destinationState: 'destination_state', carrierName: 'carrier', medianRate: 'median_rate' };
const uploadForm = (source) => {
  const form = new FormData();
  form.append('dataSourceId', source);
  form.append('orgScope', 'forged-organization');
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'synthetic.csv');
  return form;
};
async function api(route, token, body, status = 200) {
  const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  assert.equal(response.status, status, `${route}: expected ${status}, received ${response.status}`);
  return response.json();
}
async function storageRequest(suffix, method = 'GET') {
  const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o${suffix}`, {
    method, headers: { Authorization: `Bearer ${accessToken}`, 'x-goog-user-project': projectId }, signal: AbortSignal.timeout(30000) });
  assert(response.ok || (method === 'DELETE' && response.status === 404), `Storage cleanup returned ${response.status}`);
  return method === 'GET' ? response.json() : undefined;
}
async function main() {
  if (phase === 'audit') {
    const rows = await db.collection('users').where('moduleAccess.sil', '==', 'active').get();
    const brian = await auth.getUserByEmail('brian.richardson@encompax.com');
    const brianProfile = (await db.doc(`users/${brian.uid}`).get()).data();
    console.log(JSON.stringify({ account: brian.email, profileExists: Boolean(brianProfile), userType: brianProfile?.userType, silProfileAccess: brianProfile?.moduleAccess?.sil || 'not granted' }));
    const counts = { activeProfiles: 0, eligible: 0, missingCanonical: 0 };
    for (const row of rows.docs) {
      const profile = row.data();
      if (profile.syntheticRun) continue;
      counts.activeProfiles++;
      const scope = String(profile.orgScope || '');
      if (!scope || scope.includes('/')) { counts.missingCanonical++; continue; }
      const [organization, membership] = await Promise.all([
        db.doc(`organizations/${scope}`).get(), db.doc(`organizations/${scope}/members/${row.id}`).get(),
      ]);
      const org = organization.data();
      const member = membership.data();
      const eligible = org?.status === 'active' && org?.moduleEntitlements?.sil?.status === 'active'
        && member?.uid === row.id && member?.status === 'active' && member?.moduleKeys?.includes('sil');
      counts[eligible ? 'eligible' : 'missingCanonical']++;
      if (row.id === brian.uid) console.log(JSON.stringify({ account: brian.email, eligible: Boolean(eligible),
        organizationExists: organization.exists, organizationStatus: org?.status, silEntitlement: org?.moduleEntitlements?.sil?.status,
        membershipExists: membership.exists, membershipStatus: member?.status, memberSil: member?.moduleKeys?.includes('sil') }));
    }
    console.log(JSON.stringify(counts));
    return;
  }
  if (phase === 'seed') {
    assert(!fs.existsSync(stateFile), 'Use a new state file for each run.');
    const run = `sil-intake-verify-${Date.now()}-${randomBytes(3).toString('hex')}`;
    state = { run, projectId, bucket, createdAt: new Date().toISOString(), identities: {}, receipts: {}, runs: [] };
    for (const name of ['alpha', 'beta', 'outsider']) state.identities[name] = { uid: `${run}-${name}`, org: `${run}-${name === 'outsider' ? 'alpha' : name}` };
    save();
  } else {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  }
  assert.match(state.run, /^sil-intake-verify-\d{13}-[a-f0-9]{6}$/);
  assert.equal(state.projectId, projectId);
  assert.equal(state.bucket, bucket);
  for (const [name, identity] of Object.entries(state.identities)) {
    assert(['alpha', 'beta', 'outsider'].includes(name));
    assert.equal(identity.uid, `${state.run}-${name}`);
    assert.equal(identity.org, `${state.run}-${name === 'outsider' ? 'alpha' : name}`);
  }
  if (phase === 'cleanup') {
    const failures = [];
    for (const identity of Object.values(state.identities)) {
      try {
        try { await auth.updateUser(identity.uid, { disabled: true }); await auth.revokeRefreshTokens(identity.uid); }
        catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
        await db.doc(`users/${identity.uid}`).delete();
        const launchCodes = await db.collection('moduleLaunchCodes').where('uid', '==', identity.uid).get();
        for (const code of launchCodes.docs) await code.ref.delete();
        try { await auth.deleteUser(identity.uid); } catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
      } catch (error) { failures.push(`identity cleanup: ${error.code || error.message}`); }
    }
    for (const org of new Set(Object.values(state.identities).map((identity) => identity.org))) {
      try {
        await db.recursiveDelete(db.doc(`organizations/${org}`));
        await db.recursiveDelete(db.doc(`silWorkspaces/${org}`));
        const prefix = `sil-intake/${createHash('sha256').update(org).digest('hex')}/`;
        let pageToken;
        do {
          const query = new URLSearchParams({ prefix, ...(pageToken ? { pageToken } : {}) });
          const result = await storageRequest(`?${query}`);
          for (const item of result.items || []) {
            assert(item.name.startsWith(prefix));
            await storageRequest(`/${encodeURIComponent(item.name)}?ifGenerationMatch=${item.generation}`, 'DELETE');
          }
          pageToken = result.nextPageToken;
        } while (pageToken);
      } catch (error) { failures.push(`organization cleanup: ${error.code || error.message}`); }
    }
    assert.deepEqual(failures, [], 'Synthetic cleanup must finish completely.');
    state.cleanedAt = new Date().toISOString(); save();
    console.log('PASS synthetic identities, tenant records, and upload objects removed');
    return;
  }
  assert(!state.cleanedAt, 'This run has already been cleaned.');
  const configResponse = await fetch('https://encompax-prod.web.app/__/firebase/init.json');
  assert(configResponse.ok);
  const config = await configResponse.json();
  assert.equal(config.projectId, projectId);
  const tokens = {};
  for (const [name, identity] of Object.entries(state.identities)) {
    const password = randomBytes(24).toString('base64url');
    const email = `${identity.uid}@example.invalid`;
    if (phase === 'seed') {
      await auth.createUser({ uid: identity.uid, email, password, emailVerified: true });
      await db.doc(`users/${identity.uid}`).create({ uid: identity.uid, orgScope: identity.org, moduleAccess: { sil: 'active' }, userType: 'customer_user', organizationClass: 'customer', syntheticRun: state.run });
      if (name !== 'outsider') {
        await db.doc(`organizations/${identity.org}`).create({ status: 'active', moduleEntitlements: { sil: { status: 'active' } }, syntheticRun: state.run });
        await db.doc(`organizations/${identity.org}/members/${identity.uid}`).create({ uid: identity.uid, status: 'active', moduleKeys: ['sil'], syntheticRun: state.run });
      }
    } else await auth.updateUser(identity.uid, { password });
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
    assert.equal(response.status, 200, `Synthetic sign-in failed: ${name}`);
    tokens[name] = (await response.json()).idToken;
  }
  await api('/api/datasources', undefined, undefined, 401);
  await api('/api/datasources', tokens.outsider, undefined, 403);
  check('unauthenticated and profile-only users are denied', true);
  if (phase === 'seed') {
    const identity = state.identities.alpha;
    const denied = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${identity.uid}?updateMask.fieldPaths=orgScope`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${tokens.alpha}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { orgScope: { stringValue: state.identities.beta.org } } }) });
    check('live Firestore rules deny self-assigned organization changes', denied.status === 403);
    for (const name of ['alpha', 'beta']) {
      const token = tokens[name];
      const source = await api('/api/datasources', token, { name: 'Synthetic release check', type: 'csv_excel', orgScope: 'forged' }, 201);
      const upload = (await api('/api/ingest/upload', token, uploadForm(source.id), 201)).uploads[0];
      check(`${name}: original upload stored privately with authenticated ownership`, upload.orgScope === state.identities[name].org && upload.uploadedBy === state.identities[name].uid && upload.sha256 === createHash('sha256').update(csv).digest('hex') && upload.storedPath === undefined && upload.storageGeneration === undefined);
      const job = await api('/api/jobs', token, { type: 'datasource_import', payload: { dataSourceRef: source.id, rows: [['nested', 'JSON']] } }, 201);
      state.receipts[name] = { sourceId: source.id, uploadId: upload.id, sha256: upload.sha256, jobId: job.id };
      save();
      for (const action of ['import-loads', 'import-carriers', 'import-lane-rates']) {
        const result = await api(`/api/ingest/uploads/${upload.id}/${action}`, token, { mapping, workspaceId: 'forged' }, 201);
        check(`${name}: ${action}`, result.importedCount === 1 && result.imported[0].workspaceId === state.identities[name].org);
      }
    }
  }
  for (const name of ['alpha', 'beta']) {
    const receipt = state.receipts[name];
    const token = tokens[name];
    const sources = await api('/api/datasources', token);
    check(`${name}: data source retained`, sources.length === 1 && sources[0].id === receipt.sourceId);
    const uploads = await api('/api/ingest/uploads', token);
    check(`${name}: upload receipt retained`, uploads.uploads.length === 1 && uploads.uploads[0].id === receipt.uploadId);
    const preview = await api(`/api/ingest/uploads/${receipt.uploadId}/preview`, token);
    check(`${name}: stored original bytes preview correctly`, preview.rows[0].customer === 'Synthetic Customer' && preview.upload.sha256 === receipt.sha256);
    const jobs = await api('/api/jobs', token);
    check(`${name}: queued job retained`, jobs.length === 1 && jobs[0].id === receipt.jobId && jobs[0].status === 'queued');
    for (const [route, key] of [['loads', 'loads'], ['carriers', 'carriers'], ['lanes', 'lanes'], ['market-rates', 'marketRates']]) {
      const result = await api(`/api/shipment-intelligence/${route}`, token);
      check(`${name}: ${route} retained and tenant-scoped`, result[key].length === 1 && result[key][0].workspaceId === state.identities[name].org);
    }
  }
  for (const action of ['preview', 'import-loads', 'import-carriers', 'import-lane-rates']) {
    await api(`/api/ingest/uploads/${state.receipts.beta.uploadId}/${action}`, tokens.alpha, action === 'preview' ? undefined : { mapping }, 404);
  }
  await api('/api/ingest/upload', tokens.alpha, uploadForm(state.receipts.beta.sourceId), 404);
  await api('/api/jobs', tokens.alpha, { type: 'sync', payload: { dataSourceRef: state.receipts.beta.sourceId } }, 404);
  check('cross-tenant preview, import, upload, and job references denied', true);
  const repeat = await api(`/api/ingest/uploads/${state.receipts.alpha.uploadId}/import-loads`, tokens.alpha, { mapping }, 201);
  check('sequential duplicate load import skipped', repeat.importedCount === 0 && repeat.skippedCount === 1);
  const launch = await api('/api/auth/encompax/launch', tokens.alpha, {}, 201);
  const redeemed = await api('/api/auth/encompax/redeem', undefined, { code: launch.code });
  check('dedicated runtime can sign a launch token', typeof redeemed.customToken === 'string' && redeemed.customToken.length > 100);
  await api('/api/auth/encompax/redeem', undefined, { code: launch.code }, 401);
  check('launch code cannot be reused', true);
  state.runs.push({ phase, base, completedAt: new Date().toISOString(), checks }); save();
  console.log(`PASS ${checks.length} live checks; state contains identifiers only, no credentials`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => db.terminate());
