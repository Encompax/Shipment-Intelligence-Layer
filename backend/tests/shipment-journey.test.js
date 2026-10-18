const test = require('node:test');
const assert = require('node:assert/strict');
const { buildShipmentJourney } = require('../dist/src/services/shipmentJourneyService');

const candidate = (laneId, laneType, origin, destination) => ({
  laneId, laneName: laneId, laneType, score: 100, disposition: 'MATCH', findings: [], eligibleCarriers: [], activeAwards: [],
  laneSnapshot: { originFacilityId: origin, destinationFacilityId: destination, dispatchDays: [], terminalArrivalDays: [], storeDeliveryDays: [] },
});
const proposal = (orderId, meid, leg) => ({
  schemaVersion: '1.2', matchingPolicyVersion: 'test', equipmentCapacityPolicyVersion: 'test', proposalId: `proposal-${orderId}`,
  workspaceId: 'org-1', orderId, orderMeid: meid, orderSnapshot: {}, policySnapshot: {}, status: 'PENDING_REVIEW', outcome: 'MATCHED',
  recommendation: null, candidates: [leg.candidate], routePlans: [{ routePlanId: `route-${orderId}`, planType: 'DIRECT', hubFacilityId: null, crossdockProcessingMinutes: 0, legs: [leg], disposition: 'MATCH', score: 100, findings: [], consolidationKey: '', finalMileGroupKey: '', orderReadyAt: leg.plannedPickup, freightAvailableAt: null, finalDeliveryAt: leg.plannedDelivery, commitmentLatestAt: leg.plannedDelivery }], recommendedRoutePlanId: `route-${orderId}`,
  supersedesProposalId: null, createdBy: 'planner', createdAt: '2026-10-18T12:00:00.000Z', contentHash: 'verified-by-test', integrity: 'VERIFIED',
});

test('orders connected through a hub receive journey-wide segment numbering', () => {
  const finalMile = proposal('order-fm', '500000002', { sequence: 1, role: 'DIRECT', candidate: candidate('ATL-ATH-87', 'FINAL_MILE', 'ATL-XD', 'ATH-87'), plannedPickup: '2026-10-20T08:00', plannedDelivery: '2026-10-20T12:00' });
  const linehaul = proposal('order-lh', '500000001', { sequence: 1, role: 'DIRECT', candidate: candidate('ORIGIN-ATL', 'LINEHAUL', 'DC-1', 'ATL-XD'), plannedPickup: '2026-10-19T08:00', plannedDelivery: '2026-10-20T04:00' });
  const journey = buildShipmentJourney({ workspaceId: 'org-1', proposals: [finalMile, linehaul], actor: 'planner', now: '2026-10-18T13:00:00.000Z' });
  assert.equal(journey.status, 'CONNECTED');
  assert.deepEqual(journey.segments.map((segment) => [segment.sequence, segment.laneType, segment.orderId]), [[1, 'LINEHAUL', 'order-lh'], [2, 'FINAL_MILE', 'order-fm']]);
  assert.equal(journey.findings[0].code, 'JOURNEY_CONNECTED');
});

test('journey retains a warning when selected orders do not share a handoff', () => {
  const first = proposal('order-1', '500000001', { sequence: 1, role: 'DIRECT', candidate: candidate('A-B', 'LINEHAUL', 'A', 'B'), plannedPickup: '2026-10-19T08:00', plannedDelivery: '2026-10-19T12:00' });
  const second = proposal('order-2', '500000002', { sequence: 1, role: 'DIRECT', candidate: candidate('C-D', 'FINAL_MILE', 'C', 'D'), plannedPickup: '2026-10-20T08:00', plannedDelivery: '2026-10-20T12:00' });
  const journey = buildShipmentJourney({ workspaceId: 'org-1', proposals: [first, second], actor: 'planner' });
  assert.equal(journey.status, 'REVIEW_REQUIRED');
  assert.equal(journey.findings[0].code, 'JOURNEY_HANDOFF_GAP');
});

test('parallel final-mile orders share segment two after one linehaul', () => {
  const linehaul = proposal('order-lh', '500000001', { sequence: 1, role: 'DIRECT', candidate: candidate('DC-ATL', 'LINEHAUL', 'DC-1', 'ATL-XD'), plannedPickup: '2026-10-19T08:00', plannedDelivery: '2026-10-20T04:00' });
  const athens = proposal('order-ath', '500000002', { sequence: 1, role: 'DIRECT', candidate: candidate('ATL-ATH', 'FINAL_MILE', 'ATL-XD', 'ATH-87'), plannedPickup: '2026-10-20T08:00', plannedDelivery: '2026-10-20T12:00' });
  const macon = proposal('order-mac', '500000003', { sequence: 1, role: 'DIRECT', candidate: candidate('ATL-MAC', 'FINAL_MILE', 'ATL-XD', 'MAC-22'), plannedPickup: '2026-10-20T08:00', plannedDelivery: '2026-10-20T13:00' });
  const journey = buildShipmentJourney({ workspaceId: 'org-1', proposals: [athens, linehaul, macon], actor: 'planner' });
  assert.equal(journey.status, 'CONNECTED');
  assert.deepEqual(journey.segments.map((segment) => segment.sequence), [1, 2, 2]);
});
