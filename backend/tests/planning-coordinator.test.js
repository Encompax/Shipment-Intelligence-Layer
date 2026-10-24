const test = require('node:test');
const assert = require('node:assert/strict');
const { coordinatePlanning } = require('../dist/src/services/planningCoordinatorService');

const matchedProposal = {
  schemaVersion: '1.2', matchingPolicyVersion: 'test', equipmentCapacityPolicyVersion: 'test', proposalId: 'proposal-1', workspaceId: 'org-1', orderId: 'order-1', orderMeid: '500000001',
  orderSnapshot: { primaryReference: 'GUSTO-100', originId: 'dc-1', destinationId: 'site-1' }, policySnapshot: { scoringWeights: {}, equipmentCapacityRules: {} }, status: 'PENDING_REVIEW', outcome: 'MATCHED',
  recommendation: { laneId: 'lane-1', score: 100, disposition: 'MATCH', blockerCount: 0, warningCount: 0 }, recommendedLaneId: 'lane-1', recommendedRoutePlanId: 'direct:lane-1',
  routePlans: [{ routePlanId: 'direct:lane-1', planType: 'DIRECT', hubFacilityId: null, crossdockProcessingMinutes: 0, disposition: 'MATCH', score: 100, findings: [], consolidationKey: 'group', finalMileGroupKey: 'final', orderReadyAt: '2026-10-24T08:00', freightAvailableAt: null, finalDeliveryAt: '2026-10-24T10:00', commitmentLatestAt: '2026-10-24T12:00', legs: [{ sequence: 1, role: 'DIRECT', plannedPickup: '2026-10-24T08:00', plannedDelivery: '2026-10-24T10:00', candidate: { laneId: 'lane-1', laneName: 'DC to Site', laneType: 'FINAL_MILE', score: 100, disposition: 'MATCH', findings: [], eligibleCarriers: [], activeAwards: [], laneSnapshot: { originFacilityId: 'dc-1', destinationFacilityId: 'site-1' } } }] }],
  candidates: [], supersedesProposalId: null, createdBy: 'planner', createdAt: '2026-10-24T12:00:00.000Z', contentHash: 'verified-proposal-hash', integrity: 'VERIFIED',
};

test('planning coordinator prepares one governed next action without executing it', async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const run = await coordinatePlanning({ workspaceId: 'org-1', proposals: [matchedProposal], actor: 'planner' });
    assert.equal(run.status, 'PENDING_APPROVAL');
    assert.equal(run.cases.length, 1);
    assert.equal(run.cases[0].selectedAction, 'APPROVE_PLAN');
    assert.equal(run.cases[0].requiresApproval, true);
    assert.equal(run.provider, 'RULES');
    assert.ok(run.contentHash);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous;
  }
});
