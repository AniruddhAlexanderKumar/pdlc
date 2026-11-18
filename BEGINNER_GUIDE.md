# Your first product in Solution Velocity

You do not need a finished business plan. Bring a working name and a problem you would like to understand. If you only want to explore, **Explore demo** on the landing page opens temporary sample data instead of changing a real workspace.

## Start a chapter

1. Choose **Start building**. Create a personal workspace if it is just you, or a team workspace to invite collaborators. If registration is closed, use an invitation or request access.
2. Name your product and choose a kind, a starting chapter and the guidance that suits you. Beginner guidance explains terms and shows an example; advanced guidance asks for a more precise specification. Both save to the same record. Starting at Planning does **not** mark Idea or Research complete.
3. Complete one activity. For example, in Idea, “A booking page that helps tutors fill cancelled lessons” is a product concept. It is not evidence that tutors will pay for it. Select **Complete activity**, then **Read brief** to see exactly what was saved.
4. Stopping midway? **Save for later** stores your private draft. Use **Resume draft** on the building desk to return to it. Typing alone does not save it. **Revise** edits the team’s recorded section. If someone changed it since you started, read the new record before keeping your edits.

## What to do next

- **Research:** compare two alternatives on one criterion. Classify a notebook entry as an assumption, a research finding or independent evidence. For the latter two, include a traceable source; the system does not verify it. “Not yet” is an honest answer about interviews. Link a product task to Research so someone can do the next investigation.
- **Planning and Design:** define an MVP (the smallest useful version to try), order features with the arrow controls or drag handle, and describe the user’s path through it. Check the chapter brief for missing sections.
- **Prototype, Testing and Launch:** record a learning objective, resources and a Prototype task. Use one consistent cost basis, such as one unit, visit or subscription month. Add materials when they apply. Record test results and launch readiness, including checks that are **not** complete. A planned test is not a successful test.
- **Improvement:** write down what happened, rank the next changes and choose which chapter to return to. **Start next cycle** changes the active chapter, not the contents of earlier briefs. Archiving is separate; reaching Improvement never retires the product automatically.

Open **Journey** to inspect the core checklist. Expand an activity to see its recorded answer, assignment, comments, prerequisites and review controls. Workspace owners/admins can sign off interview coverage, design must-haves and testing criteria. In a personal workspace, you can review your own decision. Sign-off confirms the record, not the underlying claim. Editing a signed-off answer requires a fresh review.

The **Founder copilot** can explain the current activity or point you to the next one. When a model is configured, review its suggestion; copying suggested text to a draft is not a save. Avoid including secrets or identifying interview details. When no model is available, the built-in guide still works.

Use **Workspace overview** for existing project widgets and saved layouts. The building desk’s percentages reflect recorded core work; the health score combines answers, cost inputs, estimated margin and tasks. Neither is a company valuation. XP is credited for first-time work, not repeated edits. Streaks are optional, and team rankings can be hidden in Settings.

---

<details>
<summary>Reference for the separate Next/Prisma engineering platform (not the root workspace)</summary>

## Beginner’s Guide to the engineering platform

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

</details>
