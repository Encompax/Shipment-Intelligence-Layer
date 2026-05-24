export type ShipmentState =
  | "DRAFT"
  | "PENDING"
  | "BOOKED"
  | "DISPATCHED"
  | "AT_PICKUP"
  | "IN_TRANSIT"
  | "AT_DELIVERY"
  | "DELIVERED"
  | "CANCELED"
  | "EXCEPTION";

export const SHIPMENT_STATES: ShipmentState[] = [
  "DRAFT",
  "PENDING",
  "BOOKED",
  "DISPATCHED",
  "AT_PICKUP",
  "IN_TRANSIT",
  "AT_DELIVERY",
  "DELIVERED",
  "CANCELED",
  "EXCEPTION",
];

export type BrokerageLoadState =
  | "LOAD_CREATED"
  | "READY_TO_POST"
  | "POSTED"
  | "BIDDING"
  | "CARRIER_SELECTED"
  | "TENDERED"
  | "ACCEPTED"
  | "DISPATCHED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "INVOICED"
  | "CLOSED"
  | "CANCELED";

export const BROKERAGE_LOAD_STATES: BrokerageLoadState[] = [
  "LOAD_CREATED",
  "READY_TO_POST",
  "POSTED",
  "BIDDING",
  "CARRIER_SELECTED",
  "TENDERED",
  "ACCEPTED",
  "DISPATCHED",
  "IN_TRANSIT",
  "DELIVERED",
  "INVOICED",
  "CLOSED",
  "CANCELED",
];

export type BidState =
  | "RECEIVED"
  | "SHORTLISTED"
  | "REJECTED"
  | "AWARDED"
  | "WITHDRAWN"
  | "EXPIRED";

export const BID_STATES: BidState[] = [
  "RECEIVED",
  "SHORTLISTED",
  "REJECTED",
  "AWARDED",
  "WITHDRAWN",
  "EXPIRED",
];

export type SilGovernanceSignalType =
  | "LOAD_AT_RISK"
  | "CARRIER_FALLOFF_RISK"
  | "TENDER_RESPONSE_DELAY"
  | "APPOINTMENT_BREACH_RISK"
  | "LANE_RATE_EXCEPTION"
  | "LOAD_BOARD_BID_OPPORTUNITY"
  | "BROKER_MARGIN_RISK"
  | "CARRIER_CREDIT_RISK"
  | "CARRIER_INVITE_REVIEW"
  | "DISPATCH_READINESS_REVIEW"
  | "CUSTOMER_DELIVERY_COMMITMENT_RISK"
  | "SHIPMENT_EXECUTION_EXCEPTION"
  | "MARKET_RATE_VOLATILITY";

export const SIL_GOVERNANCE_SIGNAL_TYPES: SilGovernanceSignalType[] = [
  "LOAD_AT_RISK",
  "CARRIER_FALLOFF_RISK",
  "TENDER_RESPONSE_DELAY",
  "APPOINTMENT_BREACH_RISK",
  "LANE_RATE_EXCEPTION",
  "LOAD_BOARD_BID_OPPORTUNITY",
  "BROKER_MARGIN_RISK",
  "CARRIER_CREDIT_RISK",
  "CARRIER_INVITE_REVIEW",
  "DISPATCH_READINESS_REVIEW",
  "CUSTOMER_DELIVERY_COMMITMENT_RISK",
  "SHIPMENT_EXECUTION_EXCEPTION",
  "MARKET_RATE_VOLATILITY",
];

export type SilBusinessDomain =
  | "TRANSPORTATION"
  | "FREIGHT_BROKERAGE"
  | "SHIPMENT_VISIBILITY"
  | "WAREHOUSE_OPERATIONS"
  | "CUSTOMER_SERVICE"
  | "FINANCE"
  | "RISK";

export const SIL_BUSINESS_DOMAINS: SilBusinessDomain[] = [
  "TRANSPORTATION",
  "FREIGHT_BROKERAGE",
  "SHIPMENT_VISIBILITY",
  "WAREHOUSE_OPERATIONS",
  "CUSTOMER_SERVICE",
  "FINANCE",
  "RISK",
];

export type SilSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type TransportMode = "PARCEL" | "LTL" | "FTL" | "INTERMODAL" | "AIR" | "OCEAN";

export type EquipmentType =
  | "DRY_VAN"
  | "REEFER"
  | "FLATBED"
  | "BOX_TRUCK"
  | "SPRINTER"
  | "CONTAINER"
  | "PARCEL";

export type LocationRef = {
  facilityName?: string;
  address?: string;
  city: string;
  state: string;
  postalCode?: string;
  country?: string;
};

