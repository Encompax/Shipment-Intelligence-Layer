import { createHash, randomUUID } from "crypto";
import { isFirestorePrimaryEnabled } from "../lib/firestore";
import { intakeCollection } from "./intake/intakeStore";

export type EdiStewardshipModel = "MARENGO" | "EXTERNAL_PARTY" | "INTERNAL_DATA_STEWARD";
export type EdiTransport = "SFTP" | "AS2" | "MANAGED_API";
export type EdiTradingPartnerConfiguration = {
  schemaVersion: "1.0";
  configurationId: string;
  workspaceId: string;
  tradingPartnerKey: string;
  version: number;
  supersedesConfigurationId: string | null;
  partnerName: string;
  partnerCode: string;
  interchangeId: string;
  interchangeQualifier: string;
  transport: EdiTransport;
  connectionReference: string | null;
  stewardshipModel: EdiStewardshipModel;
  stewardName: string | null;
  stewardEmail: string | null;
  governanceReviewRequired: true;
  documentPolicy: {
    inbound204: "CONFIGURED";
    outbound990: "CONFIGURED";
    inbound214: "PLANNED";
    inbound210: "PLANNED";
    retainRawDocuments: true;
    retainAcknowledgments: true;
    retainTranslations: true;
  };
  status: "CONFIGURATION_PENDING";
  createdBy: string;
  createdAt: string;
  contentHash: string;
  integrity?: "VERIFIED" | "FAILED";
};

const localConfigurations = new Map<string, EdiTradingPartnerConfiguration[]>();
const canonicalJson = (value: unknown): string => value === null || typeof value !== "object"
  ? JSON.stringify(value)
  : Array.isArray(value)
    ? `[${value.map(canonicalJson).join(",")}]`
    : `{${Object.entries(value as Record<string, unknown>).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;

export function hashEdiConfiguration(record: Omit<EdiTradingPartnerConfiguration, "contentHash"> | EdiTradingPartnerConfiguration) {
  const { contentHash: _hash, integrity: _integrity, ...content } = record as EdiTradingPartnerConfiguration;
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}

export function verifyEdiConfiguration(record: EdiTradingPartnerConfiguration) {
  return { ...record, integrity: hashEdiConfiguration(record) === record.contentHash ? "VERIFIED" as const : "FAILED" as const };
}

export async function listEdiConfigurations(workspaceId: string) {
  const records = isFirestorePrimaryEnabled()
    ? (await intakeCollection(workspaceId, "ediTradingPartnerConfigurations").get()).docs.map((doc) => doc.data() as EdiTradingPartnerConfiguration)
    : localConfigurations.get(workspaceId) ?? [];
  const latest = new Map<string, EdiTradingPartnerConfiguration>();
  records.filter((record) => record.workspaceId === workspaceId).forEach((record) => {
    if (!latest.has(record.tradingPartnerKey) || record.version > latest.get(record.tradingPartnerKey)!.version) latest.set(record.tradingPartnerKey, record);
  });
  return [...latest.values()].sort((a, b) => a.partnerName.localeCompare(b.partnerName)).map(verifyEdiConfiguration);
}

export async function createEdiConfiguration(input: {
  workspaceId: string; actor: string; partnerName: string; partnerCode: string; interchangeId: string; interchangeQualifier: string;
  transport: EdiTransport; connectionReference?: string; stewardshipModel: EdiStewardshipModel; stewardName?: string; stewardEmail?: string;
}) {
  const tradingPartnerKey = input.partnerCode.trim().toUpperCase();
  const existing = (isFirestorePrimaryEnabled()
    ? (await intakeCollection(input.workspaceId, "ediTradingPartnerConfigurations").get()).docs.map((doc) => doc.data() as EdiTradingPartnerConfiguration)
    : localConfigurations.get(input.workspaceId) ?? [])
    .filter((record) => record.workspaceId === input.workspaceId && record.tradingPartnerKey === tradingPartnerKey)
    .sort((a, b) => b.version - a.version)[0];
  const withoutHash: Omit<EdiTradingPartnerConfiguration, "contentHash"> = {
    schemaVersion: "1.0", configurationId: randomUUID(), workspaceId: input.workspaceId, tradingPartnerKey,
    version: (existing?.version ?? 0) + 1, supersedesConfigurationId: existing?.configurationId ?? null,
    partnerName: input.partnerName.trim(), partnerCode: tradingPartnerKey, interchangeId: input.interchangeId.trim(),
    interchangeQualifier: input.interchangeQualifier.trim().toUpperCase(), transport: input.transport,
    connectionReference: input.connectionReference?.trim() || null, stewardshipModel: input.stewardshipModel,
    stewardName: input.stewardName?.trim() || null, stewardEmail: input.stewardEmail?.trim().toLowerCase() || null,
    governanceReviewRequired: true,
    documentPolicy: { inbound204: "CONFIGURED", outbound990: "CONFIGURED", inbound214: "PLANNED", inbound210: "PLANNED", retainRawDocuments: true, retainAcknowledgments: true, retainTranslations: true },
    status: "CONFIGURATION_PENDING", createdBy: input.actor, createdAt: new Date().toISOString(),
  };
  const record = { ...withoutHash, contentHash: hashEdiConfiguration(withoutHash) };
  if (isFirestorePrimaryEnabled()) await intakeCollection(input.workspaceId, "ediTradingPartnerConfigurations").doc(record.configurationId).create(record);
  else localConfigurations.set(input.workspaceId, [...(localConfigurations.get(input.workspaceId) ?? []), record]);
  return verifyEdiConfiguration(record);
}
