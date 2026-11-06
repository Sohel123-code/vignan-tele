import {supabase} from './auth';
import {normalizeBranch, normalizeSection, normalizeFaculty, databaseMessage} from './college.js';
import {columns,validateRows} from './data.js';

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}
async function result(query) {
  const {data,error}=await query;
  if(error) throw new Error(databaseMessage(error));
  return data;
}
// Page all records: Supabase's default 1,000-row response limit must not hide students.
async function all(query) {
  const rows=[];
  for(let offset=0;;offset+=500) {
    const page=await result(query().range(offset,offset+499));
    rows.push(...page);
    if(page.length<500)return rows;
  }
}
export function fetchBranches() { return all(()=>client().from('branches').select('*').order('name').order('id')); }
export function addBranch(name,code) { return result(client().from('branches').insert(normalizeBranch(name,code)).select().single()); }
export function fetchSections(branchId,year) {
  return all(()=>client().from('sections').select('*').eq('branch_id',branchId).eq('year',year).order('name').order('id'));
}
export function addSection(branchId,year,name) { return result(client().from('sections').insert(normalizeSection(branchId,year,name)).select().single()); }
export function fetchStudents(sectionId) { return all(()=>client().from('students').select('*').eq('section_id',sectionId).order('student_name').order('id')); }
export function addStudents(sectionId,students) {
  const checked=validateRows([columns,...students.map(s=>columns.map(c=>s[c]??''))],{type:'',language:'English'});
  if(checked.some(s=>s.errors.length)) throw new Error('Correct the student list before saving.');
  const rows=checked.map(s=>({section_id:sectionId,student_id:s.student_id,student_name:s.student_name,parent_name:s.parent_name,phone:s.phone,
    attendance:s.attendance===''||s.attendance==null?null:Number(s.attendance),marks:s.marks===''||s.marks==null?null:Number(s.marks),language:s.language||'English',feedback_topic:s.feedback_topic||'Class'}));
  // One statement makes the upload atomic; a duplicate never overwrites an existing student.
  return result(client().from('students').insert(rows));
}
export function fetchAttendance(sectionId,date) {
  return all(()=>client().from('attendance_records').select('*, students!inner(student_name,student_id,section_id)').eq('students.section_id',sectionId).eq('date',date).order('id'));
}
export function bulkMarkAttendance(records) { return result(client().from('attendance_records').upsert(records,{onConflict:'student_id,date'})); }
export function fetchFeedback(sectionId) { return all(()=>client().from('feedback_records').select('*, students(student_name,student_id)').eq('section_id',sectionId).order('created_at',{ascending:false}).order('id')); }
export function addFeedback(sectionId,studentDbId,feedbackType,content) {
  return result(client().from('feedback_records').insert({section_id:sectionId,student_id:studentDbId||null,feedback_type:feedbackType,content:content.trim()}).select().single());
}
export function updateFeedbackStatus(id,status) { return result(client().from('feedback_records').update({status}).eq('id',id).select().single()); }
export async function fetchSectionHistory(sectionId,page=0) {
  const data=await result(client().from('section_activity').select('*').eq('section_id',sectionId).order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*25,page*25+25));
  return {items:data.slice(0,25),hasMore:data.length>25};
}
export function fetchSectionCampaigns(sectionId) { return all(()=>client().from('section_campaigns').select('*').eq('section_id',sectionId).order('created_at',{ascending:false}).order('id')); }
export function saveSectionCampaign(sectionId,campaign) {
  return result(client().from('section_campaigns').insert({section_id:sectionId,name:campaign.name,type:campaign.type,student_count:campaign.students.length,details:campaign}).select().single());
}
export function fetchDashboard(days=30) {
  return result(client().rpc('college_dashboard',{period_days:days}));
}
export async function fetchCollegeHistory(page=0) {
  const data=await result(client().from('section_activity')
    .select('*, sections(id,name,year,branch_id,branches(id,name,code))')
    .order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*20,page*20+20));
  return {items:data.slice(0,20),hasMore:data.length>20};
}
export function fetchFaculty() {
  return all(()=>client().from('faculty').select('*, branches(code,name)').order('name').order('id'));
}
export function addFaculty(values) {
  return result(client().from('faculty').insert(normalizeFaculty(values)).select('*, branches(code,name)').single());
}
