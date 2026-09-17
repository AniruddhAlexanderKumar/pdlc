# Beginner's Guide to PDLC Platform

Welcome to the **Aerospace Product Development Life Cycle (PDLC) Platform**. This guide introduces the core concepts, user interface navigation, engineering graph principles, and situation-aware tools built into the software.

---

## 1. Core Principles & Philosophy

PDLC Platform is a modular monolith engineering control system designed specifically for aerospace and mission-critical engineering. Unlike generic project management software, PDLC operates under strict engineering principles:

- **Connected Engineering Graph**: Artifacts (Stakeholder Needs, Requirements, Engineering Decisions, Design Items, Interfaces, Verification Activities, Risks, Issues, Change Requests, Baseline Items) are nodes on a connected graph. Traceability is explicit, stored in relational link tables, never inferred by free-text matching.
- **Deterministic Reasoning Engine**: System relationships and status transitions are validated deterministically. The system will never invent a severity score, confidence percentage, or readiness rating.
- **Decision Memory & Sentinel**: Decisions explicitly record what alternatives were considered, what assumptions must remain true, and what performance was expected. Decision Sentinel monitors upstream engineering changes and alerts you when stored decision assumptions require re-evaluation.
- **Zero Opaque Metric Computations**: All findings describe real graph paths, direct links, and explicit classifications.

---

## 2. Navigating the Workspace

When you sign in and select a project, your workspace sidebar is organized into lifecycle activity groups:

1. **Understand** (`/dashboard`, `/traceability`, `/sentinel`, `/history`):
   - **Command Center**: View project health, open change requests, Sentinel alerts, and baseline drift.
   - **Traceability Matrix**: Traverses upstream and downstream relationships across requirements, decisions, design items, and verifications.
   - **Decision Sentinel**: Inspects active surveillance targets triggered by engineering changes.
   - **History**: Reconstructs complete audit trails for any artifact.

2. **Define** (`/requirements`, `/needs`):
   - **Stakeholder Needs**: Origination of user and mission problem statements.
   - **Requirements**: Functional and performance specifications mapped directly to stakeholder needs.

3. **Decide** (`/decisions`, `/design`, `/interfaces`):
   - **Engineering Decisions**: Architectural trade studies, rationale, alternatives considered, and assumptions.
   - **Design Items**: System, subsystem, assembly, component, and software elements.
   - **Interfaces**: Mechanical, electrical, thermal, fluid, and software boundary definitions between components.

4. **Prove** (`/verification`, `/evidence`, `/readiness`):
   - **Verification Activities**: Planned or executed Analysis, Inspection, Test, and Demonstration procedures.
   - **Evidence**: Test logs, reports, and validation records attached to verification activities.
   - **Readiness**: Assessments of technical and verification execution readiness.

5. **Change** (`/changes`, `/baselines`, `/drift`):
   - **Change Requests**: Formally declared scope changes evaluated through multi-hop graph impact analysis.
   - **Baselines & Drift**: Snapshot engineering baselines and detect operational deviation over time.

6. **Certify** (`/certification`):
   - **Certification Basis & Compliance**: Track regulatory compliance items, means of compliance, and certification authority findings.

---

## 3. Key Keyboard Shortcuts & Productivity Features

- **Jump-to Command Palette**: Press `Ctrl + K` (or `Cmd + K`) anywhere to instantly jump to any module, settings page, or project tool.
- **Interactive Onboarding Tour**: Displays automatically on your first sign-in into the workspace. You can re-trigger it anytime from the top bar or Help page (`/help`).
- **Situation-Aware AI Assistant**: Click the AI icon (`Sparkles` ✨) in the top bar to open your context-conscious co-pilot.

---

## 4. Using the Situation-Aware AI Assistant

The **Situation-Aware AI Assistant** automatically detects your current context inside the application:
- **Location Awareness**: Senses whether you are viewing Requirements, Engineering Decisions, Sentinel Alerts, Change Requests, or Verification.
- **Project & Role Context**: Adapts recommendations to your current project and authorization role (`OWNER`, `MANAGER`, `ENGINEER`, `REVIEWER`, `VIEWER`).
- **Contextual Actions**:
  - *Analyze Page Context*: Summarizes what needs attention on the current page.
  - *Traceability & Gap Analysis*: Highlights unlinked requirements or missing verification links.
  - *Sentinel Alert Explanation*: Clarifies why an upstream change triggered a decision surveillance alert.
  - *Engineering Assistance*: Helps draft clear requirements and structure trade-off alternatives.

---

## 5. Step-by-Step Walkthrough for Your First Project

1. **Create or Join a Project**:
   - Go to **Projects → New Project** or select an existing project from the top bar picker.
2. **Capture Originating Needs**:
   - Navigate to **Define → Stakeholder Needs** and click **New Need** (e.g., `NEED-001: Autonomous Payload Deployment`).
3. **Draft Requirements & Link to Needs**:
   - Navigate to **Define → Requirements** and add `REQ-001`. Link it to `NEED-001`.
4. **Record Engineering Decisions**:
   - Under **Decide → Decisions**, log key architectural choices (`DEC-001`). List alternatives considered and record explicit assumptions.
5. **Set Up Verification**:
   - Go to **Prove → Verification**, create `VER-001` (e.g. Thermal Vacuum Test), and link it to `REQ-001`.
6. **Evaluate Readiness & Sentinel**:
   - Use **Decision Sentinel** and **Command Center** to monitor changes and verify system readiness.

---

## 6. Need Help?

- Visit the in-app **Help & Reference** page (`/help`) for FAQs, transition explorers, and domain limit simulators.
- Open the **Situation-Aware AI Assistant** anytime by clicking the ✨ button in the top bar.