export type SilStop = {
  stopId: string;
  shipmentId?: string;
  sequence: number;
  type: "PICKUP" | "DELIVERY" | "TERMINAL" | "CROSSDOCK";
  location: LocationRef;
  appointmentStart?: string;
  appointmentEnd?: string;
  arrivedAt?: string;
  loadedUnloadedAt?: string;
  departedAt?: string;
  status: "PENDING" | "ARRIVED" | "COMPLETED" | "MISSED" | "CANCELED";
};

export type SilLoad = {
  workspaceId?: string;
  loadId: string;
  customerId: string;
  customerName?: string;
  origin: LocationRef;
  destination: LocationRef;
  pickupWindowStart?: string;
  pickupWindowEnd?: string;
  deliveryWindowStart?: string;
  deliveryWindowEnd?: string;
  mode: TransportMode;
  equipmentType: EquipmentType;
  weightLbs?: number;
  handlingRequirements?: string[];
  hazmat?: boolean;
  temperatureControlled?: boolean;
  status: BrokerageLoadState;
  targetSellRate?: number;
  targetBuyRate?: number;
  marginTarget?: number;
  source: "manual" | "tms" | "load_board" | "karrio" | "starship";
};

export type SilShipment = {
  workspaceId?: string;
  shipmentId: string;
  loadId?: string;
  orderId?: string;
  carrierId?: string;
  carrierName?: string;
  serviceLevel?: string;
  trackingNumber?: string;
  state: ShipmentState;
  stops: SilStop[];
  cost?: number;
  estimatedDelivery?: string;
  actualDelivery?: string;
  exception?: string;
  source: "starship" | "karrio" | "manual" | "tms";
};

export type SilCarrierProfile = {
  workspaceId?: string;
  carrierId: string;
  carrierName: string;
  mcNumber?: string;
  dotNumber?: string;
  insuranceStatus?: "UNKNOWN" | "VALID" | "EXPIRED" | "INSUFFICIENT";
  safetyStatus?: "UNKNOWN" | "CLEAR" | "REVIEW" | "BLOCKED";
  creditStatus?: "UNKNOWN" | "APPROVED" | "REVIEW" | "BLOCKED";
  serviceScore?: number;
  falloffRate?: number;
  onTimeRate?: number;
  blocked?: boolean;
  preferred?: boolean;
};

export type SilLaneProfile = {
  workspaceId?: string;
  laneId: string;
  originRegion: string;
  destinationRegion: string;
  mode: TransportMode;
  equipmentType: EquipmentType;
  averageTransitDays?: number;
  transitVarianceDays?: number;
  onTimeRate?: number;
  marketRateLow?: number;
  marketRateMedian?: number;
  marketRateHigh?: number;
  lastUpdatedAt?: string;
};

export type SilLoadPosting = {
  workspaceId?: string;
  postingId: string;
  loadId: string;
  board: "INTERNAL" | "PUBLIC" | "DAT" | "TRUCKSTOP" | "OTHER";
  postedRate?: number;
  visibility: "PRIVATE" | "INVITED_CARRIERS" | "PUBLIC";
  status: "DRAFT" | "POSTED" | "PAUSED" | "EXPIRED" | "AWARDED" | "CANCELED";
  invitedCarrierIds?: string[];
  invitedAt?: string;
  postedAt?: string;
  expiresAt?: string;
  bidCount: number;
  bestBidRate?: number;
  bestCarrierId?: string;
};

export type SilBid = {
  workspaceId?: string;
  bidId: string;
  postingId: string;
  loadId: string;
  carrierId: string;
  bidRate: number;
  currency: "USD";
  estimatedPickupCommitment?: string;
  estimatedDeliveryCommitment?: string;
  expiresAt?: string;
  counterOfferRate?: number;
  counterOfferStatus?: "NONE" | "PENDING" | "ACCEPTED" | "REJECTED";
  message?: string;
  status: BidState;
  receivedAt: string;
  score?: SilMatchScore;
};

export type SilMatchScore = {
  score: number;
  scoreBand: "LOW" | "MEDIUM" | "HIGH" | "EXCELLENT";
  factors?: {
    laneFit: number;
    rateFit: number;
    marginFit: number;
    carrierReliability: number;
    carrierTrust: number;
    timingFit: number;
  };
  riskFlags?: string[];
  governanceReasons?: string[];
  carrierDecisionSummary?: string;
  recommendedAction:
    | "REJECT"
    | "SHORTLIST"
    | "AWARD"
    | "REQUEST_MORE_CONTEXT"
    | "ROUTE_TO_ENCOMPAX";
  evidence: string[];
  governanceSignalRequired: boolean;
};

export type SilDispatchReadinessStatus = "READY" | "READY_WITH_REVIEW" | "HOLD";

export type SilDispatchReadinessResult = {
  loadId: string;
  bidId?: string;
  carrierId?: string;
  postingId?: string;
  shipmentId?: string;
  status: SilDispatchReadinessStatus;
  score: number;
  matchScore?: SilMatchScore;
  blockingReasons: string[];
  reviewReasons: string[];
  evidence: string[];
  governanceSignal?: SilGovernanceSignalDraft;
};

