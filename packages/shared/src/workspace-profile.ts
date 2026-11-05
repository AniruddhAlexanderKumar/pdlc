/** Workspace setup describes priorities; it does not grant access or enable missing modules. */
export const WORK_DOMAINS = ['physical', 'software', 'hardware', 'aerospace', 'research', 'startup', 'service', 'education', 'other'] as const;
export type WorkDomain = typeof WORK_DOMAINS[number];
export const DOMAIN_LABELS: Record<WorkDomain, string> = {
  physical: 'Physical product', software: 'Software or digital product', hardware: 'Hardware and electronics',
  aerospace: 'Aerospace or engineering system', research: 'Research project', startup: 'Startup or business venture',
  service: 'Service or operational project', education: 'Educational or student project', other: 'Something else'
};
export const WORK_REQUIREMENTS = ['projects', 'products', 'collaboration', 'materials', 'analytics', 'ai', 'documentation', 'revisions', 'requirements', 'research', 'roadmaps', 'verification'] as const;
export type WorkRequirement = typeof WORK_REQUIREMENTS[number];
export const REQUIREMENT_LABELS: Record<WorkRequirement, string> = {
  projects: 'Task and project management', products: 'Product development', collaboration: 'Team collaboration',
  materials: 'Supplier and material management', analytics: 'Reporting and analytics', ai: 'AI-assisted workflows',
  documentation: 'Technical documentation', revisions: 'Version and revision tracking', requirements: 'Requirements management',
  research: 'Research documentation', roadmaps: 'Development roadmaps', verification: 'Testing and verification'
};
/** Interests for which no dedicated first-class feature is currently available. */
export const FUTURE_REQUIREMENTS: readonly WorkRequirement[] = ['documentation', 'revisions', 'requirements', 'research', 'roadmaps', 'verification'];
export const NAV_FOCUS = ['projects', 'products', 'materials', 'suppliers', 'teamwork', 'assistant', 'help'] as const;
export type NavFocus = typeof NAV_FOCUS[number];
export const NAV_FOCUS_LABELS: Record<NavFocus, string> = {
  projects: 'Projects', products: 'Products', materials: 'Materials', suppliers: 'Suppliers',
  teamwork: 'Teamwork Graph', assistant: 'AI Assistant', help: 'Help'
};
export const NAV_FOCUS_PATHS: Record<NavFocus, string> = {
  projects: '/projects', products: '/products', materials: '/materials', suppliers: '/suppliers',
  teamwork: '/teamwork-graph', assistant: '/assistant', help: '/help'
};
export interface WorkspaceProfileInput {
  domains: WorkDomain[];
  objective: string;
  requirements: WorkRequirement[];
  navigation: NavFocus[];
}
export interface WorkspaceProfile {
  revision: number;
  profile: WorkspaceProfileInput | null;
}
/** Conservative suggestions only; users explicitly choose what is saved. */
export function suggestWorkspaceNavigation(domains: readonly WorkDomain[], requirements: readonly WorkRequirement[]): NavFocus[] {
  const selected = new Set<NavFocus>(['projects']);
  if (domains.some(x => ['physical', 'hardware', 'aerospace'].includes(x)) || requirements.includes('products')) selected.add('products');
  if (domains.some(x => ['physical', 'hardware', 'aerospace'].includes(x)) || requirements.includes('materials')) {
    selected.add('materials'); selected.add('suppliers');
  }
  if (requirements.includes('collaboration')) selected.add('teamwork');
  if (requirements.includes('ai')) selected.add('assistant');
  return [...selected];
}

/** Do not override an explicitly saved personal dashboard. */
export function isProjectFocusedDefault(profile: WorkspaceProfileInput | null | undefined, isDefault: boolean | undefined): boolean {
  if (!profile || !isDefault) return false;
  const wantsProducts = profile.domains.some(id => ['physical', 'hardware', 'aerospace'].includes(id)) ||
    profile.requirements.includes('products') || profile.navigation.includes('products');
  return !wantsProducts;
}
