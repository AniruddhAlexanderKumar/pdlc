import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { landingText, navigationLabel, languageOptions, languageTag, partialNotice } from './language';
describe('partial language catalog',()=>{
 it('offers the requested languages with English first and simplified Chinese',()=>{assert.deepEqual(languageOptions.map(x=>x.value),['en','hi','zh','fr']);assert.equal(languageTag.zh,'zh-Hans');});
 it('translates selected navigation and hero text and safely falls back',()=>{for(const lang of ['hi','zh','fr'] as const){assert.notEqual(navigationLabel('Projects',lang),'Projects');assert.notEqual(landingText('Try the demo',lang),'Try the demo');assert(partialNotice[lang]);}assert.equal(navigationLabel('Not translated','fr'),'Not translated');assert.equal(landingText('Not translated','zh'),'Not translated');});
});
