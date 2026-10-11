// NexGen PLM Frontend API Client

const API_BASE = '/api/v1';

let authToken: string | null = localStorage.getItem('nexgen_auth_token');

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('nexgen_auth_token', token);
  } else {
    localStorage.removeItem('nexgen_auth_token');
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type');
  const data = contentType && contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const errorMsg = data?.error || res.statusText || 'An error occurred';
    const err = new Error(errorMsg) as any;
    err.status = res.status;
    err.details = data?.details;
    err.criteria = data?.criteria;
    err.blockers = data?.blockers;
    throw err;
  }

  return data as T;
}

export const api = {
  // Auth
  login: (credentials: { email: string; password: string }) =>
    request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),
  getMe: () => request<{ user: any }>('/auth/me'),

  // Project & Telemetry
  getProjects: () => request<any[]>('/projects'),
  getProject: (id: string) => request<any>(`/projects/${id}`),
  getTelemetry: (id: string) => request<any>(`/projects/${id}/telemetry`),
  resetDemo: () => request<any>('/system/seed', { method: 'POST' }),

  // Requirements
  getRequirements: (projectId?: string) =>
    request<any[]>(`/requirements${projectId ? `?projectId=${projectId}` : ''}`),
  getRequirement: (id: string) => request<any>(`/requirements/${id}`),
  createRequirement: (data: any) =>
    request<any>('/requirements', { method: 'POST', body: JSON.stringify(data) }),
  updateRequirement: (id: string, data: any) =>
    request<any>(`/requirements/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  updateRequirementStatus: (id: string, status: string) =>
    request<any>(`/requirements/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  checkRequirementQuality: (id: string) =>
    request<any>(`/requirements/${id}/quality-check`, { method: 'POST' }),

  // Architecture
  getArchitecture: (projectId?: string) =>
    request<any[]>(`/architecture${projectId ? `?projectId=${projectId}` : ''}`),
  createArchitecture: (data: any) =>
    request<any>('/architecture', { method: 'POST', body: JSON.stringify(data) }),
  updateArchitecture: (id: string, data: any) =>
    request<any>(`/architecture/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Verification & Validation
  getVerificationProcs: (projectId?: string) =>
    request<any[]>(`/verification${projectId ? `?projectId=${projectId}` : ''}`),
  getVerificationProc: (id: string) => request<any>(`/verification/${id}`),
  createVerificationProc: (data: any) =>
    request<any>('/verification', { method: 'POST', body: JSON.stringify(data) }),
  executeTest: (id: string, executionData: any) =>
    request<any>(`/verification/${id}/execute`, { method: 'POST', body: JSON.stringify(executionData) }),

  // Change Control
  getImpactAnalysis: (params: { projectId: string; targetReqId?: string | null; targetSysId?: string | null }) =>
    request<any>('/changes/impact-analysis', { method: 'POST', body: JSON.stringify(params) }),
  getECRs: (projectId?: string) =>
    request<any[]>(`/changes/ecr${projectId ? `?projectId=${projectId}` : ''}`),
  createECR: (data: any) =>
    request<any>('/changes/ecr', { method: 'POST', body: JSON.stringify(data) }),
  approveECR: (id: string) =>
    request<any>(`/changes/ecr/${id}/approve`, { method: 'POST' }),
  rejectECR: (id: string) =>
    request<any>(`/changes/ecr/${id}/reject`, { method: 'POST' }),
  promoteToECO: (id: string) =>
    request<any>(`/changes/ecr/${id}/promote-eco`, { method: 'POST' }),
  getECOs: (projectId?: string) =>
    request<any[]>(`/changes/eco${projectId ? `?projectId=${projectId}` : ''}`),

  // Risk & Safety
  getRisks: (projectId?: string) =>
    request<any[]>(`/risks${projectId ? `?projectId=${projectId}` : ''}`),
  createRisk: (data: any) =>
    request<any>('/risks', { method: 'POST', body: JSON.stringify(data) }),
  updateRisk: (id: string, data: any) =>
    request<any>(`/risks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Quality & Nonconformance
  getNonconformances: (projectId?: string) =>
    request<any[]>(`/nonconformances${projectId ? `?projectId=${projectId}` : ''}`),
  getNonconformance: (id: string) => request<any>(`/nonconformances/${id}`),
  createNonconformance: (data: any) =>
    request<any>('/nonconformances', { method: 'POST', body: JSON.stringify(data) }),
  updateNonconformance: (id: string, data: any) =>
    request<any>(`/nonconformances/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  closeNonconformance: (id: string, data: { closureEvidence: string; correctiveAction?: string }) =>
    request<any>(`/nonconformances/${id}/close`, { method: 'POST', body: JSON.stringify(data) }),

  // Baselines
  getBaselines: (projectId?: string) =>
    request<any[]>(`/baselines${projectId ? `?projectId=${projectId}` : ''}`),
  createBaseline: (data: any) =>
    request<any>('/baselines', { method: 'POST', body: JSON.stringify(data) }),
  compareBaselines: (baselineIdA: string, baselineIdB: string) =>
    request<any>('/baselines/compare', { method: 'POST', body: JSON.stringify({ baselineIdA, baselineIdB }) }),

  // Releases
  getReleases: (projectId?: string) =>
    request<any[]>(`/releases${projectId ? `?projectId=${projectId}` : ''}`),
  getGateReadiness: (projectId: string) =>
    request<any>(`/releases/evaluate-readiness?projectId=${projectId}`),
  createReleaseCandidate: (data: any) =>
    request<any>('/releases/candidate', { method: 'POST', body: JSON.stringify(data) }),
  executeRelease: (id: string) =>
    request<any>(`/releases/${id}/execute-release`, { method: 'POST' }),

  // Documents
  getDocuments: (projectId?: string) =>
    request<any[]>(`/documents${projectId ? `?projectId=${projectId}` : ''}`),
  createDocument: (data: any) =>
    request<any>('/documents', { method: 'POST', body: JSON.stringify(data) }),
  updateDocument: (id: string, data: any) =>
    request<any>(`/documents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Opportunities
  getOpportunities: () => request<any[]>('/opportunities'),
  createOpportunity: (data: any) =>
    request<any>('/opportunities', { method: 'POST', body: JSON.stringify(data) }),
  approveOpportunity: (id: string) =>
    request<any>(`/opportunities/${id}/approve`, { method: 'POST' }),
  convertToProject: (id: string, data: any) =>
    request<any>(`/opportunities/${id}/convert-to-project`, { method: 'POST', body: JSON.stringify(data) }),

  // Tasks
  getTasks: (projectId?: string) =>
    request<any[]>(`/tasks${projectId ? `?projectId=${projectId}` : ''}`),
  createTask: (data: any) =>
    request<any>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id: string, data: any) =>
    request<any>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Audit
  getAuditEvents: (projectId?: string) =>
    request<any[]>(`/audit${projectId ? `?projectId=${projectId}` : ''}`),

  // Search
  search: (q: string, projectId?: string) =>
    request<{ results: any[] }>(`/search?q=${encodeURIComponent(q)}${projectId ? `&projectId=${projectId}` : ''}`),
};
