import React, { useMemo, useState } from "react";
import EncompaxMark from "./EncompaxMark";

type TemplateCategory =
  | "Daily Control"
  | "Problem Solving"
  | "Standard Work"
  | "Governance"
  | "Capability Building"
  | "Strategy";

type LeanTemplate = {
  id: string;
  title: string;
  category: TemplateCategory;
  owner: string;
  cadence: string;
  purpose: string;
  sourceReference: string;
  prompts: string[];
  outputs: string[];
  evidence: string[];
  governanceTrigger: string;
};

type ProgramProfile = {
  companyName: string;
  programName: string;
  logoText: string;
  operatingScope: string;
};

const templates: LeanTemplate[] = [
  {
    id: "daily-shipment-control",
    title: "Daily Shipment Control",
    category: "Daily Control",
    owner: "Transportation Planner",
    cadence: "Daily start of shift",
    purpose: "Create a shared view of loads, exceptions, carrier risk, and commitments before work fragments into spreadsheets.",
    sourceReference: "Daily control board plus shipment execution review",
    prompts: [
      "Which shipments or loads are inside the next 24-hour execution window?",
      "Which commitments have no confirmed carrier, appointment, or tracking update?",
      "Which customer-facing promises need governed review before confirmation?",
    ],
    outputs: ["Priority load list", "Owner assignment", "Escalation candidates", "Customer-risk notes"],
    evidence: ["Open load list", "Carrier confirmation state", "Appointment or pickup window", "Customer promise notes"],
    governanceTrigger: "Any high-impact exception, missed appointment risk, or customer promise should route to Encompax review.",
  },
  {
    id: "tiered-escalation",
    title: "Tiered Escalation",
    category: "Daily Control",
    owner: "Operations Lead",
    cadence: "As needed during shift",
    purpose: "Move issues from operator awareness into the right decision lane without over-escalating routine noise.",
    sourceReference: "Tiered escalation and daily management pattern",
    prompts: [
      "What changed from the last known good state?",
      "Who owns the next action, and by when?",
      "Is this a local fix, cross-functional issue, or governance decision?",
    ],
    outputs: ["Escalation level", "Decision owner", "Required evidence", "Follow-up time"],
    evidence: ["Issue statement", "Last known good state", "Owner and due time", "Escalation rationale"],
    governanceTrigger: "Escalate to Encompax when the decision affects service promise, margin, compliance, safety, or customer trust.",
  },
  {
    id: "carrier-award-review",
    title: "Carrier Award Review",
    category: "Governance",
    owner: "Transportation Planner",
    cadence: "Before award on risky loads",
    purpose: "Pressure-test carrier selection using rate, lane, capacity, safety, credit, and falloff risk before dispatch commitment.",
    sourceReference: "Carrier award review and market-rate check",
    prompts: [
      "Is the carrier trusted on this lane and equipment type?",
      "Does the buy rate preserve margin against sell rate and market median?",
      "Are safety, credit, insurance, and falloff indicators acceptable?",
    ],
    outputs: ["Award recommendation", "Risk flags", "Margin check", "Encompax signal when needed"],
    evidence: ["Carrier score", "Sell rate and buy rate", "Lane profile", "Insurance or credit status"],
    governanceTrigger: "Route carrier awards when score is low, carrier trust is unresolved, or margin is below target.",
  },
  {
    id: "standard-work-handoff",
    title: "Shift Handoff Standard Work",
    category: "Standard Work",
    owner: "Outgoing Operator",
    cadence: "End of shift",
    purpose: "Keep operational truth intact when ownership changes hands.",
    sourceReference: "SOP template and shift handoff standard work",
    prompts: [
      "What work is open, blocked, or waiting on outside response?",
      "What changed today that the next user cannot infer from status alone?",
      "Which decisions are pending Encompax or management review?",
    ],
    outputs: ["Open work list", "Blocked items", "Decision trail", "Next-shift priorities"],
    evidence: ["Open work queue", "Blocked items", "Pending approvals", "Owner transfer notes"],
    governanceTrigger: "Route handoff gaps when work affects customer commitment or regulated/compliance-sensitive movement.",
  },
  {
    id: "root-cause-a3",
    title: "A3 Root Cause Brief",
    category: "Problem Solving",
    owner: "Process Owner",
    cadence: "After repeat exception",
    purpose: "Turn recurring operational friction into a structured improvement record.",
    sourceReference: "A3 report, 8D problem solving, RCPS 6W2H, and root-cause workbook",
    prompts: [
      "What is the observed condition and target condition?",
      "What evidence shows this is recurring or material?",
      "What countermeasure can be tested without creating new risk?",
    ],
    outputs: ["Problem statement", "Root cause hypothesis", "Countermeasure", "Follow-up metric"],
    evidence: ["Current condition", "Target condition", "Root-cause evidence", "Countermeasure owner"],
    governanceTrigger: "Route to Encompax when countermeasures change policy, customer commitments, or cross-system process rules.",
  },
  {
    id: "5s-workplace-readiness",
    title: "5S Workplace Readiness",
    category: "Standard Work",
    owner: "Site Lead",
    cadence: "Weekly or before launch",
    purpose: "Give a team a reusable way to stabilize workspace, queue, and visual-control readiness before performance reviews.",
    sourceReference: "5S handbook, 5S facilitator guide, and Intro 5S deck",
    prompts: [
      "What should be sorted, set in order, cleaned, standardized, and sustained?",
      "Which visible controls tell the next operator what normal looks like?",
      "What owner and cadence keep the standard from drifting?",
    ],
    outputs: ["5S area score", "Visual control gaps", "Owner assignment", "Sustainment cadence"],
    evidence: ["Before/after observations", "Area checklist", "Missed standard notes", "Sustainment owner"],
    governanceTrigger: "Route to Encompax if a workplace-readiness gap creates safety, service, compliance, or customer-risk exposure.",
  },
  {
    id: "gemba-walk",
    title: "Gemba Walk Observation",
    category: "Daily Control",
    owner: "Operations Leader",
    cadence: "Weekly or after exception cluster",
    purpose: "Capture what is actually happening in the process before changing a policy, metric, staffing model, or automation rule.",
    sourceReference: "Gemba walk guide",
    prompts: [
      "What did the work show that reports do not show?",
      "Where are people waiting, searching, reworking, or making informal exceptions?",
      "Which observation should become a controlled improvement or governed decision?",
    ],
    outputs: ["Observed condition", "Waste pattern", "Team feedback", "Follow-up decision"],
    evidence: ["Observation notes", "Location or process step", "Team input", "Photo or artifact reference"],
    governanceTrigger: "Route observations when proposed fixes alter operating standards, staffing assumptions, or customer-impacting rules.",
  },
  {
    id: "kaizen-opportunity",
    title: "Kaizen Opportunity",
    category: "Problem Solving",
    owner: "Any Team Member",
    cadence: "Anytime",
    purpose: "Capture small improvements before they disappear into informal workarounds.",
    sourceReference: "CI philosophy and continuous improvement tools",
    prompts: [
      "What task creates avoidable waiting, rework, movement, or confusion?",
      "What simple change would improve flow?",
      "How will we know whether it worked?",
    ],
    outputs: ["Improvement idea", "Expected benefit", "Test owner", "Review date"],
    evidence: ["Current friction", "Proposed change", "Benefit estimate", "Review metric"],
    governanceTrigger: "Route ideas when they touch automated decisions, customer promises, or shared operating standards.",
  },
  {
    id: "sdca-pdca-cycle",
    title: "SDCA / PDCA Improvement Cycle",
    category: "Problem Solving",
    owner: "Continuous Improvement Lead",
    cadence: "Per improvement cycle",
    purpose: "Separate stabilizing an existing standard from testing a new improvement so teams do not confuse reaction with learning.",
    sourceReference: "SDCA / PDCA workbook",
    prompts: [
      "Is this a standardization issue or an improvement experiment?",
      "What must be stabilized before a new countermeasure is tested?",
      "What result will decide whether the new method becomes standard work?",
    ],
    outputs: ["Cycle type", "Experiment plan", "Result measure", "Updated standard"],
    evidence: ["Baseline metric", "Test condition", "Result metric", "Updated SOP reference"],
    governanceTrigger: "Route cycles when the new standard changes cross-team workflow, automation behavior, or decision rights.",
  },
  {
    id: "process-analysis",
    title: "Process Analysis Template",
    category: "Problem Solving",
    owner: "Process Analyst",
    cadence: "Before process redesign",
    purpose: "Break a workflow into steps, handoffs, wait states, rework, and decision points before deciding what should be automated.",
    sourceReference: "Process Analysis Template Master",
    prompts: [
      "Where does the process start and end?",
      "Which handoffs, waits, and rework loops create the most delay?",
      "Which decision points should remain human-governed?",
    ],
    outputs: ["Process map", "Bottleneck list", "Automation candidates", "Governance checkpoints"],
    evidence: ["Step inventory", "Cycle-time notes", "Exception frequency", "Decision checkpoint list"],
    governanceTrigger: "Route process redesign when a workflow change affects customer commitments, controls, or agent decision authority.",
  },
  {
    id: "strategy-execution",
    title: "Strategy to Execution Matrix",
    category: "Strategy",
    owner: "Business Owner",
    cadence: "Monthly operating review",
    purpose: "Translate strategic priorities into measurable operating work and governance checkpoints.",
    sourceReference: "Strategy to Execution Matrix and IBP executive narrative",
    prompts: [
      "Which strategy is this work meant to support?",
      "Which measures prove progress rather than activity?",
      "Which unresolved tradeoffs need governed decision support?",
    ],
    outputs: ["Strategic objective", "Operating metric", "Decision checkpoint", "Review cadence"],
    evidence: ["Objective statement", "Target metric", "Owner", "Review checkpoint"],
    governanceTrigger: "Route when strategy execution creates tradeoffs between margin, service, risk, capacity, or customer trust.",
  },
  {
    id: "training-readiness",
    title: "Training Readiness Record",
    category: "Capability Building",
    owner: "Training Owner",
    cadence: "Before process rollout",
    purpose: "Confirm a team has the knowledge, attendance record, and follow-up standard needed before a process is treated as live.",
    sourceReference: "Training sign-in sheet and CI excellence template",
    prompts: [
      "Who needs to understand the new or revised standard?",
      "What evidence confirms they were trained?",
      "What feedback or readiness gaps should delay rollout?",
    ],
    outputs: ["Training roster", "Readiness gaps", "Follow-up owner", "Release decision"],
    evidence: ["Attendance record", "Training topic", "Readiness notes", "Owner signoff"],
    governanceTrigger: "Route to Encompax if a process cannot safely go live without training or role-readiness confirmation.",
  },
  {
    id: "decision-record",
    title: "Governed Decision Record",
    category: "Governance",
    owner: "Decision Owner",
    cadence: "When a material decision is made",
    purpose: "Preserve why a decision was made, not only what happened.",
    sourceReference: "CI excellence and governed decision record",
    prompts: [
      "What options were considered?",
      "What evidence supported the decision?",
      "What risk remains after the decision?",
    ],
    outputs: ["Decision summary", "Evidence set", "Approver", "Review trigger"],
    evidence: ["Decision options", "Evidence set", "Approver", "Residual risk"],
    governanceTrigger: "All high-risk Encompax decisions should produce a stable decision record.",
  },
];

