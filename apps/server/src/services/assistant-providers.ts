import { z } from 'zod';

const providerSchema = z.object({name:z.string().min(1).max(60),baseUrl:z.string().url(),model:z.string().min(1).max(120),apiKey:z.string().default('')}).strict();
export type AssistantProvider = z.infer<typeof providerSchema>;

/** Keys are read only from the backend environment. Never include values in errors or logs. */
export function parseAssistantProviders(env: NodeJS.ProcessEnv, fallback: AssistantProvider): AssistantProvider[] {
  if (env.ASSISTANT_AI_ENABLED !== 'true') return [];
  let providers: AssistantProvider[];
  if (env.ASSISTANT_PROVIDERS) {
    providers = z.array(providerSchema).min(1).max(4).parse(JSON.parse(env.ASSISTANT_PROVIDERS));
  } else {
    const keys = [1,2,3,4].map(i => env[`ASSISTANT_GEMINI_API_KEY_${i}`]?.trim() ?? '').filter(Boolean);
    if (keys.length) {
      const model = z.string().trim().min(1).max(120).parse(env.ASSISTANT_GEMINI_MODEL);
      providers = keys.map((apiKey,i) => ({name:`Gemini ${i+1}`,baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai',model,apiKey}));
    } else {
      providers = [providerSchema.parse(fallback)];
    }
  }
  return providers.filter(p=>{const u=new URL(p.baseUrl);return !u.username && !u.password && !u.search && !u.hash && (u.protocol==='https:' || (u.protocol==='http:' && ['localhost','127.0.0.1','::1'].includes(u.hostname)));});
}
