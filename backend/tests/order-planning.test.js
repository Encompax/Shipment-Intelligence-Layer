const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOrderPlanningProposal, hashOrderPlanningProposal, scoreOrderLane, verifyOrderPlanningProposal } = require('../dist/src/services/orderPlanningService');
const { buildPlanningDecisionRecords, decideOrderPlanningProposal, hashOrderPlanningDecision, validatePlanningDecision, verifyOrderPlanningDecision } = require('../dist/src/services/orderPlanningDecisionService');
const { buildTenderIssuance, hashTenderIssuance, issuePlannedLoadTender, listTenderQueue, respondToTender, retenderPlannedLoad, verifyTenderIssuance, verifyTenderResponse } = require('../dist/src/services/tenderQueueService');
const { canonicalizeOrder, validateOrder } = require('../dist/src/routes/orders');
const { buildPlanningResolutionAnalysis, createPlanningResolutionDraft, getPlanningResolutionDraft, recordPlanningResolutionDecision } = require('../dist/src/services/planningResolutionService');

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

test('issues an append-only tender from a planned load without changing planning evidence', async () => {
  const tenderOrder = { ...order, orderId: 'order-tender-1', primaryReference: 'GUSTO-TENDER-1' };
  const proposal = buildOrderPlanningProposal({ workspaceId: 'org-1', order: tenderOrder, lanes: [lane], eligibility, awards, partners, actor: 'user-1' });
  const approval = await decideOrderPlanningProposal({ workspaceId: 'org-1', order: tenderOrder, proposal, decision: 'APPROVED', actor: 'planner-1' });
  const tender = buildTenderIssuance({ workspaceId: 'org-1', load: approval.load, actor: 'planner-1', now: '2026-10-13T20:00:00.000Z', responseDueAt: '2026-10-13T22:00:00.000Z', tenderId: 'tender-1' });
  assert.equal(tender.sourceProposalId, proposal.proposalId);
  assert.equal(tender.sourceProposalContentHash, proposal.contentHash);
  assert.equal(tender.planningDecisionId, approval.decision.decisionId);
  assert.equal(tender.carrier.scac, 'WARP');
  assert.equal(tender.contentHash, hashTenderIssuance(tender));
  assert.equal(verifyTenderIssuance(tender).integrity, 'VERIFIED');
  assert.equal(approval.load.status, 'PLANNED');
});

test('tender issuance is idempotent while a carrier response is pending', async () => {
  const tenderOrder = { ...order, orderId: 'order-tender-2', primaryReference: 'GUSTO-TENDER-2' };
  const proposal = buildOrderPlanningProposal({ workspaceId: 'org-1', order: tenderOrder, lanes: [lane], eligibility, awards, partners, actor: 'user-1' });
  const approval = await decideOrderPlanningProposal({ workspaceId: 'org-1', order: tenderOrder, proposal, decision: 'APPROVED', actor: 'planner-1' });
  const first = await issuePlannedLoadTender({ workspaceId: 'org-1', loadId: approval.load.loadId, actor: 'planner-1' });
  const retry = await issuePlannedLoadTender({ workspaceId: 'org-1', loadId: approval.load.loadId, actor: 'planner-1' });
  assert.equal(first.idempotent, false);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.tender.tenderId, first.tender.tenderId);
  assert.equal(retry.state.status, 'AWAITING_RESPONSE');
});

