const test = require('node:test');
const assert = require('node:assert/strict');
const { coordinatePlanning, getPlanningCoordinatorDraft, revisePlanningCoordinatorDraft } = require('../dist/src/services/planningCoordinatorService');

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
    assert.ok(run.cases[0].actionDraftId);
    const draft = await getPlanningCoordinatorDraft('org-1', run.cases[0].actionDraftId);
    assert.equal(draft.proposalId, matchedProposal.proposalId);
    assert.equal(draft.inputs.originId, 'dc-1');
    assert.equal(await getPlanningCoordinatorDraft('org-2', run.cases[0].actionDraftId), null);
    const revised = await revisePlanningCoordinatorDraft({ workspaceId: 'org-1', draft, actor: 'planner-2', inputs: { equipmentType: '26 FT DRY VAN' }, rationale: 'Use the configured lane equipment.' });
    assert.equal(revised.revision, 2);
    assert.equal(revised.supersedesActionDraftId, draft.actionDraftId);
    assert.equal(revised.inputs.equipmentType, '26 FT DRY VAN');
    assert.notEqual(revised.contentHash, draft.contentHash);
    await assert.rejects(() => revisePlanningCoordinatorDraft({ workspaceId: 'org-1', draft, actor: 'planner', selectedAction: 'MODIFY_ORDER' }), /not allowed/);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous;
  }
});

test('planning coordinator isolates and preserves 100 immutable cases under concurrent revision load', async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const proposals = Array.from({ length: 100 }, (_, index) => ({
      ...matchedProposal,
      proposalId: `stress-proposal-${index}`,
      workspaceId: 'org-stress',
      orderId: `stress-order-${index}`,
      orderMeid: String(600000000 + index),
      contentHash: `verified-stress-hash-${index}`,
      orderSnapshot: { ...matchedProposal.orderSnapshot, primaryReference: `STRESS-${index}` },
    }));
    const run = await coordinatePlanning({ workspaceId: 'org-stress', proposals, actor: 'stress-planner' });
    assert.equal(run.cases.length, 100);
    assert.equal(new Set(run.cases.map((item) => item.actionDraftId)).size, 100);
    const drafts = await Promise.all(run.cases.map((item) => getPlanningCoordinatorDraft('org-stress', item.actionDraftId)));
    assert.equal(drafts.filter(Boolean).length, 100);
    const revisions = await Promise.all(drafts.map((draft, index) => revisePlanningCoordinatorDraft({ workspaceId: 'org-stress', draft, actor: `planner-${index}`, inputs: { palletQuantity: index + 1 } })));
    assert.equal(new Set(revisions.map((item) => item.actionDraftId)).size, 100);
    assert.ok(revisions.every((item) => item.revision === 2 && item.supersedesActionDraftId));
    await assert.rejects(() => revisePlanningCoordinatorDraft({ workspaceId: 'org-stress', draft: drafts[0], actor: 'attacker', inputs: { workspaceId: 'org-other' } }), /unsupported planning input/);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous;
  }
});
