"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEncompaxPlatformOverviewPayload = buildEncompaxPlatformOverviewPayload;
exports.sendSignalToEncompaxPlatformOverview = sendSignalToEncompaxPlatformOverview;
const defaultApiBase = "http://localhost:4000/api";
function apiBaseUrl() {
    return (process.env.ENCOMPAX_API_BASE_URL || defaultApiBase).replace(/\/$/, "");
}
function buildEncompaxPlatformOverviewPayload(signalId, signal) {
    const workspaceId = signal.workspaceId || "workspace-shipment-operations";
    return {
        sourceModule: signal.sourceModule,
        signalId,
        signalType: signal.signalType,
        severity: signal.severity,
        confidenceScore: signal.confidenceScore,
        description: signal.description,
        businessDomains: signal.businessDomains,
        affectedEntities: signal.affectedEntities,
        metrics: signal.metrics,
        tags: Array.from(new Set(["sil", "shipment-intelligence", ...signal.tags])),
        recommendedActions: signal.recommendedActions,
        rawPayloadRef: signal.rawPayloadRef,
        correlationId: `sil:${workspaceId}:${signalId}`,
        routingReason: "SIL routed a governed transportation decision to Encompax Platform Overview.",
        payload: {
            ...signal,
            silSignalId: signalId,
        },
    };
}
async function sendSignalToEncompaxPlatformOverview(signalId, signal) {
    const payload = buildEncompaxPlatformOverviewPayload(signalId, signal);
    const endpoint = `${apiBaseUrl()}/platform-overview/intake`;
    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
        const text = await response.text();
        let responseBody = text;
        try {
            responseBody = text ? JSON.parse(text) : null;
        }
        catch {
            responseBody = text;
        }
        return {
            sent: response.ok,
            endpoint,
            payload,
            responseStatus: response.status,
            responseBody,
            error: response.ok ? undefined : `Encompax API returned ${response.status}`,
        };
    }
    catch (error) {
        return {
            sent: false,
            endpoint,
            payload,
            error: error instanceof Error ? error.message : "Unknown Encompax bridge error",
        };
    }
}
