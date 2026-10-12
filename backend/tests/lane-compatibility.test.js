const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSilLaneProfile } = require('../dist/src/services/shipmentIntelligence/silPersistenceService');

test('network-planning lanes remain readable by shipment intelligence', () => {
  const lane = normalizeSilLaneProfile({ laneId: 'lane-1', workspaceId: 'org-1', originFacilityId: 'facility-dc1', destinationFacilityId: 'facility-mfc1', loadAssumption: 'TL', equipmentType: '53 FT DRY VAN', updatedAt: '2026-10-12T00:00:00.000Z' });
  assert.equal(lane.originRegion, 'facility-dc1');
  assert.equal(lane.destinationRegion, 'facility-mfc1');
  assert.equal(lane.mode, 'FTL');
  assert.equal(lane.laneId, 'lane-1');
});

test('incomplete legacy lanes use stable fallbacks instead of crashing list sorting', () => {
  const lane = normalizeSilLaneProfile({ id: 'legacy-1' });
  assert.equal(lane.originRegion, 'UNKNOWN');
  assert.equal(lane.destinationRegion, 'UNKNOWN');
  assert.equal(lane.laneId, 'legacy-1');
});
