const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOrderPlanningProposal, calculateRouteSchedule, hashOrderPlanningProposal, scoreOrderLane, verifyOrderPlanningProposal } = require('../dist/src/services/orderPlanningService');
const { buildPlanningDecisionRecords, decideOrderPlanningProposal, hashOrderPlanningDecision, validatePlanningDecision, verifyOrderPlanningDecision } = require('../dist/src/services/orderPlanningDecisionService');
const { buildTenderIssuance, hashTenderIssuance, issuePlannedLoadTender, listTenderQueue, respondToTender, retenderPlannedLoad, verifyTenderIssuance, verifyTenderResponse } = require('../dist/src/services/tenderQueueService');
const { canonicalizeOrder, validateOrder } = require('../dist/src/routes/orders');
const { buildPlanningResolutionAnalysis, createPlanningResolutionDraft, getPlanningResolutionDraft, recordPlanningResolutionDecision } = require('../dist/src/services/planningResolutionService');
const { applyExecutionTransition, listPartnerActiveLoads, listWorkspaceExecutionLoads, recordPartnerExecutionEvent } = require('../dist/src/services/partnerExecutionService');

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

test('carrier execution transitions reject invalid sequence changes', () => {
  assert.equal(applyExecutionTransition('CARRIER_ACCEPTED', 'DISPATCH_CONFIRMED'), 'DISPATCHED');
  assert.equal(applyExecutionTransition('IN_TRANSIT', 'ETA_UPDATED'), 'IN_TRANSIT');
  assert.throws(() => applyExecutionTransition('CARRIER_ACCEPTED', 'DELIVERED'), /not allowed/);
});

test('keeps schedule deviations visible as review findings instead of silently changing dates', () => {
  const result = scoreOrderLane({ order: { ...order, earliestPickup: '2026-10-14T16:00' }, lane, eligibility, awards, partners });
  assert.equal(result.disposition, 'REVIEW');
  assert.ok(result.findings.some((finding) => finding.code === 'PICKUP_DAY_MISMATCH'));
  assert.ok(result.findings.some((finding) => finding.code === 'PICKUP_TIME_MISMATCH'));
});

test('an approved order-specific delivery exception does not alter the lane schedule', () => {
  const finalMile = { ...lane, laneId: 'lane-order-override', laneType: 'FINAL_MILE', originFacilityId: order.originId, destinationFacilityId: order.destinationId, equipmentType: order.equipmentType, loadAssumption: order.modeType, dispatchDays: [], storeDeliveryDays: ['MONDAY'] };
  const overridden = { ...order, latestDelivery: '2026-10-21T12:00', planningOverrideCodes: ['DELIVERY_DAY_MISMATCH:lane-order-override'] };
  const result = scoreOrderLane({ order: overridden, lane: finalMile, eligibility: [], awards: [], partners: [] });
  assert.ok(result.findings.some((finding) => finding.code === 'ORDER_DELIVERY_DAY_OVERRIDE' && finding.severity === 'INFO'));
  assert.ok(!result.findings.some((finding) => finding.code === 'DELIVERY_DAY_MISMATCH'));
  assert.deepEqual(finalMile.storeDeliveryDays, ['MONDAY']);
});

test('rejects route mismatches as ineligible candidates', () => {
  const result = scoreOrderLane({ order: { ...order, destinationId: 'facility-other' }, lane, eligibility, awards, partners });
  assert.equal(result.disposition, 'INELIGIBLE');
  assert.ok(result.findings.some((finding) => finding.code === 'ROUTE_MISMATCH' && finding.severity === 'BLOCKER'));
});

