import React, { useMemo, useState } from "react";
import EncompaxMark from "./EncompaxMark";
import SILLogo from "./SILLogo";

type ProductStatus = "ACTIVE" | "AVAILABLE" | "PLANNED";

type ProductModule = {
  id: string;
  name: string;
  shortName: string;
  status: ProductStatus;
  category: string;
  purpose: string;
  dataFlow: string;
  unlocks: string[];
  governanceRoute: string;
};

const productModules: ProductModule[] = [
  {
    id: "sil",
    name: "Shipment Intelligence Layer",
    shortName: "SIL",
    status: "ACTIVE",
    category: "Transportation execution",
    purpose: "Manage shipment planning, load posting, bid review, carrier award, lane visibility, and transportation exceptions.",
    dataFlow: "Shipments, loads, bids, carrier decisions, lane rates, workflow events",
    unlocks: ["Load board workflow", "Carrier scoring", "Market-rate checks", "Encompax routing"],
    governanceRoute: "platform_overview",
  },
  {
    id: "marengo",
    name: "Marengo Data Insights",
    shortName: "Marengo",
    status: "AVAILABLE",
    category: "Forecasting and analytics",
    purpose: "Turn SIL execution history into demand, customer-risk, service, and operating-pattern forecasts.",
    dataFlow: "Forecast candidates, customer risk, operational timing, service signals",
    unlocks: ["Forecast governance", "Risk ranking", "Customer intelligence", "Trend interpretation"],
    governanceRoute: "governance_council",
  },
  {
    id: "kardia",
    name: "Kardia Quality Management",
    shortName: "Kardia",
    status: "PLANNED",
    category: "Quality and compliance",
    purpose: "Govern quality events, corrective actions, release readiness, and compliance-sensitive process decisions.",
    dataFlow: "Quality holds, deviations, CAPA evidence, release checkpoints",
    unlocks: ["Quality signal routing", "CAPA evidence", "Release controls", "Audit packet generation"],
    governanceRoute: "ethos_sentinel_review",
  },
  {
    id: "encompax",
    name: "Encompax Governance Core",
    shortName: "Encompax",
    status: "AVAILABLE",
    category: "Decision governance",
    purpose: "Coordinate signal intake, seat routing, council review, decision audit, and operator-readable governance records.",
    dataFlow: "Normalized signals, seat assignments, council reviews, audit decisions",
    unlocks: ["Governance queue", "Seat contracts", "Decision audit", "Agent council readiness"],
    governanceRoute: "platform_overview",
  },
];

const defaultSelected = productModules
  .filter((product) => product.status === "ACTIVE")
  .map((product) => product.id);

const ProductAlignmentPanel: React.FC = () => {
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(defaultSelected);
  const [focusedProductId, setFocusedProductId] = useState("sil");

  const focusedProduct =
    productModules.find((product) => product.id === focusedProductId) ?? productModules[0];

  const selectedProducts = useMemo(
    () => productModules.filter((product) => selectedProductIds.includes(product.id)),
    [selectedProductIds]
  );

  const toggleProduct = (product: ProductModule) => {
    if (product.status === "PLANNED") return;
    setSelectedProductIds((current) =>
      current.includes(product.id)
        ? current.filter((id) => id !== product.id)
        : [...current, product.id]
    );
    setFocusedProductId(product.id);
  };

  return (
    <div className="product-suite">
      <section className="suite-hero">
        <div>
          <p className="transport-eyebrow">Selected Products</p>
          <h2>Organization Product Stack</h2>
          <p>
            Start with SIL, then connect forecasting, quality, and governance modules as the team grows.
            Each selected product keeps its own operating data while Encompax receives only governed signals.
          </p>
        </div>
        <div className="suite-brand-stack">
          <SILLogo size={42} />
          <div>
            <span>Current workspace</span>
            <strong>Shipment Operations</strong>
          </div>
        </div>
      </section>

      <section className="suite-summary-grid">
        <div>
          <span>Active products</span>
          <strong>{selectedProducts.length}</strong>
        </div>
        <div>
          <span>Primary module</span>
          <strong>SIL</strong>
        </div>
        <div>
          <span>Governance handoff</span>
          <strong>Signal only</strong>
        </div>
        <div>
          <span>Org boundary</span>
          <strong>Separated</strong>
        </div>
      </section>

      <section className="suite-layout">
        <div className="suite-product-list">
          {productModules.map((product) => {
            const selected = selectedProductIds.includes(product.id);
            return (
              <button
                key={product.id}
                className={`suite-product-card${focusedProduct.id === product.id ? " active" : ""}`}
                onClick={() => setFocusedProductId(product.id)}
              >
                <div>
                  <strong>{product.shortName}</strong>
                  <span className={`suite-status ${product.status.toLowerCase()}`}>{product.status}</span>
                </div>
                <h3>{product.name}</h3>
                <p>{product.category}</p>
                <label className="suite-select-toggle" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={product.status === "PLANNED"}
                    onChange={() => toggleProduct(product)}
                  />
                  <span>{selected ? "Selected" : product.status === "PLANNED" ? "Roadmap" : "Add product"}</span>
                </label>
              </button>
            );
          })}
        </div>

        <article className="suite-detail-panel">
          <div className="transport-panel-header">
            <div>
              <p className="transport-eyebrow">{focusedProduct.category}</p>
              <h3>{focusedProduct.name}</h3>
            </div>
            <span className={`suite-status ${focusedProduct.status.toLowerCase()}`}>{focusedProduct.status}</span>
          </div>

          <p className="suite-detail-purpose">{focusedProduct.purpose}</p>

          <div className="suite-flow-grid">
            <div>
              <span>Data kept inside module</span>
              <strong>{focusedProduct.dataFlow}</strong>
            </div>
            <div>
              <span>Encompax route</span>
              <strong>{focusedProduct.governanceRoute}</strong>
            </div>
          </div>

          <div className="suite-unlocks">
            <h4>What this unlocks</h4>
            <div>
              {focusedProduct.unlocks.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>

          <div className="suite-governance-card">
            <EncompaxMark size={28} />
            <div>
              <span>Governed connection style</span>
              <p>
                Product data remains scoped to the organization and module. Encompax receives normalized events,
                evidence, and routing metadata when a decision requires governance.
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="suite-selected-strip">
        <div>
          <p className="transport-eyebrow">Current Selection</p>
          <h3>Enabled Product Path</h3>
        </div>
        <div className="suite-path">
          {selectedProducts.map((product) => (
            <span key={product.id}>{product.shortName}</span>
          ))}
          <span className="suite-path-governed">Encompax Review</span>
        </div>
      </section>
    </div>
  );
};

export default ProductAlignmentPanel;
