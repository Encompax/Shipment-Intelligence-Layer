import React, { useState } from "react";
import { ShipmentMetricsWidget } from "./warehouse/ShipmentMetricsWidget";
import { ExceptionsWidget } from "./warehouse/ExceptionsWidget";
import { InTransitWidget } from "./warehouse/InTransitWidget";
import { LiveFeedWidget } from "./warehouse/LiveFeedWidget";
import { CarrierMetricsWidget } from "./warehouse/CarrierMetricsWidget";
import { LotTrackingWidget } from "./warehouse/LotTrackingWidget";
import { StagingVerificationWidget } from "./warehouse/StagingVerificationWidget";
import { PickingTicketsWidget } from "./warehouse/PickingTicketsWidget";
import { QCApprovalsWidget } from "./warehouse/QCApprovalsWidget";
import { FulfillmentTransactionsWidget } from "./warehouse/FulfillmentTransactionsWidget";

type Tab = "fulfillment" | "metrics" | "carriers" | "lot-tracking" | "staging" | "picking" | "qc-approvals" | "exceptions" | "in-transit" | "live-feed";

const tabs: { key: Tab; label: string }[] = [
  { key: "fulfillment",    label: "Fulfillment Transactions" },
  { key: "metrics",        label: "Metrics" },
  { key: "carriers",       label: "Carrier Metrics" },
  { key: "lot-tracking",   label: "Lot Tracking" },
  { key: "staging",        label: "Staging Queue" },
  { key: "picking",        label: "Picking Tickets" },
  { key: "qc-approvals",   label: "QC Approvals" },
  { key: "exceptions",     label: "Exceptions" },
  { key: "in-transit",     label: "In Transit" },
  { key: "live-feed",      label: "Live Feed" },
];

const WarehouseManagementPanel: React.FC = () => {
  const [active, setActive] = useState<Tab>("fulfillment");

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

      {active === "fulfillment"   && <FulfillmentTransactionsWidget />}
      {active === "metrics"        && <ShipmentMetricsWidget />}
      {active === "carriers"       && <CarrierMetricsWidget />}
      {active === "lot-tracking"   && <LotTrackingWidget />}
      {active === "staging"        && <StagingVerificationWidget />}
      {active === "picking"        && <PickingTicketsWidget />}
      {active === "qc-approvals"   && <QCApprovalsWidget />}
      {active === "exceptions"     && <ExceptionsWidget />}
      {active === "in-transit"     && <InTransitWidget />}
      {active === "live-feed"      && <LiveFeedWidget />}
    </div>
  );
};

export default WarehouseManagementPanel;
