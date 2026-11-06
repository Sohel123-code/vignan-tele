export const academicYears = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
export function indiaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kolkata', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(date);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function normalizeBranch(name, code) {
  const clean = {name:name.trim().replace(/\s+/g,' '), code:code.trim().toUpperCase()};
  if (!clean.name || clean.name.length > 100) throw new Error('Enter a branch name of 1–100 characters.');
  if (!/^[A-Z0-9][A-Z0-9 &()/-]{0,19}$/.test(clean.code)) throw new Error('Use a branch code of up to 20 letters, numbers, or & ( ) / - .');
  return clean;
}
export function normalizeSection(branchId, year, name) {
  const normalized = name.trim().toUpperCase();
  if (!branchId || !academicYears.includes(year)) throw new Error('Select a branch and year first.');
  if (!/^[A-Z0-9][A-Z0-9 -]{0,9}$/.test(normalized)) throw new Error('Use a section name of 1–10 letters, numbers, spaces, or hyphens.');
  return {branch_id:branchId, year, name:normalized};
}
export function databaseMessage(error) {
  if (['PGRST205','42P01','PGRST202'].includes(error?.code)) return 'Database setup is pending. Run supabase/schema.sql in the Supabase SQL Editor, then retry.';
  if (error?.code==='23505') return 'This entry already exists. Use a different name or code.';
  if (error?.code==='42501') return 'Admin database access was denied. Sign out and sign in again, then retry.';
  if (['23514','23503'].includes(error?.code)) return 'These details are invalid or the selected record no longer exists. Review and retry.';
  return error?.message || 'Unable to reach the database. Please try again.';
}
export function normalizeFaculty(values) {
  const entry={name:values.name.trim().replace(/\s+/g,' '),email:values.email.trim().toLowerCase(),branch_id:values.branch_id,designation:values.designation.trim().replace(/\s+/g,' ')};
  if(!entry.name||entry.name.length>100) throw new Error('Enter a faculty name of up to 100 characters.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email)||entry.email.length>254) throw new Error('Enter a valid email address.');
  if(!entry.branch_id) throw new Error('Select a branch.');
  if(!entry.designation||entry.designation.length>100) throw new Error('Enter a designation of up to 100 characters.');
  return entry;
}
