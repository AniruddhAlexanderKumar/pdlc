import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateVoiceDraft } from './voice-validation.js';
const draft = () => ({ product:{name:'Thing',category:'General',stage:'Idea',description:'',target_price:null,labour:0,packaging:0,overhead:0}, project:{project_key:'TEST',name:'Project',description:''}, materials:[], answers:[], issues:[] });
describe('voice draft canonical validation', () => {
  it('normalizes valid question answers and supports multi-select', () => {
    const result=validateVoiceDraft({...draft(),answers:[{question_key:'idea.customer',value:'  Makers  '},{question_key:'idea.excitement',value:'4'},{question_key:'research.channels',value:['Own website','Own website']} ]});
    assert.deepEqual(result.answers.map(a=>a.value),['Makers',4,['Own website']]);
  });
  it('rejects invalid scale, type, choice, unknown and duplicate answers', () => {
    for (const answers of [
      [{question_key:'idea.excitement',value:9}], [{question_key:'idea.customer',value:42}],
      [{question_key:'prototype.version',value:'unknown'}], [{question_key:'does.not.exist',value:'x'}],
      [{question_key:'idea.problem',value:'x'},{question_key:'idea.problem',value:'y'}]
    ]) assert.throws(()=>validateVoiceDraft({...draft(),answers}),/answers\./);
  });
  it('enforces manual product and work-item bounds', () => {
    assert.throws(()=>validateVoiceDraft({...draft(),product:{...draft().product,target_price:-1}}));
    assert.throws(()=>validateVoiceDraft({...draft(),answers:[{question_key:'planning.target_price',value:10000000001}]}));
    assert.throws(()=>validateVoiceDraft({...draft(),answers:[{question_key:'idea.category',value:'x'.repeat(61)}]}));
    assert.throws(()=>validateVoiceDraft({...draft(),materials:[{name:'m',category:'x',unit:'pcs',unit_price:0,quantity:1000001}]}));
    assert.throws(()=>validateVoiceDraft({...draft(),issues:[{summary:'x',description:'x'.repeat(4001),labels:[]}]}));
    assert.throws(()=>validateVoiceDraft({...draft(),issues:[{summary:'x',labels:['a','a']}]}));
    assert.throws(()=>validateVoiceDraft({...draft(),issues:[{summary:'x',milestone_tag:'Launch'}]}),/Milestone tags cannot be imported/);
  });
});
