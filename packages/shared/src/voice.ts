import type { StageId } from './stages.js';
import type { IssuePriority, IssueStatus, IssueType } from './projects.js';
import type { Product } from './types.js';
import type { AnswerValue } from './questions.js';

export interface VoiceProductDraft {
  name: string;
  category: string;
  stage: StageId;
  description: string;
  target_price: number | null;
  labour: number;
  packaging: number;
  overhead: number;
}

export interface VoiceAnswerDraft {
  question_key: string;
  value: AnswerValue;
}

export interface VoiceMaterialDraft {
  name: string;
  category: string;
  unit: string;
  unit_price: number;
  quantity: number;
}

export interface VoiceProjectDraft {
  project_key: string;
  name: string;
  description: string;
}

export interface VoiceIssueDraft {
  type: IssueType;
  status: IssueStatus;
  priority: IssuePriority;
  summary: string;
  description: string;
  labels: string[];
  milestone_tag?: string;
}

export interface VoiceImportPayload {
  product: VoiceProductDraft;
  answers: VoiceAnswerDraft[];
  materials: VoiceMaterialDraft[];
  project: VoiceProjectDraft;
  issues: VoiceIssueDraft[];
}

export interface VoiceProcessResult {
  data: VoiceImportPayload;
  provider: 'llama-cpp' | 'qwen' | 'gemini' | 'server_fallback';
}

export interface VoiceImportResult {
  productId: string;
  projectId: string;
  projectKey: string;
  product: Product;
}
