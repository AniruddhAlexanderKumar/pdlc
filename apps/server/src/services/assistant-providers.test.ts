import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAssistantProviders } from './assistant-providers.js';
const fallback={name:'local',baseUrl:'http://localhost:1234/v1',model:'test',apiKey:''};
describe('assistant provider configuration',()=>{
 it('is disabled by default',()=>assert.deepEqual(parseAssistantProviders({ASSISTANT_GEMINI_API_KEY_1:'test'},fallback),[]));
 it('builds ordered Gemini fallback providers using only configured keys',()=>{
  const providers=parseAssistantProviders({ASSISTANT_AI_ENABLED:'true',ASSISTANT_GEMINI_MODEL:'example-model',ASSISTANT_GEMINI_API_KEY_1:'one',ASSISTANT_GEMINI_API_KEY_2:'two',ASSISTANT_GEMINI_API_KEY_3:'three',ASSISTANT_GEMINI_API_KEY_4:'four'},fallback);
  assert.deepEqual(providers.map(p=>p.apiKey),['one','two','three','four']);
  assert(providers.every(p=>p.baseUrl==='https://generativelanguage.googleapis.com/v1beta/openai'&&p.model==='example-model'));
 });
 it('requires a model for Gemini and gives explicit provider configuration precedence',()=>{
  assert.throws(()=>parseAssistantProviders({ASSISTANT_AI_ENABLED:'true',ASSISTANT_GEMINI_API_KEY_1:'test'},fallback));
  assert.equal(parseAssistantProviders({ASSISTANT_AI_ENABLED:'true',ASSISTANT_GEMINI_API_KEY_1:'test',ASSISTANT_PROVIDERS:JSON.stringify([{...fallback,name:'custom'}])},fallback)[0].name,'custom');
 });
 it('rejects insecure or credential-bearing remote URLs',()=>{
  const providers=[{...fallback,baseUrl:'http://remote.example/v1'},{...fallback,baseUrl:'https://user:pass@example.com/v1'},{...fallback,baseUrl:'https://example.com/v1?secret=test'}];
  assert.deepEqual(parseAssistantProviders({ASSISTANT_AI_ENABLED:'true',ASSISTANT_PROVIDERS:JSON.stringify(providers)},fallback),[]);
 });
});
