const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOrderPlanningProposal, scoreOrderLane } = require('../dist/src/services/orderPlanningService');

const order = {
  orderId: 'order-1', workspaceId: 'org-1', primaryReference: 'GUSTO-2225555', silTestMeid: '500000001',
  status: 'READY_TO_PLAN', originId: 'facility-origin', destinationId: 'facility-destination', businessUnit: 'Gopuff',
  earliestPickup: '2026-10-13T13:00', latestDelivery: '2026-10-15T18:30', modeType: 'TL',
  equipmentType: '53 FT DRY VAN', orderType: 'TRANSFER',
};
const lane = {
  laneId: 'lane-1', workspaceId: 'org-1', name: 'Linehaul ATL', laneType: 'LINEHAUL', status: 'ACTIVE',
  originFacilityId: 'facility-origin', destinationFacilityId: 'facility-destination', businessUnitId: 'gopuff',
  businessUnitName: 'Gopuff', equipmentType: '53 FT DRY VAN', loadAssumption: 'TL',
  dispatchDays: ['TUESDAY'], terminalArrivalDays: ['THURSDAY'], standardCarrierArrivalStart: '12:00',
  standardCarrierArrivalEnd: '14:00', terminalArrivalStart: '17:00', terminalArrivalEnd: '19:00',
  effectiveFrom: '2026-01-01', createdBy: 'admin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};
const eligibility = [{ eligibilityId: 'eligible-1', workspaceId: 'org-1', laneId: 'lane-1', externalPartnerId: 'carrier-1', status: 'ELIGIBLE', createdBy: 'admin', createdAt: '', updatedAt: '' }];
const awards = [{ awardId: 'award-1', workspaceId: 'org-1', laneId: 'lane-1', externalPartnerId: 'carrier-1', awardType: 'PRIMARY', rate: 1200, currency: 'USD', rateUnit: 'PER_LOAD', effectiveFrom: '2026-01-01', status: 'ACTIVE', createdBy: 'admin', createdAt: '', updatedAt: '' }];
const partners = [{ id: 'carrier-1', name: 'WARP', scac: 'WARP' }];

test('scores a fully compatible order and attaches the active carrier award', () => {
  const result = scoreOrderLane({ order, lane, eligibility, awards, partners });
  assert.equal(result.score, 100);
  assert.equal(result.disposition, 'MATCH');
  assert.equal(result.findings.length, 0);
  assert.equal(result.activeAwards[0].carrier.scac, 'WARP');
});

test('keeps schedule deviations visible as review findings instead of silently changing dates', () => {
  const result = scoreOrderLane({ order: { ...order, earliestPickup: '2026-10-14T16:00' }, lane, eligibility, awards, partners });
  assert.equal(result.disposition, 'REVIEW');
  assert.ok(result.findings.some((finding) => finding.code === 'PICKUP_DAY_MISMATCH'));
  assert.ok(result.findings.some((finding) => finding.code === 'PICKUP_TIME_MISMATCH'));
});

test('rejects route mismatches as ineligible candidates', () => {
  const result = scoreOrderLane({ order: { ...order, destinationId: 'facility-other' }, lane, eligibility, awards, partners });
  assert.equal(result.disposition, 'INELIGIBLE');
  assert.ok(result.findings.some((finding) => finding.code === 'ROUTE_MISMATCH' && finding.severity === 'BLOCKER'));
});

test('builds a tenant-scoped pending proposal with the best lane recommendation', () => {
  const proposal = buildOrderPlanningProposal({ workspaceId: 'org-1', order, lanes: [lane], eligibility, awards, partners, actor: 'user-1' });
  assert.equal(proposal.workspaceId, 'org-1');
  assert.equal(proposal.orderMeid, '500000001');
  assert.equal(proposal.outcome, 'MATCHED');
  assert.equal(proposal.recommendedLaneId, 'lane-1');
  assert.equal(proposal.status, 'PENDING_REVIEW');
});

test('refuses to create a proposal across tenant boundaries', () => {
  assert.throws(() => buildOrderPlanningProposal({ workspaceId: 'org-2', order, lanes: [], eligibility: [], awards: [], partners: [], actor: 'user-2' }), /does not belong/);
});
