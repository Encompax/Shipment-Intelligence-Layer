import DataSourcesPanel from "../components/DataSourcesPanel";
import SourcingPanel from "../components/SourcingPanel";
import PlanningPanel from "../components/PlanningPanel";
import ProductAlignmentPanel from "../components/ProductAlignmentPanel";
import ProductionManagementPanel from "../components/ProductionManagementPanel";
import TransportationCommandPanel from "../components/TransportationCommandPanel";

export type PanelKey =
  | "transportationCommand"
  | "datasources"
  | "sourcing"
  | "planning"
  | "productAlignment"
  | "production";

export type PanelGroup =
  | "Control Tower"
  | "Plan & Source"
  | "Tender & Execute"
  | "Workspace";

export type PanelConfig = {
  key: PanelKey;
  label: string;
  group: PanelGroup;
  component: React.ComponentType;
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