test('resolves facility site IDs before matching lane endpoints', () => {
  const siteOrder = { ...order, originId: 'ATL_CROSSDOCK', destinationId: 'ATH_ATHENS_87', equipmentType: 'BOX TRUCK', modeType: 'LTL', orderType: 'FINAL_MILE', weight: 8000, palletQuantity: 8 };
  const finalMileLane = { ...lane, laneType: 'FINAL_MILE', originFacilityId: 'facility-atl-crossdock', destinationFacilityId: 'facility-athens-87', equipmentType: 'BOX TRUCK', loadAssumption: 'LTL', dispatchDays: [], terminalArrivalDays: [], storeDeliveryDays: [] };
  const proposal = buildOrderPlanningProposal({
    workspaceId: 'org-1', order: siteOrder, lanes: [finalMileLane], eligibility, awards, partners, actor: 'planner-1',
    facilities: [
      { facilityId: 'facility-atl-crossdock', siteId: 'ATL_CROSSDOCK', facilityType: 'CROSSDOCK' },
      { facilityId: 'facility-athens-87', siteId: 'ATH_ATHENS_87', facilityType: 'MFC' },
    ],
  });
  const route = proposal.routePlans.find((item) => item.routePlanId === `direct:${finalMileLane.laneId}`);
  assert.notEqual(route.disposition, 'INELIGIBLE');
  assert.ok(!route.findings.some((finding) => finding.code === 'ROUTE_MISMATCH'));
  assert.equal(proposal.orderSnapshot.destinationId, 'ATH_ATHENS_87');
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

test('builds and approves a governed hub-and-spoke route as linked loads', () => {
  const hubOrder = { ...order, orderId: 'order-hub-1', destinationId: 'facility-store', orderType: 'TRANSFER', weight: 8000, palletQuantity: 8, equipmentType: '' };
  const linehaulLeg = { ...lane, laneId: 'lane-hub-linehaul', destinationFacilityId: 'facility-crossdock' };
  const finalMileLeg = {
    ...lane, laneId: 'lane-hub-final-mile', name: 'Crossdock to Store', laneType: 'FINAL_MILE', originFacilityId: 'facility-crossdock', destinationFacilityId: 'facility-store',
    equipmentType: 'BOX TRUCK', loadAssumption: 'LTL', dispatchDays: [], terminalArrivalDays: [], storeDeliveryDays: [],
  };
  const hubEligibility = [
    ...eligibility.map((item) => ({ ...item, eligibilityId: 'eligible-linehaul', laneId: linehaulLeg.laneId })),
    ...eligibility.map((item) => ({ ...item, eligibilityId: 'eligible-final-mile', laneId: finalMileLeg.laneId })),
  ];
  const hubAwards = [
    ...awards.map((item) => ({ ...item, awardId: 'award-linehaul', laneId: linehaulLeg.laneId })),
    ...awards.map((item) => ({ ...item, awardId: 'award-final-mile', laneId: finalMileLeg.laneId })),
  ];
  const proposal = buildOrderPlanningProposal({
    workspaceId: 'org-1', order: hubOrder, lanes: [linehaulLeg, finalMileLeg], eligibility: hubEligibility, awards: hubAwards, partners, actor: 'planner-1',
    facilities: [{ facilityId: 'facility-crossdock', facilityType: 'CROSSDOCK', crossdockProcessingMinutes: 90 }],
  });
  const route = proposal.routePlans.find((item) => item.routePlanId === proposal.recommendedRoutePlanId);
  assert.equal(route.planType, 'HUB_SPOKE');
  assert.equal(route.crossdockProcessingMinutes, 90);
  assert.deepEqual(route.legs.map((leg) => leg.role), ['LINEHAUL', 'FINAL_MILE']);
  assert.ok(route.consolidationKey);
  assert.ok(route.finalMileGroupKey);
  const result = buildPlanningDecisionRecords({ workspaceId: 'org-1', order: hubOrder, proposal, decision: 'APPROVED', actor: 'planner-1' });
  assert.equal(result.loads.length, 2);
  assert.deepEqual(result.loads.map((load) => load.laneType), ['LINEHAUL', 'FINAL_MILE']);
  assert.deepEqual(result.decision.plannedLoadIds, result.loads.map((load) => load.loadId));
  assert.notEqual(result.loads[0].plannedPickup, result.loads[1].plannedPickup);
  assert.equal(result.loads[0].plannedDelivery, route.legs[0].plannedDelivery);
  assert.equal(result.loads[1].plannedPickup, route.legs[1].plannedPickup);
});

test('calculates a governed hub handoff across weekly schedules', () => {
  const linehaul = { ...lane, standardOriginDepartureTime: '15:00' };
  const finalMile = {
    ...lane, laneType: 'FINAL_MILE', dispatchDays: ['FRIDAY'], storeDeliveryDays: ['FRIDAY'],
    standardRouteDepartureTime: '06:00', standardStoreDeliveryStart: '09:00', standardStoreDeliveryEnd: '12:00',
  };
  const schedule = calculateRouteSchedule(order, [linehaul, finalMile], 120);
  assert.equal(schedule.legs[0].plannedPickup, '2026-10-13T15:00');
  assert.equal(schedule.legs[0].plannedDelivery, '2026-10-15T17:00');
  assert.equal(schedule.freightAvailableAt, '2026-10-15T19:00');
  assert.equal(schedule.legs[1].plannedPickup, '2026-10-16T06:00');
  assert.equal(schedule.finalDeliveryAt, '2026-10-16T12:00');
});

test('blocks a route plan when its calculated delivery misses the order commitment', () => {
  const slowLane = { ...lane, terminalArrivalDays: ['FRIDAY'], terminalArrivalStart: '19:00', terminalArrivalEnd: '21:00' };
  const proposal = buildOrderPlanningProposal({ workspaceId: 'org-1', order, lanes: [slowLane], eligibility, awards, partners, actor: 'planner-1' });
  assert.equal(proposal.outcome, 'NO_MATCH');
  assert.equal(proposal.recommendedRoutePlanId, null);
  assert.equal(proposal.recommendedLaneId, undefined);
  assert.ok(proposal.routePlans[0].findings.some((finding) => finding.code === 'DELIVERY_COMMITMENT_MISSED'));
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

  const acceptedLoads = await listPartnerActiveLoads(workspaceId, 'carrier-1');
  assert.equal(acceptedLoads.length, 1);
  assert.equal(acceptedLoads[0].execution.status, 'CARRIER_ACCEPTED');
  assert.equal(acceptedLoads[0].execution.latestEta, null);
  await assert.rejects(() => recordPartnerExecutionEvent({ workspaceId, externalPartnerId: 'carrier-2', loadId: approval.load.loadId, actor: 'wrong-carrier', eventType: 'DISPATCH_CONFIRMED' }), /assigned to this partner/);
  await assert.rejects(() => recordPartnerExecutionEvent({ workspaceId, externalPartnerId: 'carrier-1', loadId: approval.load.loadId, actor: 'carrier-user-1', eventType: 'EXCEPTION_RESOLVED' }), /No active execution exception/);
  await recordPartnerExecutionEvent({ workspaceId, externalPartnerId: 'carrier-1', loadId: approval.load.loadId, actor: 'carrier-user-1', eventType: 'DISPATCH_CONFIRMED', location: 'Atlanta, GA' });
  await recordPartnerExecutionEvent({ workspaceId, externalPartnerId: 'carrier-1', loadId: approval.load.loadId, actor: 'carrier-user-1', eventType: 'PICKED_UP', location: 'Atlanta, GA' });
  await recordPartnerExecutionEvent({ workspaceId, externalPartnerId: 'carrier-1', loadId: approval.load.loadId, actor: 'carrier-user-1', eventType: 'ETA_UPDATED', estimatedArrival: '2026-10-15T17:30:00.000Z' });
  await recordPartnerExecutionEvent({ workspaceId, externalPartnerId: 'carrier-1', loadId: approval.load.loadId, actor: 'carrier-user-1', eventType: 'EXCEPTION_REPORTED', note: 'Traffic delay outside Atlanta.' });
  const inTransitLoads = await listPartnerActiveLoads(workspaceId, 'carrier-1');
  assert.equal(inTransitLoads[0].execution.status, 'IN_TRANSIT');
  assert.equal(inTransitLoads[0].execution.latestEta, '2026-10-15T17:30:00.000Z');
  assert.equal(inTransitLoads[0].execution.activeException, true);
  assert.equal(inTransitLoads[0].events.length, 4);
  assert.ok(inTransitLoads[0].events.every((event) => event.integrity === 'VERIFIED'));
  const customerLoads = await listWorkspaceExecutionLoads(workspaceId);
  assert.equal(customerLoads[0].execution.exceptionSummary, 'Traffic delay outside Atlanta.');
  assert.equal((await listWorkspaceExecutionLoads('another-org')).length, 0);
  await recordPartnerExecutionEvent({ workspaceId, externalPartnerId: 'carrier-1', loadId: approval.load.loadId, actor: 'carrier-user-1', eventType: 'EXCEPTION_RESOLVED', note: 'Traffic cleared.' });
  assert.equal((await listWorkspaceExecutionLoads(workspaceId))[0].execution.activeException, false);
});

test('planning resolution assistant explains capacity and schedule findings without changing the proposal', async () => {
  const heavyOrder = { ...order, orderId: 'order-resolution-1', equipmentType: 'BOX TRUCK', modeType: 'LTL', weight: 15000, palletQuantity: 8, latestDelivery: '2026-10-13T18:30' };
  const finalMile = { ...lane, laneId: 'lane-final-mile', name: 'ATL Final Mile', laneType: 'FINAL_MILE', equipmentType: 'BOX TRUCK', loadAssumption: 'LTL', storeDeliveryDays: ['WEDNESDAY'], terminalArrivalDays: [], workspaceId: 'org-1' };
  const largerLane = { ...finalMile, laneId: 'lane-final-mile-53', name: 'ATL Final Mile 53', equipmentType: '53 FT DRY VAN' };
  const unrelatedLinehaul = { ...lane, laneId: 'lane-unrelated-linehaul', name: 'Unrelated Linehaul', laneType: 'LINEHAUL', equipmentType: '53 FT DRY VAN', loadAssumption: 'TL', originFacilityId: 'somewhere-else' };
  const proposal = buildOrderPlanningProposal({ workspaceId: 'org-1', order: heavyOrder, lanes: [finalMile, largerLane, unrelatedLinehaul], eligibility: [], awards: [], partners: [], actor: 'planner-1' });
  const original = JSON.stringify(proposal);
  const analysis = buildPlanningResolutionAnalysis(proposal);
  assert.ok(analysis.findings.some((finding) => ['WEIGHT_CAPACITY_EXCEEDED', 'EQUIPMENT_MISMATCH'].includes(finding.code)));
  assert.ok(analysis.findings.some((finding) => finding.code === 'DELIVERY_DAY_MISMATCH'));
  assert.equal(analysis.inferredLaneType, 'FINAL_MILE');
  assert.equal(analysis.options.length, 1);
  assert.equal(analysis.options[0].actionType, 'APPLY_CORRECTION_SET');
  assert.equal(analysis.options[0].executable, true);
  assert.ok(analysis.findings.every((finding) => finding.laneId !== unrelatedLinehaul.laneId));
  assert.ok(analysis.options[0].parameters.changes.some((item) => item.kind === 'ORDER_FIELD' && item.field === 'equipmentType'));
  assert.ok(analysis.options[0].parameters.changes.some((item) => item.kind === 'SCHEDULE_EXCEPTION'));
  assert.equal(JSON.stringify(proposal), original);
  const option = analysis.options[0];
  const draft = await createPlanningResolutionDraft({ workspaceId: 'org-1', actor: 'planner-1', proposal, option });
  assert.equal(draft.integrity, 'VERIFIED');
  assert.equal((await getPlanningResolutionDraft('org-other', draft.draftId)), null);
  const decision = await recordPlanningResolutionDecision({ workspaceId: 'org-1', draftId: draft.draftId, decision: 'REJECTED', actor: 'planner-1' });
  assert.equal(decision.integrity, 'VERIFIED');
  await assert.rejects(() => recordPlanningResolutionDecision({ workspaceId: 'org-1', draftId: draft.draftId, decision: 'APPROVED', actor: 'planner-1' }), /already has a decision/);
});
