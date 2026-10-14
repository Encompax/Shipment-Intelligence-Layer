const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOrderPlanningProposal, hashOrderPlanningProposal, scoreOrderLane, verifyOrderPlanningProposal } = require('../dist/src/services/orderPlanningService');
const { buildPlanningDecisionRecords, decideOrderPlanningProposal, hashOrderPlanningDecision, validatePlanningDecision, verifyOrderPlanningDecision } = require('../dist/src/services/orderPlanningDecisionService');

const order = {
  orderId: 'order-1', workspaceId: 'org-1', primaryReference: 'GUSTO-2225555', silTestMeid: '500000001',
  status: 'READY_TO_PLAN', originId: 'facility-origin', destinationId: 'facility-destination', businessUnit: 'Gopuff',
  earliestPickup: '2026-10-13T13:00', latestDelivery: '2026-10-15T18:30', modeType: 'TL',
  equipmentType: '53 FT DRY VAN', orderType: 'TRANSFER',
  weight: 40000, weightUom: 'LBS', palletQuantity: 26,
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

test('blocks an order that exceeds the selected equipment capacity', () => {
  const result = scoreOrderLane({ order: { ...order, equipmentType: 'BOX TRUCK', modeType: 'LTL', weight: 10001, palletQuantity: 11 }, lane: { ...lane, equipmentType: 'BOX TRUCK', loadAssumption: 'LTL' }, eligibility, awards, partners });
  assert.equal(result.disposition, 'INELIGIBLE');
  assert.ok(result.findings.some((finding) => finding.code === 'WEIGHT_CAPACITY_EXCEEDED'));
  assert.ok(result.findings.some((finding) => finding.code === 'PALLET_CAPACITY_EXCEEDED'));
});

test('converts kilograms before checking the governed weight limit', () => {
  const result = scoreOrderLane({ order: { ...order, equipmentType: '26 FT DRY VAN', modeType: 'LTL', weight: 5500, weightUom: 'KG', palletQuantity: 12 }, lane: { ...lane, equipmentType: '26 FT DRY VAN', loadAssumption: 'LTL' }, eligibility, awards, partners });
  assert.ok(result.findings.some((finding) => finding.code === 'WEIGHT_CAPACITY_EXCEEDED'));
  assert.ok(!result.findings.some((finding) => finding.code === 'PALLET_CAPACITY_EXCEEDED'));
});

test('builds a tenant-scoped pending proposal with the best lane recommendation', () => {
  const proposal = buildOrderPlanningProposal({ workspaceId: 'org-1', order, lanes: [lane], eligibility, awards, partners, actor: 'user-1', supersedesProposalId: 'proposal-previous' });
  assert.equal(proposal.workspaceId, 'org-1');
  assert.equal(proposal.orderMeid, '500000001');
  assert.equal(proposal.outcome, 'MATCHED');
  assert.equal(proposal.recommendedLaneId, 'lane-1');
  assert.equal(proposal.status, 'PENDING_REVIEW');
  assert.equal(proposal.supersedesProposalId, 'proposal-previous');
  assert.equal(proposal.orderSnapshot.primaryReference, 'GUSTO-2225555');
  assert.equal(proposal.policySnapshot.equipmentCapacityRules['53 FT DRY VAN'].maxWeightLbs, 45000);
  assert.equal(proposal.contentHash, hashOrderPlanningProposal(proposal));
  assert.equal(verifyOrderPlanningProposal(proposal).integrity, 'VERIFIED');
});

test('detects proposal content changes and labels pre-versioned records as legacy', () => {
  const proposal = buildOrderPlanningProposal({ workspaceId: 'org-1', order, lanes: [lane], eligibility, awards, partners, actor: 'user-1' });
  assert.equal(verifyOrderPlanningProposal({ ...proposal, outcome: 'NO_MATCH' }).integrity, 'FAILED');
  const { contentHash, schemaVersion, ...legacy } = proposal;
  assert.equal(verifyOrderPlanningProposal(legacy).integrity, 'LEGACY_UNVERIFIED');
});

test('refuses to create a proposal across tenant boundaries', () => {
  assert.throws(() => buildOrderPlanningProposal({ workspaceId: 'org-2', order, lanes: [], eligibility: [], awards: [], partners: [], actor: 'user-2' }), /does not belong/);
});

test('creates an immutable approval decision and planned load from the proposal snapshot', () => {
  const proposal = buildOrderPlanningProposal({ workspaceId: 'org-1', order, lanes: [lane], eligibility, awards, partners, actor: 'user-1' });
  const result = buildPlanningDecisionRecords({ workspaceId: 'org-1', order, proposal, decision: 'APPROVED', actor: 'planner-1', now: '2026-10-13T20:00:00.000Z', loadId: 'load-1' });
  assert.equal(result.decision.decision, 'APPROVED');
  assert.equal(result.decision.plannedLoadId, 'load-1');
  assert.equal(result.decision.contentHash, hashOrderPlanningDecision(result.decision));
  assert.equal(verifyOrderPlanningDecision(result.decision).integrity, 'VERIFIED');
  assert.equal(verifyOrderPlanningDecision({ ...result.decision, decision: 'REJECTED' }).integrity, 'FAILED');
  assert.equal(result.load.status, 'PLANNED');
  assert.deepEqual(result.load.orderIds, ['order-1']);
  assert.equal(result.load.laneId, 'lane-1');
  assert.equal(result.load.carrier.scac, 'WARP');
  assert.equal(result.load.award.rate, 1200);
  assert.equal(result.load.sourceProposalContentHash, proposal.contentHash);
});

test('records a rejection without creating a load and requires a reason', () => {
  const proposal = buildOrderPlanningProposal({ workspaceId: 'org-1', order, lanes: [lane], eligibility, awards, partners, actor: 'user-1' });
  assert.throws(() => validatePlanningDecision({ workspaceId: 'org-1', order, proposal, decision: 'REJECTED' }), /reason is required/);
  const result = buildPlanningDecisionRecords({ workspaceId: 'org-1', order, proposal, decision: 'REJECTED', reason: 'Pickup schedule needs correction.', actor: 'planner-1' });
  assert.equal(result.load, null);
  assert.equal(result.decision.reason, 'Pickup schedule needs correction.');
});

test('blocks approval when no active carrier award is available', () => {
  const proposal = buildOrderPlanningProposal({ workspaceId: 'org-1', order, lanes: [lane], eligibility, awards: [], partners, actor: 'user-1' });
  assert.throws(() => buildPlanningDecisionRecords({ workspaceId: 'org-1', order, proposal, decision: 'APPROVED', actor: 'planner-1' }), /active carrier award/);
});

test('returns the original approval and load for an idempotent retry', async () => {
  const proposal = buildOrderPlanningProposal({ workspaceId: 'org-1', order, lanes: [lane], eligibility, awards, partners, actor: 'user-1' });
  const first = await decideOrderPlanningProposal({ workspaceId: 'org-1', order, proposal, decision: 'APPROVED', actor: 'planner-1' });
  const retry = await decideOrderPlanningProposal({ workspaceId: 'org-1', order: first.order, proposal, decision: 'APPROVED', actor: 'planner-1' });
  assert.equal(first.idempotent, false);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.decision.decisionId, first.decision.decisionId);
  assert.equal(retry.load.loadId, first.load.loadId);
});
