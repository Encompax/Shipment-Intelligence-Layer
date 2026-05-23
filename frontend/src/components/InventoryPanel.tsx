import React, { useState } from "react";
import { InventoryMetricsWidget } from "./inventory/InventoryMetricsWidget";
import { LiveInventoryWidget } from "./inventory/LiveInventoryWidget";
import { InventoryMovementTransactions } from "./inventory/InventoryMovementTransactions";
import { VisualInventoryMap } from "./inventory/VisualInventoryMap";
import { ItemTrackingView } from "./inventory/ItemTrackingView";
import { CycleCountTransactions } from "./inventory/CycleCountTransactions";

type Tab = "metrics" | "live-inventory" | "movements" | "map" | "tracking" | "cycle-counts";

const tabs: { key: Tab; label: string }[] = [
  { key: "cycle-counts", label: "Cycle Counts by Department" },
  { key: "metrics", label: "Cycle Count Metrics" },
  { key: "live-inventory", label: "Live Inventory" },
  { key: "movements", label: "Movement Transactions" },
  { key: "map", label: "Visual Map" },
  { key: "tracking", label: "Item Tracking" },
];

const InventoryPanel: React.FC = () => {
  const [active, setActive] = useState<Tab>("cycle-counts");

  return (
    <div>
      <div className="tab-bar">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`tab-bar-item${active === t.key ? " active" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === "cycle-counts" && <CycleCountTransactions />}
      {active === "metrics" && <InventoryMetricsWidget />}
      {active === "live-inventory" && <LiveInventoryWidget />}
      {active === "movements" && <InventoryMovementTransactions />}
      {active === "map" && <VisualInventoryMap />}
      {active === "tracking" && <ItemTrackingView />}
    </div>
  );
};

export default InventoryPanel;
