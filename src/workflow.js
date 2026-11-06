import {columns, validateRows} from './data.js';

export const departments = [
  {code:'CSE', name:'Computer Science', short:'Software & systems'},
  {code:'CSE–AI', name:'Artificial Intelligence', short:'AI & machine learning'},
  {code:'IT', name:'Information Technology', short:'Information & computing'},
  {code:'ECE', name:'Electronics & Communication', short:'Electronics & networks'},
  {code:'EEE', name:'Electrical & Electronics', short:'Power & electronics'},
  {code:'MECH', name:'Mechanical Engineering', short:'Design & manufacturing'},
  {code:'CIVIL', name:'Civil Engineering', short:'Infrastructure & design'},
];
export const years = ['1st year','2nd year','3rd year','4th year'];
export const sections = ['A','B','C','D','E','F'];
export const modules = ['Attendance / mentoring','Feedback'];
export const stages = ['Department','Year','Section','Module','Students','Questions','Review'];
export const questionDefaults = {
  'Attendance / mentoring':['Would you like an update on your child’s attendance and academic progress?', 'Is there any support your child needs?'],
  Feedback:['How has your child’s experience been with the selected service?', 'Are there any concerns you would like us to address?'],
};
export function newDraft() {
  return {department:'', year:'', section:'', type:'', students:[], confirmed:false, filename:'', questions:[], name:'', settings:{language:'English',concurrency:3,duration:60,retry:true}};
}
export function validateStudents(students, draft) {
  if (!students.length) return [];
  return validateRows([columns,...students.map(r=>columns.map(c=>r[c] ?? ''))], {type:draft.type,language:draft.settings.language});
}
export function canAdvance(step, draft) {
  if (step===0) return draft.branchId ? Boolean(draft.department.trim()) : departments.some(d=>d.code===draft.department);
  if (step===1) return years.includes(draft.year.toLowerCase());
  if (step===2) return draft.sectionId ? Boolean(draft.section.trim()) : sections.includes(draft.section);
  if (step===3) return modules.includes(draft.type);
  if (step===4) return draft.confirmed && draft.students.length>0 && validateStudents(draft.students,draft).every(r=>!r.errors.length);
  if (step===5) return draft.questions.length>0 && draft.questions.length<=10 && draft.questions.every(q=>q.trim().length>0 && q.length<=300) && ['English','Telugu'].includes(draft.settings.language) && Number.isInteger(draft.settings.concurrency) && draft.settings.concurrency>=1 && draft.settings.concurrency<=5 && [30,45,60].includes(draft.settings.duration);
  if (step===6) return draft.name.trim().length>0 && draft.name.length<=100;
  return false;
}
export function buildCampaign(draft, id, now) {
  if (![0,1,2,3,4,5,6].every(step=>canAdvance(step,draft))) throw new Error('Complete every step before confirming the campaign.');
  return {...draft, name:draft.name.trim(), questions:draft.questions.map(q=>q.trim()), students:validateStudents(draft.students,draft).map(({errors,row,...record})=>record), id, createdAt:now, status:'Prepared', calls:[]};
}
export const campaignKey = userId => `viit-campaigns-v2:${userId}`;
export function loadCampaigns(userId, storage=localStorage) {
  try {
    const data=JSON.parse(storage.getItem(campaignKey(userId)) || '[]');
    if (!Array.isArray(data) || data.some(c=>!c || typeof c.id!=='string' || typeof c.name!=='string' || !Array.isArray(c.students) || !Array.isArray(c.questions) || !c.settings || !Array.isArray(c.calls))) throw new Error();
    return {campaigns:data, error:''};
  } catch {return {campaigns:[], error:'Saved campaigns could not be read. Browser storage may be unavailable.'};}
}