export type SilMarketRateObservation = {
  workspaceId?: string;
  observationId: string;
  laneId: string;
  source: "MANUAL" | "LOAD_BOARD" | "TMS" | "CARRIER_API" | "MARKET_INDEX";
  lowRate?: number;
  medianRate?: number;
  highRate?: number;
  currency: "USD";
  sampleSize?: number;
  observedAt: string;
};

export type SilWorkflowEventType =
  | "LOAD_CREATED"
  | "LOAD_STATUS_CHANGED"
  | "LOAD_POSTED"
  | "BID_RECEIVED"
  | "BID_REVIEWED"
  | "BID_COUNTERED"
  | "CARRIER_AWARDED"
  | "SHIPMENT_STATUS_CHANGED"
  | "GOVERNANCE_SIGNAL_CREATED"
  | "GOVERNANCE_DECISION_RECORDED"
  | "CARRIER_PROVIDER_QUOTE_REQUESTED"
  | "CARRIER_PROVIDER_TRACKING_REQUESTED"
  | "SHIPMENT_PROGRESS_UPDATED"
  | "DISPATCH_READINESS_CHECKED"
  | "CARRIER_PROFILE_UPDATED"
  | "LEAN_RECORD_CREATED"
  | "WORKSPACE_UPDATED";

export type SilWorkflowEvent = {
  workspaceId?: string;
  eventId: string;
  eventType: SilWorkflowEventType;
  occurredAt: string;
  actor: string;
  source: "SYSTEM" | "USER" | "CARRIER_PROVIDER" | "ENCOMPAX" | "MARENGO";
  loadId?: string;
  shipmentId?: string;
  bidId?: string;
  carrierId?: string;
  previousState?: string;
  nextState?: string;
  shipmentState?: ShipmentState;
  summary: string;
  evidence: string[];
  governanceSignal?: SilGovernanceSignalDraft;
};

export type SilLoadTransitionResult = {
  accepted: boolean;
  load: SilLoad;
  previousState: BrokerageLoadState;
  nextState: BrokerageLoadState;
  warnings: string[];
  requiredEvidence: string[];
  event: SilWorkflowEvent;
};

export type SilCarrierProvider = "MANUAL" | "KARRIO" | "MOCK";

export type SilCarrierQuote = {
  quoteId: string;
  provider: SilCarrierProvider;
  carrierId: string;
  carrierName: string;
  serviceLevel: string;
  rate: number;
  currency: "USD";
  estimatedTransitDays?: number;
  confidenceScore: number;
  evidence: string[];
};

export type SilTrackingUpdate = {
  trackingNumber: string;
  provider: SilCarrierProvider;
  carrierId?: string;
  status: ShipmentState;
  location?: LocationRef;
  updatedAt: string;
  evidence: string[];
};

export type SilMarketRateAnalysis = {
  laneId: string;
  loadId?: string;
  bidId?: string;
  marketMedianRate?: number;
  bidRate?: number;
  targetBuyRate?: number;
  targetSellRate?: number;
  projectedMargin?: number;
  rateVariancePercent?: number;
  marginVariance?: number;
  pressureLevel: SilSeverity;
  evidence: string[];
  governanceSignal?: SilGovernanceSignalDraft;
};

export type SilGovernanceSignalDraft = {
  workspaceId?: string;
  signalType: SilGovernanceSignalType;
  sourceModule: "SHIPMENT_INTELLIGENCE_LAYER";
  severity: SilSeverity;
  confidenceScore: number;
  description: string;
  businessDomains: SilBusinessDomain[];
  affectedEntities: {
    loads?: string[];
    shipments?: string[];
    carriers?: string[];
    customers?: string[];
    lanes?: string[];
  };
  metrics: Record<string, number | string | boolean | null>;
  tags: string[];
  recommendedActions: Array<{
    actionType: string;
    targetModule: "SHIPMENT_INTELLIGENCE_LAYER" | "PLATFORM_OVERVIEW" | "MARENGO_DATA_INSIGHTS";
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    description: string;
  }>;
  rawPayloadRef?: string;
};

export type SilMarengoForecastInput = {
  loadId?: string;
  shipmentId?: string;
  laneId?: string;
  customerId?: string;
  carrierId?: string;
  shipmentState?: ShipmentState;
  brokerageState?: BrokerageLoadState;
  mode?: TransportMode;
  equipmentType?: EquipmentType;
  pickupWindowStart?: string;
  deliveryWindowEnd?: string;
  targetBuyRate?: number;
  targetSellRate?: number;
  currentBidRate?: number;
  marketMedianRate?: number;
  onTimeRate?: number;
  falloffRate?: number;
  serviceScore?: number;
  appointmentMissCount?: number;
};
