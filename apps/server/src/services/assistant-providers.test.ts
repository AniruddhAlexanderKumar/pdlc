import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assistantRequestBody, parseAssistantProviders } from './assistant-providers.js';
const fallback={name:'local',baseUrl:'http://localhost:1234/v1',model:'test',apiKey:''};
describe('assistant provider configuration',()=>{
 it('is disabled by default',()=>assert.deepEqual(parseAssistantProviders({ASSISTANT_GEMINI_API_KEY_1:'test'},fallback),[]));
 it('builds ordered Gemini fallback providers using only configured keys',()=>{
  const providers=parseAssistantProviders({ASSISTANT_AI_ENABLED:'true',ASSISTANT_GEMINI_MODEL:'example-model',ASSISTANT_GEMINI_API_KEY_1:'one',ASSISTANT_GEMINI_API_KEY_2:'two',ASSISTANT_GEMINI_API_KEY_3:'three',ASSISTANT_GEMINI_API_KEY_4:'four'},fallback);
  assert.deepEqual(providers.map(p=>p.apiKey),['one','two','three','four']);
  assert(providers.every(p=>p.baseUrl==='https://generativelanguage.googleapis.com/v1beta/openai'&&p.model==='example-model'));
 });
 it('uses AI/ML API first with four Gemini fallbacks and the requested model',()=>{
  const providers=parseAssistantProviders({ASSISTANT_AI_ENABLED:'true',ASSISTANT_AIMLAPI_KEY:'local-test-key',ASSISTANT_GEMINI_MODEL:'test-gemini',ASSISTANT_GEMINI_API_KEY_1:'one',ASSISTANT_GEMINI_API_KEY_2:'two',ASSISTANT_GEMINI_API_KEY_3:'three',ASSISTANT_GEMINI_API_KEY_4:'four'},fallback);
  assert.equal(providers.length,5);
  assert.deepEqual(providers.map(p=>p.name),['AI/ML API','Gemini 1','Gemini 2','Gemini 3','Gemini 4']);
  assert.equal(providers[0].baseUrl,'https://api.aimlapi.com/v1');
  assert.equal(providers[0].model,'openai/gpt-5-5');
  const request=assistantRequestBody(providers[0],[{role:'user',content:'hello'}],500);
  assert.equal(request.model,'openai/gpt-5-5');assert.equal(request.max_tokens,500);assert(!('temperature' in request));
  assert.equal(assistantRequestBody(providers[1],[],500).temperature,0.2);
 });
 it('includes OpenRouter between AI/ML API and Gemini without exposing secrets',()=>{
  const providers=parseAssistantProviders({ASSISTANT_AI_ENABLED:'true',ASSISTANT_AIMLAPI_KEY:'test-ai',ASSISTANT_OPENROUTER_KEY:'test-router',ASSISTANT_OPENROUTER_MODEL:'provider/test-model',ASSISTANT_GEMINI_MODEL:'test-gemini',ASSISTANT_GEMINI_API_KEY_1:'test-gemini'},fallback);
  assert.deepEqual(providers.map(p=>p.name),['AI/ML API','OpenRouter','Gemini 1']);
  assert.equal(providers[1].baseUrl,'https://openrouter.ai/api/v1');
  assert.equal(providers[1].model,'provider/test-model');
  assert.throws(()=>parseAssistantProviders({ASSISTANT_AI_ENABLED:'true',ASSISTANT_OPENROUTER_KEY:'test'},fallback));
  assert.equal(parseAssistantProviders({ASSISTANT_AI_ENABLED:'true',ASSISTANT_OPENROUTER_KEY:'test',ASSISTANT_OPENROUTER_MODEL:'test/model'},fallback).length,1);
 });
 it('supports AI/ML API alone, a model override and custom-provider precedence',()=>{
  const env={ASSISTANT_AI_ENABLED:'true',ASSISTANT_AIMLAPI_KEY:'test',ASSISTANT_AIMLAPI_MODEL:'custom-model'};
  const providers=parseAssistantProviders(env,fallback);
  assert.equal(providers.length,1);assert.equal(providers[0].model,'custom-model');
  assert.equal(parseAssistantProviders({...env,ASSISTANT_PROVIDERS:JSON.stringify([fallback])},fallback)[0].name,'local');
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
