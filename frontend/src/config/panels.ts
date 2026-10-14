import React from "react";

const DataSourcesPanel = React.lazy(() => import("../components/DataSourcesPanel"));
const SourcingPanel = React.lazy(() => import("../components/SourcingPanel"));
const PlanningPanel = React.lazy(() => import("../components/PlanningPanel"));
const ProductAlignmentPanel = React.lazy(() => import("../components/ProductAlignmentPanel"));
const ProductionManagementPanel = React.lazy(() => import("../components/ProductionManagementPanel"));
const TransportationCommandPanel = React.lazy(() => import("../components/TransportationCommandPanel"));
const FacilitiesPanel = React.lazy(() => import("../components/FacilitiesPanel"));
const OrdersPanel = React.lazy(() => import("../components/OrdersPanel"));
const TenderQueuePanel = React.lazy(() => import("../components/TenderQueuePanel"));
const EdiConfigurationPanel = React.lazy(() => import("../components/EdiConfigurationPanel"));

export type PanelKey =
  | "transportationCommand"
  | "datasources"
  | "sourcing"
  | "planning"
  | "productAlignment"
  | "production"
  | "facilities"
  | "orders"
  | "tenders"
  | "edi";

export type PanelGroup =
  | "Control Tower"
  | "Plan & Source"
  | "Tender & Execute"
  | "Workspace";

export type PanelConfig = {
  key: PanelKey;
  label: string;
  group: PanelGroup;
  component: React.LazyExoticComponent<React.ComponentType>;
  showInOverview: boolean;
  requiredPermissions: string[];
};

export const PANEL_CONFIG: PanelConfig[] = [
  // ── Operations ──────────────────────────────────────────────────────────
  {
    key: "sourcing",
    label: "Carrier network & RFPs",
    group: "Plan & Source",
    component: SourcingPanel,
    showInOverview: true,
    requiredPermissions: ["sourcing:view"],
  },
  {
    key: "planning",
    label: "Loads & lanes",
    group: "Plan & Source",
    component: PlanningPanel,
    showInOverview: true,
    requiredPermissions: ["planning:view"],
  },
  {
    key: "orders",
    label: "Orders",
    group: "Plan & Source",
    component: OrdersPanel,
    showInOverview: true,
    requiredPermissions: ["planning:view"],
  },
  {
    key: "facilities",
    label: "Facilities & locations",
    group: "Plan & Source",
    component: FacilitiesPanel,
    showInOverview: false,
    requiredPermissions: ["planning:view"],
  },
  {
    key: "tenders",
    label: "Tender Queue",
    group: "Tender & Execute",
    component: TenderQueuePanel,
    showInOverview: true,
    requiredPermissions: ["production:view"],
  },
  {
    key: "production",
    label: "Active shipments",
    group: "Tender & Execute",
    component: ProductionManagementPanel,
    showInOverview: true,
    requiredPermissions: ["production:view"],
  },
  // ── Logistics ───────────────────────────────────────────────────────────
  {
    key: "transportationCommand",
    label: "My work",
    group: "Control Tower",
    component: TransportationCommandPanel,
    showInOverview: false,
    requiredPermissions: ["transportation:view"],
  },
  {
    key: "datasources",
    label: "Data intake",
    group: "Plan & Source",
    component: DataSourcesPanel,
    showInOverview: true,
    requiredPermissions: ["datasources:view"],
  },
  {
    key: "edi",
    label: "EDI connections",
    group: "Workspace",
    component: EdiConfigurationPanel,
    showInOverview: false,
    requiredPermissions: ["datasources:view"],
  },
  // ── Business ────────────────────────────────────────────────────────────
  {
    key: "productAlignment",
    label: "Workspace configuration",
    group: "Workspace",
    component: ProductAlignmentPanel,
    showInOverview: true,
    requiredPermissions: ["productAlignment:view"],
  },
  // ── Tools ────────────────────────────────────────────────────────────────
];

export const PANEL_GROUPS: PanelGroup[] = ["Control Tower", "Plan & Source", "Tender & Execute", "Workspace"];
