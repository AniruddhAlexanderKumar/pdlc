import { RequirementQualityCheck } from '@nexgen/shared-types';

const AMBIGUOUS_WORDS = [
  'adequate',
  'adequately',
  'sufficient',
  'sufficiently',
  'easy',
  'easily',
  'fast',
  'appropriate',
  'appropriately',
  'high-performance',
  'good',
  'standard',
  'normal',
  'reasonable',
  'quick',
  'flexible',
  'user-friendly',
];

export function analyzeRequirementQuality(req: {
  text: string;
  rationale?: string | null;
  allocatedTo?: string | null;
  verificationMethod?: string | null;
}): RequirementQualityCheck[] {
  const warnings: RequirementQualityCheck[] = [];
  const text = (req.text || '').trim();
  const lowerText = text.toLowerCase();

  // Rule 1: Empty or short statement
  if (!text || text.length < 10) {
    warnings.push({
      ruleId: 'REQ-QUAL-001',
      severity: 'Error',
      message: 'Requirement statement is too brief to define verifiable engineering intent.',
      field: 'text',
    });
  }

  // Rule 2: Ambiguous / Subjective terms
  for (const word of AMBIGUOUS_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(lowerText)) {
      warnings.push({
        ruleId: 'REQ-QUAL-002',
        severity: 'Warning',
        message: `Ambiguous term "${word}" detected without explicit measurable acceptance criteria.`,
        field: 'text',
      });
    }
  }

  // Rule 3: Verification obligation phrase
  if (!lowerText.includes('shall') && !lowerText.includes('must') && !lowerText.includes('will')) {
    warnings.push({
      ruleId: 'REQ-QUAL-003',
      severity: 'Warning',
      message: 'Statement lacks standard normative constraint ("shall" or "must").',
      field: 'text',
    });
  }

  // Rule 4: Missing Rationale
  if (!req.rationale || req.rationale.trim().length < 5) {
    warnings.push({
      ruleId: 'REQ-QUAL-004',
      severity: 'Warning',
      message: 'Missing requirement engineering rationale or engineering context.',
      field: 'rationale',
    });
  }

  // Rule 5: Architecture Allocation
  if (!req.allocatedTo) {
    warnings.push({
      ruleId: 'REQ-QUAL-005',
      severity: 'Warning',
      message: 'Orphaned requirement: Not allocated to any Product Breakdown Structure (PBS) element.',
      field: 'allocatedTo',
    });
  }

  // Rule 6: Missing Verification Method
  if (!req.verificationMethod) {
    warnings.push({
      ruleId: 'REQ-QUAL-006',
      severity: 'Error',
      message: 'No verification method specified (must be Test, Inspection, Analysis, or Demonstration).',
      field: 'verificationMethod',
    });
  }

  return warnings;
}
