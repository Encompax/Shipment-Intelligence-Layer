const test = require('node:test');
const assert = require('node:assert/strict');

test('SIL authorization requires non-revoked identity and canonical organization access', async (t) => {
  const previous = process.env.SIL_AUTH_REQUIRED;
  process.env.SIL_AUTH_REQUIRED = 'true';
  const admin = require('../dist/src/lib/firebaseAdmin.js');
  const originalAuth = admin.getSilFirebaseAdminAuth;
  const firestorePath = require.resolve('firebase-admin/firestore');
  require(firestorePath);
  const originalFirestore = require.cache[firestorePath].exports;
  const documents = new Map();
  let revoked = false;
  const db = { doc: (path) => ({ get: async () => ({ exists: documents.has(path), data: () => documents.get(path) }) }) };
  require.cache[firestorePath].exports = { ...originalFirestore, getFirestore: () => db };
  admin.getSilFirebaseAdminAuth = () => ({ app: {}, verifyIdToken: async (_token, checkRevoked) => {
    assert.equal(checkRevoked, true);
    if (revoked) throw new Error('Sensitive provider error must not be returned');
    return { uid: 'user-test' };
  } });
  const middlewarePath = require.resolve('../dist/src/middleware/requireSilAuth.js');
  delete require.cache[middlewarePath];
  const { requireSilAuth } = require(middlewarePath);
  const reset = () => {
    documents.clear();
    revoked = false;
    documents.set('users/user-test', { orgScope: 'test-org', moduleAccess: { sil: 'active' } });
    documents.set('organizations/test-org', { status: 'active', moduleEntitlements: { sil: { status: 'active' } } });
    documents.set('organizations/test-org/members/user-test', { uid: 'user-test', status: 'active', moduleKeys: ['sil'] });
  };
  const request = async (token = 'synthetic') => {
    const req = { method: 'GET', headers: token ? { authorization: `Bearer ${token}` } : {} };
    const result = { status: 200, next: false };
    const res = { status: (status) => { result.status = status; return res; }, json: (body) => { result.body = body; } };
    await requireSilAuth(req, res, () => { result.next = true; });
    return { ...result, context: req.silAuth };
  };
  try {
    await t.test('active organization, entitlement, and membership allow access', async () => {
      reset();
      const result = await request();
      assert.equal(result.next, true);
      assert.equal(result.context.orgScope, 'test-org');
    });
    await t.test('a forged or stale active profile cannot replace a canonical membership', async () => {
      for (const document of ['organizations/test-org', 'organizations/test-org/members/user-test']) {
        reset(); documents.delete(document);
        assert.equal((await request()).status, 403);
      }
      for (const changes of [{ status: 'suspended' }, { uid: 'another-user' }, { moduleKeys: [] }]) {
        reset(); Object.assign(documents.get('organizations/test-org/members/user-test'), changes);
        const result = await request();
        assert.equal(result.status, 403); assert.equal(result.context, undefined);
      }
      reset(); documents.get('organizations/test-org').moduleEntitlements.sil.status = 'pending';
      assert.equal((await request()).status, 403);
    });
    await t.test('missing and revoked credentials fail without leaking provider details', async () => {
      reset(); assert.equal((await request(null)).status, 401);
      revoked = true;
      const result = await request();
      assert.equal(result.status, 401);
      assert.deepEqual(result.body, { error: 'Invalid authentication token.' });
      assert.equal(result.context, undefined);
    });
  } finally {
    admin.getSilFirebaseAdminAuth = originalAuth;
    require.cache[firestorePath].exports = originalFirestore;
    delete require.cache[middlewarePath];
    if (previous === undefined) delete process.env.SIL_AUTH_REQUIRED; else process.env.SIL_AUTH_REQUIRED = previous;
  }
});