const categories: Array<"All" | TemplateCategory> = [
  "All",
  "Daily Control",
  "Problem Solving",
  "Standard Work",
  "Governance",
  "Capability Building",
  "Strategy",
];

const defaultProgramProfile: ProgramProfile = {
  companyName: "Example Organization",
  programName: "Operating Excellence Program",
  logoText: "EO",
  operatingScope: "Transportation, fulfillment, inventory, and customer-impacting operations",
};

const LeanOperatingSystemPanel: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<(typeof categories)[number]>("All");
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0].id);
  const [programProfile, setProgramProfile] = useState<ProgramProfile>(defaultProgramProfile);

  const filteredTemplates = useMemo(
    () =>
      activeCategory === "All"
        ? templates
        : templates.filter((template) => template.category === activeCategory),
    [activeCategory]
  );

  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ?? filteredTemplates[0] ?? templates[0];

  const governancePacket = useMemo(
    () => ({
      sourceModule: "SHIPMENT_INTELLIGENCE_LAYER",
      signalType: "LEAN_PROGRAM_TEMPLATE_READY",
      organization: programProfile.companyName,
      program: programProfile.programName,
      template: selectedTemplate.title,
      requiredEvidence: selectedTemplate.evidence,
      expectedOutputs: selectedTemplate.outputs,
      route: selectedTemplate.category === "Governance" ? "governance_council" : "platform_overview",
    }),
    [programProfile.companyName, programProfile.programName, selectedTemplate]
  );

  const updateProgramProfile = (key: keyof ProgramProfile, value: string) => {
    setProgramProfile((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="lean-os">
      <section className="lean-hero">
        <div>
          <p className="transport-eyebrow">Operating Knowledge Base</p>
          <h2>{programProfile.programName}</h2>
          <p>
            A brandable LEAN operating system template for {programProfile.companyName}.
            Capture daily control, standard work, improvement ideas, and governed
            decisions before the work needs deeper Marengo analytics.
          </p>
        </div>
        <div className="lean-brand-card">
          <div className="lean-client-logo" aria-label={`${programProfile.companyName} logo placeholder`}>
            {programProfile.logoText.slice(0, 3).toUpperCase()}
          </div>
          <div>
            <span>{programProfile.companyName}</span>
            <strong>{programProfile.operatingScope}</strong>
          </div>
        </div>
      </section>

      <section className="lean-program-setup">
        <div className="transport-panel-header">
          <div>
            <p className="transport-eyebrow">Program Template</p>
            <h3>Organization Setup</h3>
          </div>
          <div className="lean-encompax-chip">
            <EncompaxMark size={18} />
            <span>Governed by Encompax</span>
          </div>
        </div>

        <div className="lean-profile-grid">
          <label>
            Company Name
            <input
              value={programProfile.companyName}
              onChange={(event) => updateProgramProfile("companyName", event.target.value)}
            />
          </label>
          <label>
            Program Name
            <input
              value={programProfile.programName}
              onChange={(event) => updateProgramProfile("programName", event.target.value)}
            />
          </label>
          <label>
            Logo Text
            <input
              value={programProfile.logoText}
              maxLength={3}
              onChange={(event) => updateProgramProfile("logoText", event.target.value)}
            />
          </label>
          <label>
            Operating Scope
            <input
              value={programProfile.operatingScope}
              onChange={(event) => updateProgramProfile("operatingScope", event.target.value)}
            />
          </label>
        </div>
      </section>

      <div className="lean-category-row">
        {categories.map((category) => (
          <button
            key={category}
            className={`lean-category${activeCategory === category ? " active" : ""}`}
            onClick={() => setActiveCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <section className="lean-layout">
        <div className="lean-template-list">
          <div className="transport-panel-header">
            <div>
          <p className="transport-eyebrow">Templates</p>
              <h3>Program Library</h3>
            </div>
            <span>{filteredTemplates.length} shown</span>
          </div>

          {filteredTemplates.map((template) => (
            <button
              key={template.id}
              className={`lean-template-card${selectedTemplate.id === template.id ? " active" : ""}`}
              onClick={() => setSelectedTemplateId(template.id)}
            >
              <div>
                <strong>{template.title}</strong>
                <span>{template.category}</span>
              </div>
              <p>{template.purpose}</p>
              <small>
                {template.owner} / {template.cadence}
              </small>
            </button>
          ))}
        </div>

        <article className="lean-template-detail">
          <div className="transport-panel-header">
            <div>
              <p className="transport-eyebrow">{selectedTemplate.category}</p>
              <h3>{selectedTemplate.title}</h3>
            </div>
            <span>{selectedTemplate.cadence}</span>
          </div>

          <div className="lean-program-preview">
            <div className="lean-client-logo small">{programProfile.logoText.slice(0, 3).toUpperCase()}</div>
            <div>
              <span>{programProfile.companyName}</span>
              <strong>{selectedTemplate.title}</strong>
            </div>
          </div>

          <div className="lean-detail-grid">
            <div>
              <span>Owner</span>
              <strong>{selectedTemplate.owner}</strong>
            </div>
            <div>
              <span>Cadence</span>
              <strong>{selectedTemplate.cadence}</strong>
            </div>
            <div>
              <span>Source Framework</span>
              <strong>{selectedTemplate.sourceReference}</strong>
            </div>
            <div>
              <span>Encompax Route</span>
              <strong>{governancePacket.route}</strong>
            </div>
          </div>

          <p className="lean-purpose">{selectedTemplate.purpose}</p>

          <div className="lean-template-section">
            <h4>Operating Prompts</h4>
            <ul>
              {selectedTemplate.prompts.map((prompt) => (
                <li key={prompt}>{prompt}</li>
              ))}
            </ul>
          </div>

          <div className="lean-template-section">
            <h4>Expected Outputs</h4>
            <div className="lean-output-grid">
              {selectedTemplate.outputs.map((output) => (
                <span key={output}>{output}</span>
              ))}
            </div>
          </div>

          <div className="lean-template-section">
            <h4>Evidence Checklist</h4>
            <div className="lean-evidence-list">
              {selectedTemplate.evidence.map((item) => (
                <label key={item}>
                  <input type="checkbox" />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="lean-governance-note">
            <EncompaxMark size={24} />
            <div>
              <span>Governance Trigger</span>
              <p>{selectedTemplate.governanceTrigger}</p>
            </div>
          </div>
        </article>
      </section>

      <section className="lean-governance-packet">
        <div className="transport-panel-header">
          <div>
            <p className="transport-eyebrow">Encompax Visibility Packet</p>
            <h3>Template Signal Preview</h3>
          </div>
          <span>{governancePacket.signalType}</span>
        </div>
        <div className="lean-packet-grid">
          <div>
            <span>Organization</span>
            <strong>{governancePacket.organization}</strong>
          </div>
          <div>
            <span>Program</span>
            <strong>{governancePacket.program}</strong>
          </div>
          <div>
            <span>Selected Template</span>
            <strong>{governancePacket.template}</strong>
          </div>
          <div>
            <span>Governance Route</span>
            <strong>{governancePacket.route}</strong>
          </div>
        </div>
        <div className="lean-packet-footer">
          <p>
            When this becomes persisted, this packet is the clean handoff into Encompax:
            organization-scoped template, evidence checklist, operating output, and governance trigger.
          </p>
        </div>
      </section>
    </div>
  );
};

export default LeanOperatingSystemPanel;
