const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOrderConsolidationProposal, verifyOrderConsolidationProposal } = require('../dist/src/services/orderConsolidationService');
const { buildOrderPlanningProposal } = require('../dist/src/services/orderPlanningService');

const workspaceId = 'org-consolidation';
const lane = {
  laneId: 'lane-linehaul', workspaceId, name: 'ATL Linehaul', laneType: 'LINEHAUL', status: 'ACTIVE',
  originFacilityId: 'origin', destinationFacilityId: 'hub', businessUnitId: 'gopuff', businessUnitName: 'Gopuff',
  equipmentType: '53 FT DRY VAN', loadAssumption: 'TL', dispatchDays: ['TUESDAY'], standardOriginDepartureTime: '15:00',
  terminalArrivalDays: ['THURSDAY'], terminalArrivalStart: '17:00', terminalArrivalEnd: '19:00', effectiveFrom: '2026-01-01',
};
const eligibility = [{ laneId: lane.laneId, externalPartnerId: 'carrier-1', status: 'ELIGIBLE' }];
const awards = [{ awardId: 'award-1', laneId: lane.laneId, externalPartnerId: 'carrier-1', awardType: 'PRIMARY', rate: 1000, currency: 'USD', rateUnit: 'PER_LOAD', effectiveFrom: '2026-01-01', status: 'ACTIVE' }];
const partners = [{ id: 'carrier-1', name: 'Carrier One', scac: 'CONE' }];
const makeOrder = (id, weight, pallets) => ({
  orderId: id, workspaceId, status: 'READY_TO_PLAN', primaryReference: id, silTestMeid: `50000000${id.slice(-1)}`,
  originId: 'origin', destinationId: 'hub', businessUnit: 'Gopuff', earliestPickup: '2026-10-13T13:00', latestDelivery: '2026-10-15T18:30',
  equipmentType: '53 FT DRY VAN', modeType: 'TL', orderType: 'LINEHAUL', weight, weightUom: 'LBS', palletQuantity: pallets,
});
const planning = (order) => buildOrderPlanningProposal({ workspaceId, order, lanes: [lane], eligibility, awards, partners, actor: 'planner' });

test('groups compatible orders and records immutable source evidence', () => {
  const orders = [makeOrder('order-1', 18000, 10), makeOrder('order-2', 20000, 12)];
  const proposals = new Map(orders.map((order) => [order.orderId, planning(order)]));
  const result = buildOrderConsolidationProposal({ workspaceId, orders, proposals, actor: 'planner', now: '2026-10-14T12:00:00.000Z' });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].status, 'READY');
  assert.equal(result.groups[0].totalWeightLbs, 38000);
  assert.equal(result.groups[0].totalPallets, 22);
  assert.equal(result.groups[0].sourceProposalHashes.length, 2);
  assert.equal(verifyOrderConsolidationProposal(result).integrity, 'VERIFIED');
});

test('blocks a grouped load that exceeds governed equipment capacity', () => {
  const orders = [makeOrder('order-3', 24000, 16), makeOrder('order-4', 24000, 16)];
  const proposals = new Map(orders.map((order) => [order.orderId, planning(order)]));
  const result = buildOrderConsolidationProposal({ workspaceId, orders, proposals, actor: 'planner' });
  assert.equal(result.groups[0].status, 'CAPACITY_EXCEEDED');
  assert.ok(result.groups[0].findings.some((finding) => finding.code === 'CONSOLIDATED_CAPACITY_EXCEEDED'));
});

test('does not combine orders with different scheduled departures', () => {
  const first = makeOrder('order-5', 10000, 5);
  const second = { ...makeOrder('order-6', 10000, 5), earliestPickup: '2026-10-20T13:00', latestDelivery: '2026-10-22T18:30' };
  const orders = [first, second];
  const proposals = new Map(orders.map((order) => [order.orderId, planning(order)]));
  const result = buildOrderConsolidationProposal({ workspaceId, orders, proposals, actor: 'planner' });
  assert.equal(result.groups.length, 2);
  assert.ok(result.groups.every((group) => group.status === 'SINGLE_ORDER'));
});
