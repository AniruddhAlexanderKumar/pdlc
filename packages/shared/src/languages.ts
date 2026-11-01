export const SUPPORTED_LANGUAGES = ['en', 'zh', 'hi', 'es', 'fr'] as const;
export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];
