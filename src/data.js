import Papa from 'papaparse';

export const columns = ['student_id', 'student_name', 'parent_name', 'phone', 'attendance', 'marks', 'language', 'feedback_topic'];
export const sampleCSV = columns.join(',') + '\nCSE001,Sample Student,Sample Parent,9000000000,92,85,English,Class\nCSE002,Example Student,Example Parent,9000000001,78,72,Telugu,Bus\n';
const required = ['student_id', 'student_name', 'parent_name', 'phone'];
export function parseCSV(text) {
  const result = Papa.parse(text.replace(/^\uFEFF/, ''), {skipEmptyLines: 'greedy'});
  if (result.errors.length) throw new Error(`Invalid CSV: ${result.errors[0].message}`);
  return result.data;
}
export function validateRows(matrix, defaults = {language:'English', type:'Attendance / mentoring'}, existing = []) {
  if (matrix.length < 2) throw new Error('Your file needs a header row and at least one student.');
  if (matrix.length > 5001) throw new Error('Please upload a maximum of 5,000 records at a time.');
  const headers = matrix[0].map(h => String(h ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}. Use the downloadable template.`);
  if (new Set(headers).size !== headers.length) throw new Error('Duplicate column names found. Each column must have a unique name.');
  const ids = new Set(existing.map(r => `${r.student_id.toLowerCase()}|${r.type}`));
  return matrix.slice(1).filter(row => row.some(v => String(v ?? '').trim())).map((row, i) => {
    const record = Object.fromEntries(headers.map((h, j) => [h, String(row[j] ?? '').trim()]));
    const errors = [];
    for (const field of required) if (!record[field]) errors.push(`${field.replaceAll('_',' ')} is required`);
    record.phone = record.phone.replace(/[\s()-]/g, '');
    if (!/^(?:\+91|91)?[6-9]\d{9}$/.test(record.phone)) errors.push('enter a valid 10-digit Indian mobile number');
    for (const field of ['attendance','marks']) {
      record[field] = (record[field] || '').replace(/%$/, '');
      if (record[field] && (!Number.isFinite(Number(record[field])) || Number(record[field]) < 0 || Number(record[field]) > 100)) errors.push(`${field} must be between 0 and 100`);
    }
    if (defaults.type === 'Attendance / mentoring' && !record.attendance) errors.push('attendance is required for mentoring calls');
    const language = record.language || defaults.language;
    record.language = /^telugu$/i.test(language) ? 'Telugu' : /^english$/i.test(language) ? 'English' : language;
    if (!['English','Telugu'].includes(record.language)) errors.push('language must be English or Telugu');
    const topic = record.feedback_topic || (defaults.type === 'Feedback' ? '' : 'Class');
    record.feedback_topic = topic ? topic[0].toUpperCase() + topic.slice(1).toLowerCase() : '';
    if (!['Class','Hostel','Bus'].includes(record.feedback_topic)) errors.push('feedback topic must be Class, Hostel, or Bus');
    record.type = defaults.type;
    const key = `${record.student_id.toLowerCase()}|${record.type}`;
    if (ids.has(key)) errors.push('duplicate student ID for this call type');
    ids.add(key);
    return {...record, row: i + 2, errors, status:'Ready'};
  });
}
export function toCSV(records) {
  return '\uFEFF' + Papa.unparse(records.map(r => Object.fromEntries([...columns, 'type', 'status'].map(k => [k, r[k] ?? '']))), {escapeFormulae:true});
}
export function download(name, content) {
  const url = URL.createObjectURL(new Blob([content], {type:'text/csv;charset=utf-8;'}));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const storageKey = 'viit-call-list-v1';
export function loadRecords() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(value) || value.some(r => !r || !required.every(k => typeof r[k] === 'string'))) throw new Error();
    return {records:value, error:''};
  } catch { return {records:[], error:'Saved data could not be read. Please re-import your call list.'}; }
}
