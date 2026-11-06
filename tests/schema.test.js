import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Runs the actual migration against an isolated PostgreSQL engine. No live project data.
test('Supabase schema is rerunnable, restricts non-admins, and records section history atomically',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated;
   create schema auth; create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.user_id',true),'')::uuid $$;
   create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
   grant usage on schema auth,public to authenticated,anon;
   insert into auth.users values ('11111111-1111-4111-8111-111111111111');`);
  const migration=readFileSync('supabase/schema.sql','utf8');
  await db.exec(migration);
  await db.exec(migration);
  await db.exec(`set role authenticated; set request.user_id='11111111-1111-4111-8111-111111111111'; set request.jwt.claims='{"app_metadata":{"role":"admin"}}';`);
  const branch=(await db.query("insert into branches(name,code) values ('Computer Science','CSE') returning id,created_by")).rows[0];
  assert.equal(branch.created_by,'11111111-1111-4111-8111-111111111111');
  await assert.rejects(db.query("insert into branches(name,code) values ('Other','cse')"),e=>e.code==='23505');
  const section=(await db.query("insert into sections(branch_id,year,name) values ($1,'1st Year','A') returning id",[branch.id])).rows[0];
  const other=(await db.query("insert into sections(branch_id,year,name) values ($1,'2nd Year','A') returning id",[branch.id])).rows[0];
  await assert.rejects(db.query("insert into sections(branch_id,year,name) values ($1,'1st Year','a')",[branch.id]),e=>e.code==='23505');
  const student=(await db.query("insert into students(section_id,student_id,student_name,parent_name,phone,attendance) values ($1,'S1','Student One','Parent One','9000000000',0) returning id",[section.id])).rows[0];
  await db.query("insert into attendance_records(student_id,date,status) values ($1,'2026-11-04','present')",[student.id]);
  await db.query("insert into attendance_records(student_id,date,status) values ($1,'2026-11-04','absent') on conflict(student_id,date) do update set status=excluded.status",[student.id]);
  await db.query("update attendance_records set status='absent' where student_id=$1",[student.id]);
  await assert.rejects(db.query("insert into feedback_records(section_id,student_id,feedback_type,content) values ($1,$2,'Academic','Cross-section record')",[other.id,student.id]),e=>e.code==='23514');
  const feedback=(await db.query("insert into feedback_records(section_id,student_id,feedback_type,content) values ($1,$2,'Academic','Needs mentoring') returning id",[section.id,student.id])).rows[0];
  await db.query("update feedback_records set status='reviewed' where id=$1",[feedback.id]);
  await db.query("insert into section_campaigns(section_id,name,type,student_count,details) values ($1,'Parent update','Feedback',1,'{}')",[section.id]);
  const history=(await db.query('select * from section_activity where section_id=$1',[section.id])).rows;
  assert.equal(history.length,7);
  assert.ok(history.some(h=>h.description==='Section A created'));
  assert.equal(history.filter(h=>h.kind==='attendance').length,2);
  assert.ok(history.every(h=>h.actor_id==='11111111-1111-4111-8111-111111111111'));
  assert.equal((await db.query('select * from section_activity where section_id=$1',[other.id])).rows.length,1);
  await assert.rejects(db.query("insert into section_activity(section_id,kind,description) values ($1,'fake','Forged')",[section.id]),e=>e.code==='42501');
  await assert.rejects(db.query('delete from branches'),e=>e.code==='42501');
  await db.query("insert into faculty(name,email,branch_id,designation) values ('Faculty One','faculty@college.edu',$1,'Assistant Professor')",[branch.id]);
  await assert.rejects(db.query("insert into faculty(name,email,branch_id,designation) values ('Duplicate','FACULTY@college.edu',$1,'Professor')",[branch.id]),e=>e.code==='23505');
  const dashboard=(await db.query('select public.college_dashboard(30) as summary')).rows[0].summary;
  assert.deepEqual(dashboard.totals,{branches:1,sections:2,students:1,faculty:1,campaigns:1,openFeedback:1});
  assert.deepEqual(dashboard.feedback,{pending:0,reviewed:1,resolved:0});
  assert.deepEqual(dashboard.campaigns,{mentoring:0,feedback:1});
  assert.equal(dashboard.branches[0].students,1);assert.equal(dashboard.branches[0].faculty,1);
  assert.equal(dashboard.activity.length,30);
  assert.equal(dashboard.activity.reduce((sum,d)=>sum+d.count,0),8);
  assert.equal(dashboard.activity.at(-1).date,dashboard.period.to);
  assert.equal((await db.query('select public.college_dashboard(7) as summary')).rows[0].summary.activity.length,7);
  await assert.rejects(db.query('select public.college_dashboard(365)'),e=>e.code==='22023');
  await db.exec(`set request.jwt.claims='{"app_metadata":{"role":"student"},"user_metadata":{"role":"admin"}}';`);
  for(const table of ['branches','sections','students','attendance_records','feedback_records','section_campaigns','section_activity','faculty']) {
   assert.equal((await db.query(`select * from ${table}`)).rows.length,0,`${table} must hide data from non-admins`);
  }
  await assert.rejects(db.query("insert into branches(name,code) values ('Unauthorized','BAD')"),e=>e.code==='42501');
  await assert.rejects(db.query('select public.college_dashboard(30)'),e=>e.code==='42501');
  await assert.rejects(db.query("insert into faculty(name,email,branch_id,designation) values ('Blocked','blocked@college.edu',$1,'Professor')",[branch.id]),e=>e.code==='42501');
  await db.exec('reset role; set role anon;');
  await assert.rejects(db.query('select * from students'),e=>e.code==='42501');
 } finally {await db.close();}
});
