import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newDraft, canAdvance, buildCampaign, loadCampaigns, campaignKey, validateStudents} from '../src/workflow.js';
import {parseCSV,validateRows,sampleCSV} from '../src/data.js';
import {isAdmin} from '../src/auth.js';

function completeDraft(){return {...newDraft(),department:'CSE',year:'2nd year',section:'A',type:'Attendance / mentoring',students:validateRows(parseCSV(sampleCSV)),confirmed:true,questions:['How can we support your child?'],name:'CSE attendance'};}
test('wizard cannot advance without each selection',()=>{
  const draft=newDraft();for(let i=0;i<7;i++)assert.equal(canAdvance(i,draft),false);
  assert.equal(canAdvance(0,{...draft,department:'CSE'}),true);
});
test('students must be both valid and explicitly confirmed',()=>{
  const draft=completeDraft();assert.equal(canAdvance(4,draft),true);
  assert.equal(canAdvance(4,{...draft,confirmed:false}),false);
  draft.students[0].phone='123';assert.equal(canAdvance(4,draft),false);
});
test('invalid questions and call preferences block confirmation',()=>{
  const draft=completeDraft();
  assert.equal(canAdvance(5,{...draft,questions:[' ']}),false);
  assert.equal(canAdvance(5,{...draft,questions:[]}),false);
  assert.equal(canAdvance(5,{...draft,settings:{...draft.settings,concurrency:6}}),false);
  assert.equal(canAdvance(5,{...draft,settings:{...draft.settings,duration:61}}),false);
});
test('confirmed campaigns contain real uploaded students and zero calls',()=>{
  const campaign=buildCampaign(completeDraft(),'campaign-1','2026-11-02T12:00:00Z');
  assert.equal(campaign.students.length,2);assert.deepEqual(campaign.calls,[]);assert.equal(campaign.status,'Prepared');
  assert.equal(campaign.students[0].errors,undefined);
  assert.throws(()=>buildCampaign({...completeDraft(),confirmed:false},'x','now'),/Complete every step/);
});
test('fixing an invalid row revalidates the record',()=>{
  const draft=completeDraft();draft.students[1].phone='wrong';
  assert.equal(validateStudents(draft.students,draft)[1].errors.length,1);
  draft.students[1].phone='9876543210';assert.equal(validateStudents(draft.students,draft)[1].errors.length,0);
});
test('campaign storage is scoped to user and handles corruption',()=>{
  assert.notEqual(campaignKey('user-a'),campaignKey('user-b'));
  assert.deepEqual(loadCampaigns('a',{getItem:()=>null}),{campaigns:[],error:''});
  assert.ok(loadCampaigns('a',{getItem:()=>'{broken'}).error);
  assert.ok(loadCampaigns('a',{getItem:()=>JSON.stringify([{id:'a',name:'Bad'}])}).error);
});
test('only trusted app metadata grants admin access',()=>{
  assert.equal(isAdmin(null),false);
  assert.equal(isAdmin({user_metadata:{role:'admin'}}),false);
  assert.equal(isAdmin({app_metadata:{role:'student'}}),false);
  assert.equal(isAdmin({app_metadata:{role:'admin'}}),true);
});
