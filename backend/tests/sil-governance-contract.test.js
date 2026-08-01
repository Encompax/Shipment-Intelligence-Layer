const test = require("node:test");
const assert = require("node:assert/strict");

const agent = require("../dist/src/services/shipmentIntelligence/silSupportAgent.js");
const bridge = require("../dist/src/services/shipmentIntelligence/encompaxPlatformBridge.js");

const load = {
  workspaceId: "org-a",
  loadId: "load-1",
  customerId: "customer-1",
  origin: { city: "Detroit", state: "MI" },
  destination: { city: "Columbus", state: "OH" },
  mode: "FTL",
  equipmentType: "DRY_VAN",
  status: "LOAD_CREATED",
};

test("SIL support agent is advisory and cannot override governance", () => {
  assert.equal(agent.SIL_SUPPORT_AGENT_CONTRACT.provider, "MANUAL");
  assert.equal(agent.SIL_SUPPORT_AGENT_CONTRACT.capabilityMode, "ADVISORY");
  assert.equal(agent.SIL_SUPPORT_AGENT_CONTRACT.mayOverrideGovernance, false);
});

test("SIL agent explains and proposes only valid load transitions", () => {
  const explanation = agent.explainLoad(load);
  assert.deepEqual(explanation.allowedTransitions, ["READY_TO_POST", "CANCELED"]);

  const proposal = agent.proposeLoadTransition(load, "READY_TO_POST", "Operator confirmed the load details.");
  assert.equal(proposal.proposedAction.nextState, "READY_TO_POST");
  assert.equal(proposal.signal.metrics.proposedState, "READY_TO_POST");
  assert.throws(
    () => agent.proposeLoadTransition(load, "DISPATCHED", "Operator requested an invalid jump."),
    /not allowed/
  );
});

test("SIL publishes with bearer identity and consumes the central decision feed", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).endsWith("/module-decisions")) {
      return new Response(JSON.stringify({ decisions: [{ event: { signalId: "signal-1" }, disposition: "EXECUTE_ALLOWED", mayExecute: true }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  try {
    const proposal = agent.proposeLoadTransition(load, "READY_TO_POST", "Operator confirmed the load details.");
    const sent = await bridge.sendSignalToEncompaxPlatformOverview("signal-1", proposal.signal, "Bearer test-token");
    const decisions = await bridge.listEncompaxModuleDecisions("Bearer test-token");
    assert.equal(sent.sent, true);
    assert.equal(decisions[0].mayExecute, true);
    assert.equal(calls[0].options.headers.Authorization, "Bearer test-token");
    assert.equal(calls[0].options.headers["X-Encompax-Module"], "sil");
    assert.equal(calls[1].options.headers.Authorization, "Bearer test-token");
  } finally {
    global.fetch = originalFetch;
  }
});
