import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBranch,normalizeSection,normalizeFaculty,indiaDate,databaseMessage} from '../src/college.js';
import {toCSV} from '../src/data.js';

test('branch and section values are normalized and scoped to an academic year',()=>{
 assert.deepEqual(normalizeBranch('  Computer   Science  ',' cse '),{name:'Computer Science',code:'CSE'});
 assert.deepEqual(normalizeSection('branch-1','2nd Year',' a '),{branch_id:'branch-1',year:'2nd Year',name:'A'});
 assert.throws(()=>normalizeSection('','2nd Year','A'),/Select a branch/);
 assert.throws(()=>normalizeSection('branch-1','5th Year','A'),/Select a branch/);
 assert.throws(()=>normalizeBranch('CSE','<>'),/branch code/);
});
test('attendance defaults to the college date and export preserves zero percentages',()=>{
 assert.equal(indiaDate(new Date('2026-11-04T19:00:00Z')),'2026-11-05');
 assert.match(toCSV([{student_id:'S1',attendance:0,marks:0}]),/,0,0,/);
});
test('database errors give actionable setup, duplicate and authorization feedback',()=>{
 assert.match(databaseMessage({code:'PGRST205'}),/schema.sql/);
 assert.match(databaseMessage({code:'23505'}),/already exists/);
 assert.match(databaseMessage({code:'42501'}),/Sign out and sign in/);
});
test('faculty values are normalized and require email, designation and branch',()=>{
 const values={name:' Anita  Rao ',email:' ANITA@College.edu ',designation:' Professor ',branch_id:'b1'};
 assert.deepEqual(normalizeFaculty(values),{name:'Anita Rao',email:'anita@college.edu',designation:'Professor',branch_id:'b1'});
 assert.throws(()=>normalizeFaculty({...values,email:'invalid'}),/valid email/);
 assert.throws(()=>normalizeFaculty({...values,branch_id:''}),/Select a branch/);
 assert.throws(()=>normalizeFaculty({...values,designation:' '}),/designation/);
});
