/** Fictional walkthrough data. It is illustrative only and never touches an account or API. */
export type ScenarioStatus = 'Proposed' | 'Under review' | 'Assigned' | 'Passed' | 'Failed' | 'Recorded' | 'Blocked';
export type RecordKind = 'Change request' | 'Requirement' | 'Decision' | 'Document' | 'Task' | 'Verification' | 'Evidence' | 'Release';
export interface ScenarioRecord { id: string; kind: RecordKind; title: string; status: ScenarioStatus; detail: string; links: string[] }
export const SCENARIO: ScenarioRecord[] = [
  { id: 'CR-004', kind: 'Change request', title: 'Revise thermal limit', status: 'Proposed', detail: 'Propose a maximum operating temperature of 85°C for the actuator housing.', links: ['REQ-014', 'REQ-021', 'DEC-003', 'DOC-008'] },
  { id: 'REQ-014', kind: 'Requirement', title: 'Operating temperature', status: 'Under review', detail: 'The actuator housing must remain at or below 85°C during the specified operating cycle.', links: ['CR-004', 'VRF-006'] },
  { id: 'REQ-021', kind: 'Requirement', title: 'Vibration tolerance', status: 'Under review', detail: 'The actuator assembly must meet its specified vibration profile after the change.', links: ['CR-004', 'VRF-011'] },
  { id: 'DEC-003', kind: 'Decision', title: 'Thermal design approach', status: 'Recorded', detail: 'Review the proposed thermal limit with the mechanical and test teams before approval.', links: ['CR-004', 'DOC-008'] },
  { id: 'DOC-008', kind: 'Document', title: 'Actuator specification', status: 'Under review', detail: 'The component specification must reflect the proposed operating limit once approved.', links: ['CR-004', 'DEC-003'] },
  { id: 'TASK-018', kind: 'Task', title: 'Review housing and specification', status: 'Assigned', detail: 'Mechanical engineering reviews the proposed limit and specification update.', links: ['CR-004', 'DOC-008'] },
  { id: 'TASK-019', kind: 'Task', title: 'Investigate vibration result', status: 'Assigned', detail: 'The verification team investigates the failed vibration run before release.', links: ['VRF-011', 'EVD-012'] },
  { id: 'VRF-006', kind: 'Verification', title: 'Thermal operating test', status: 'Passed', detail: 'The thermal operating test for REQ-014 passed in this illustrative run.', links: ['REQ-014', 'EVD-009'] },
  { id: 'EVD-009', kind: 'Evidence', title: 'Thermal test report', status: 'Recorded', detail: 'The report supports the passed result for VRF-006 and REQ-014.', links: ['VRF-006', 'REQ-014'] },
  { id: 'VRF-011', kind: 'Verification', title: 'Vibration test', status: 'Failed', detail: 'The vibration test for REQ-021 failed in this illustrative run; investigation remains open.', links: ['REQ-021', 'EVD-012', 'TASK-019'] },
  { id: 'EVD-012', kind: 'Evidence', title: 'Vibration test report', status: 'Recorded', detail: 'The report records the failed result for VRF-011 and REQ-021.', links: ['VRF-011', 'REQ-021'] },
  { id: 'REL-002', kind: 'Release', title: 'Release readiness', status: 'Blocked', detail: 'The failed vibration test and pending change approval block release readiness.', links: ['CR-004', 'VRF-011', 'TASK-019'] }
];
export const STEPS = [
  { title: 'Change request', summary: 'A proposed thermal limit starts the review.', records: ['CR-004'] },
  { title: 'Impact analysis', summary: 'Follow the proposed change to the requirements, decision and specification.', records: ['REQ-014', 'REQ-021', 'DEC-003', 'DOC-008'] },
  { title: 'Task distribution', summary: 'Coordinate the specification review and the failed test investigation.', records: ['TASK-018', 'TASK-019'] },
  { title: 'Verification', summary: 'Examine both test results and the reports supporting them.', records: ['VRF-006', 'EVD-009', 'VRF-011', 'EVD-012'] },
  { title: 'Release readiness', summary: 'Identify the failed test and the decision still awaiting approval.', records: ['REL-002', 'VRF-011', 'CR-004'] }
] as const;
export const SCENARIO_BY_ID = Object.fromEntries(SCENARIO.map(record => [record.id, record])) as Record<string, ScenarioRecord>;