test('records carrier rejection and a governed retender as linked append-only events', async () => {
  const tenderOrder = { ...order, orderId: 'order-tender-3', primaryReference: 'GUSTO-TENDER-3' };
  const proposal = buildOrderPlanningProposal({ workspaceId: 'org-1', order: tenderOrder, lanes: [lane], eligibility, awards, partners, actor: 'user-1' });
  const approval = await decideOrderPlanningProposal({ workspaceId: 'org-1', order: tenderOrder, proposal, decision: 'APPROVED', actor: 'planner-1' });
  const first = await issuePlannedLoadTender({ workspaceId: 'org-1', loadId: approval.load.loadId, actor: 'planner-1' });
  await assert.rejects(() => respondToTender({ workspaceId: 'org-1', tenderId: first.tender.tenderId, externalPartnerId: 'other-carrier', response: 'ACCEPTED', actor: 'other-user' }), /different partner/);
  const rejected = await respondToTender({ workspaceId: 'org-1', tenderId: first.tender.tenderId, externalPartnerId: 'carrier-1', response: 'REJECTED', reason: 'No driver capacity.', actor: 'carrier-user-1' });
  assert.equal(rejected.state.status, 'REJECTED');
  assert.equal(verifyTenderResponse(rejected.response).integrity, 'VERIFIED');
  const second = await retenderPlannedLoad({ workspaceId: 'org-1', loadId: approval.load.loadId, actor: 'planner-1', reason: 'Carrier confirmed capacity on second review.' });
  assert.equal(second.tender.attemptNumber, 2);
  assert.equal(second.tender.priorTenderId, first.tender.tenderId);
  assert.equal(second.tender.retenderReason, 'Carrier confirmed capacity on second review.');
  assert.equal(second.state.status, 'AWAITING_RESPONSE');
});

test('acceptance is terminal and cannot be retendered', async () => {
  const tenderOrder = { ...order, orderId: 'order-tender-4', primaryReference: 'GUSTO-TENDER-4' };
  const proposal = buildOrderPlanningProposal({ workspaceId: 'org-1', order: tenderOrder, lanes: [lane], eligibility, awards, partners, actor: 'user-1' });
  const approval = await decideOrderPlanningProposal({ workspaceId: 'org-1', order: tenderOrder, proposal, decision: 'APPROVED', actor: 'planner-1' });
  const issued = await issuePlannedLoadTender({ workspaceId: 'org-1', loadId: approval.load.loadId, actor: 'planner-1' });
  const accepted = await respondToTender({ workspaceId: 'org-1', tenderId: issued.tender.tenderId, externalPartnerId: 'carrier-1', response: 'ACCEPTED', actor: 'carrier-user-1' });
  assert.equal(accepted.state.status, 'ACCEPTED');
  await assert.rejects(() => retenderPlannedLoad({ workspaceId: 'org-1', loadId: approval.load.loadId, actor: 'planner-1', reason: 'Invalid retry.' }), /rejected or expired/);
});

test('manual order flows through planning, tender visibility, and carrier acceptance', async () => {
  const workspaceId = 'org-workflow-acceptance';
  const rawOrder = {
    primaryReference: 'GUSTO-E2E-1', poNumber: 'GUSTO-E2E-1', materialTransferOrderNumber: 'GUSTO-E2E-1',
    businessUnit: 'Gopuff', earliestPickup: '2026-10-13T13:00', latestDelivery: '2026-10-15T18:30',
    originId: 'facility-origin', destinationId: 'facility-destination', palletQuantity: '26', weight: '40000',
    weightUom: 'LBS', equipmentType: '53 FT DRY VAN', modeType: 'TL', orderType: 'TRANSFER', scac: 'WARP',
  };
  const mapping = Object.fromEntries(Object.keys(rawOrder).map((field) => [field, field]));
  const canonical = canonicalizeOrder(rawOrder, mapping);
  assert.deepEqual(validateOrder(canonical, 1), []);
  assert.equal(canonical.weight, 40000);
  assert.equal(canonical.palletQuantity, 26);

  const workflowOrder = {
    ...canonical, orderId: 'order-workflow-acceptance', workspaceId, silTestMeid: '500000099', meid: '500000099',
    status: 'READY_TO_PLAN', createdBy: 'planner-1', createdAt: '2026-10-13T12:00:00.000Z', updatedAt: '2026-10-13T12:00:00.000Z',
  };
  const workflowLane = { ...lane, workspaceId };
  const workflowEligibility = eligibility.map((item) => ({ ...item, workspaceId }));
  const workflowAwards = awards.map((item) => ({ ...item, workspaceId }));
  const proposal = buildOrderPlanningProposal({ workspaceId, order: workflowOrder, lanes: [workflowLane], eligibility: workflowEligibility, awards: workflowAwards, partners, actor: 'planner-1' });
  assert.equal(proposal.outcome, 'MATCHED');
  assert.equal(proposal.integrity, undefined);

  const approval = await decideOrderPlanningProposal({ workspaceId, order: workflowOrder, proposal, decision: 'APPROVED', actor: 'planner-1' });
  const planningEvidence = JSON.stringify({ proposal, decision: approval.decision, load: approval.load });
  const issued = await issuePlannedLoadTender({ workspaceId, loadId: approval.load.loadId, actor: 'planner-1' });
  assert.equal(issued.state.status, 'AWAITING_RESPONSE');

  const carrierQueue = (await listTenderQueue(workspaceId)).filter((item) => item.load.carrier.externalPartnerId === 'carrier-1');
  assert.equal(carrierQueue.length, 1);
  assert.equal(carrierQueue[0].tenders[0].tenderId, issued.tender.tenderId);
  assert.equal((await listTenderQueue('org-unrelated')).length, 0);
  await assert.rejects(() => respondToTender({ workspaceId, tenderId: issued.tender.tenderId, externalPartnerId: 'carrier-2', response: 'ACCEPTED', actor: 'wrong-carrier' }), /different partner/);

  const accepted = await respondToTender({ workspaceId, tenderId: issued.tender.tenderId, externalPartnerId: 'carrier-1', response: 'ACCEPTED', actor: 'carrier-user-1' });
  assert.equal(accepted.state.status, 'ACCEPTED');
  assert.deepEqual(accepted.tender.orderIds, [workflowOrder.orderId]);
  assert.equal(accepted.tender.integrity, 'VERIFIED');
  assert.equal(accepted.response.integrity, undefined);
  assert.equal(verifyTenderResponse(accepted.response).integrity, 'VERIFIED');
  assert.equal(JSON.stringify({ proposal, decision: approval.decision, load: approval.load }), planningEvidence);
});

