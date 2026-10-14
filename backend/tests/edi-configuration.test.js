const test = require('node:test');
const assert = require('node:assert/strict');
const { createEdiConfiguration, hashEdiConfiguration, listEdiConfigurations, verifyEdiConfiguration } = require('../dist/src/services/ediConfigurationService');

test('EDI trading-partner configuration is tenant scoped, versioned, and immutable', async () => {
  const base = { workspaceId: 'org-edi-a', actor: 'steward-1', partnerName: 'WARP', partnerCode: 'warp', interchangeId: 'WARP-X12', interchangeQualifier: 'zz', transport: 'SFTP', stewardshipModel: 'INTERNAL_DATA_STEWARD', stewardName: 'Data Steward', stewardEmail: 'steward@example.com' };
  const first = await createEdiConfiguration(base);
  const second = await createEdiConfiguration({ ...base, transport: 'AS2' });
  assert.equal(first.version, 1);
  assert.equal(second.version, 2);
  assert.equal(second.supersedesConfigurationId, first.configurationId);
  assert.equal(second.documentPolicy.inbound204, 'CONFIGURED');
  assert.equal(second.documentPolicy.outbound990, 'CONFIGURED');
  assert.equal(second.documentPolicy.inbound214, 'PLANNED');
  assert.equal(second.documentPolicy.inbound210, 'PLANNED');
  assert.equal(second.governanceReviewRequired, true);
  assert.equal(second.contentHash, hashEdiConfiguration(second));
  assert.equal(verifyEdiConfiguration(second).integrity, 'VERIFIED');
  assert.equal((await listEdiConfigurations('org-edi-a')).length, 1);
  assert.equal((await listEdiConfigurations('org-edi-b')).length, 0);
  assert.equal(verifyEdiConfiguration({ ...second, transport: 'MANAGED_API' }).integrity, 'FAILED');
});
