import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCSV,validateRows,toCSV,sampleCSV} from '../src/data.js';
test('sample CSV produces two valid records',()=>{
 const records=validateRows(parseCSV(sampleCSV));
 assert.equal(records.length,2);assert.ok(records.every(r=>r.errors.length===0));
 assert.equal(records[1].language,'Telugu');
});
test('quoted names, BOM and newlines are parsed correctly',()=>{
 const data=parseCSV('\uFEFFstudent_id,student_name,parent_name,phone,attendance\r\n001,"Student, A","Parent\nA",+91 9876543210,90');
 const [row]=validateRows(data);assert.equal(row.student_name,'Student, A');assert.equal(row.parent_name,'Parent\nA');assert.equal(row.phone,'+919876543210');assert.deepEqual(row.errors,[]);
});
test('missing headers and malformed CSV are rejected',()=>{
 assert.throws(()=>validateRows([['student_name'],['Test']]),/Missing columns/);
 assert.throws(()=>parseCSV('student_id,student_name\n1,"broken'),/Invalid CSV/);
});
test('invalid values cannot be accepted',()=>{
 const [row]=validateRows(parseCSV('student_id,student_name,parent_name,phone,attendance,marks,language,feedback_topic\n1,A,B,123,101,-1,Hindi,Other'));
 assert.equal(row.errors.length,5);
});
test('duplicate IDs within the file and against saved list are detected',()=>{
 const matrix=parseCSV(sampleCSV);matrix.push(matrix[1]);
 assert.ok(validateRows(matrix)[2].errors.some(e=>e.includes('duplicate')));
 assert.ok(validateRows(parseCSV(sampleCSV),undefined,[{student_id:'cse001',type:'Attendance / mentoring'}])[0].errors.some(e=>e.includes('duplicate')));
});
test('feedback needs a topic, mentoring needs attendance, language defaults apply',()=>{
 const matrix=parseCSV('student_id,student_name,parent_name,phone\n1,A,B,9876543210');
 assert.ok(validateRows(matrix)[0].errors.some(e=>e.includes('attendance')));
 const [feedback]=validateRows(matrix,{language:'Telugu',type:'Feedback'});
 assert.equal(feedback.language,'Telugu');assert.ok(feedback.errors.some(e=>e.includes('feedback topic')));
});
test('export neutralizes spreadsheet formulas',()=>{
 const csv=toCSV([{student_name:'=1+1',phone:'+919876543210',status:'Ready'}]);
 assert.ok(csv.includes("'=1+1"));assert.ok(csv.includes("'+919876543210"));
});
test('zero is valid attendance and marks',()=>{
 const [record]=validateRows(parseCSV('student_id,student_name,parent_name,phone,attendance,marks\n1,A,B,9876543210,0,0'));
 assert.deepEqual(record.errors,[]);
});
