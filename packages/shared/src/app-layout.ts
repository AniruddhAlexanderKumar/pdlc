/** Per-account layout preferences for the workspace shell. */
export interface AppLayoutSettings {
  navigation: 'expanded' | 'compact';
  contentWidth: 'full' | 'constrained';
}

export const DEFAULT_APP_LAYOUT: Readonly<AppLayoutSettings> = { navigation: 'expanded', contentWidth: 'full' };

/** Safely read absent or older saved preferences without changing the default layout. */
export function resolveAppLayout(value: unknown): AppLayoutSettings {
  const saved = value && typeof value === 'object' ? (value as Partial<AppLayoutSettings>) : {};
  return {
    navigation: saved.navigation === 'compact' ? 'compact' : 'expanded',
    contentWidth: saved.contentWidth === 'constrained' ? 'constrained' : 'full',
  };
}
