const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCargoNestingProposal } = require('../dist/src/services/cargoNestingService');

const parent = { orderId: 'lh-order', workspaceId: 'org-1', primaryReference: 'DC1WK44Tues', status: 'READY_TO_PLAN', originId: 'dc-1', destinationId: 'xdock-atl', earliestPickup: '2026-10-27T13:00', latestDelivery: '2026-10-30T12:00', weight: 30000, weightUom: 'LBS', palletQuantity: 30, businessUnit: 'GoPuff' };
const child = { orderId: 'fm-order', workspaceId: 'org-1', primaryReference: 'GUSTO-1238888', silTestMeid: '500000005', status: 'READY_TO_PLAN', originId: 'xdock-atl', destinationId: 'site-283', earliestPickup: '2026-10-30T12:00', latestDelivery: '2026-10-30T18:00', weight: 9000, weightUom: 'LBS', palletQuantity: 8, caseQuantity: 100 };
const lanes = [
  { laneId: 'lh-lane', workspaceId: 'org-1', name: 'DC1 to ATL', status: 'ACTIVE', laneType: 'LINEHAUL', originFacilityId: 'dc-1', destinationFacilityId: 'xdock-atl', equipmentType: '53 FT DRY VAN', dispatchDays: ['TUESDAY'], terminalArrivalDays: ['FRIDAY'], standardOriginDepartureTime: '14:00', terminalArrivalStart: '09:00' },
  { laneId: 'fm-lane', workspaceId: 'org-1', name: 'ATL to 283', status: 'ACTIVE', laneType: 'FINAL_MILE', originFacilityId: 'xdock-atl', destinationFacilityId: 'site-283', equipmentType: 'BOX TRUCK', dispatchDays: ['FRIDAY'], storeDeliveryDays: ['FRIDAY'], standardRouteDepartureTime: '13:00', standardStoreDeliveryEnd: '17:00' },
];
const awards = [{ laneId: 'lh-lane', externalPartnerId: 'warp', status: 'ACTIVE' }, { laneId: 'fm-lane', externalPartnerId: 'misfits', status: 'ACTIVE' }];

test('nests downstream cargo within a parent linehaul manifest and records custody', () => {
  const proposal = buildCargoNestingProposal({ workspaceId: 'org-1', parent, children: [child], allocations: [{ orderId: child.orderId, attributes: { temperature: 'ambient' } }], lanes, awards, actor: 'planner' });
  assert.equal(proposal.allocations.length, 1);
  assert.equal(proposal.allocations[0].finalMileLaneId, 'fm-lane');
  assert.equal(proposal.allocations[0].custody[2].event, 'CROSSDOCK_RECEIPT');
  assert.equal(proposal.capacity.allocatedPallets, 8);
  assert.ok(!proposal.findings.some((finding) => finding.severity === 'BLOCKER'));
  assert.ok(proposal.contentHash);
});

test('blocks child allocations that exceed the declared parent manifest', () => {
  const proposal = buildCargoNestingProposal({ workspaceId: 'org-1', parent, children: [child], allocations: [{ orderId: child.orderId, weightLbs: 31000, pallets: 31 }], lanes, awards, actor: 'planner' });
  assert.ok(proposal.findings.some((finding) => finding.code === 'ALLOCATION_EXCEEDS_MANIFEST'));
});