test('planning resolution assistant explains capacity and schedule findings without changing the proposal', async () => {
  const heavyOrder = { ...order, orderId: 'order-resolution-1', equipmentType: 'BOX TRUCK', modeType: 'LTL', weight: 15000, palletQuantity: 8, latestDelivery: '2026-10-13T18:30' };
  const finalMile = { ...lane, laneId: 'lane-final-mile', name: 'ATL Final Mile', laneType: 'FINAL_MILE', equipmentType: 'BOX TRUCK', loadAssumption: 'LTL', storeDeliveryDays: ['WEDNESDAY'], terminalArrivalDays: [], workspaceId: 'org-1' };
  const largerLane = { ...finalMile, laneId: 'lane-final-mile-53', name: 'ATL Final Mile 53', equipmentType: '53 FT DRY VAN' };
  const proposal = buildOrderPlanningProposal({ workspaceId: 'org-1', order: heavyOrder, lanes: [finalMile, largerLane], eligibility: [], awards: [], partners: [], actor: 'planner-1' });
  const original = JSON.stringify(proposal);
  const analysis = buildPlanningResolutionAnalysis(proposal);
  assert.ok(analysis.findings.some((finding) => finding.code === 'WEIGHT_CAPACITY_EXCEEDED'));
  assert.ok(analysis.findings.some((finding) => finding.code === 'DELIVERY_DAY_MISMATCH'));
  assert.ok(analysis.options.some((option) => option.actionType === 'SPLIT_ORDER' && option.parameters.loadCount === 2));
  assert.ok(analysis.options.some((option) => option.actionType === 'CHANGE_ORDER_EQUIPMENT' && option.executable));
  assert.ok(analysis.options.some((option) => option.actionType === 'CHANGE_ORDER_DELIVERY' && option.executable));
  assert.equal(JSON.stringify(proposal), original);
  const option = analysis.options.find((candidate) => candidate.actionType === 'CHANGE_ORDER_EQUIPMENT');
  const draft = await createPlanningResolutionDraft({ workspaceId: 'org-1', actor: 'planner-1', proposal, option });
  assert.equal(draft.integrity, 'VERIFIED');
  assert.equal((await getPlanningResolutionDraft('org-other', draft.draftId)), null);
  const decision = await recordPlanningResolutionDecision({ workspaceId: 'org-1', draftId: draft.draftId, decision: 'REJECTED', actor: 'planner-1' });
  assert.equal(decision.integrity, 'VERIFIED');
  await assert.rejects(() => recordPlanningResolutionDecision({ workspaceId: 'org-1', draftId: draft.draftId, decision: 'APPROVED', actor: 'planner-1' }), /already has a decision/);
});
