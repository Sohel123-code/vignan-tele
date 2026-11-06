-- VIIT college dashboard. Run this entire file once in the Supabase SQL Editor.
-- Re-runnable; preserves existing records. Only accounts with app_metadata.role=admin have access.
begin;

create table if not exists public.branches (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check (length(trim(name)) between 1 and 100),
 code text not null unique check (length(trim(code)) between 1 and 20),
 created_at timestamptz not null default now(),
 created_by uuid default auth.uid() references auth.users(id)
);
create unique index if not exists branches_name_ci on public.branches(lower(trim(name)));
create unique index if not exists branches_code_ci on public.branches(upper(trim(code)));
create table if not exists public.sections (
 id uuid primary key default gen_random_uuid(),
 branch_id uuid not null references public.branches(id) on delete restrict,
 year text not null check (year in ('1st Year','2nd Year','3rd Year','4th Year')),
 name text not null check (length(trim(name)) between 1 and 10),
 created_at timestamptz not null default now(),
 created_by uuid default auth.uid() references auth.users(id),
 unique(branch_id,year,name)
);
create unique index if not exists sections_name_ci on public.sections(branch_id,year,upper(trim(name)));
create table if not exists public.students (
 id uuid primary key default gen_random_uuid(),
 section_id uuid not null references public.sections(id) on delete restrict,
 student_id text not null check (length(trim(student_id)) between 1 and 150),
 student_name text not null check (length(trim(student_name)) between 1 and 150),
 parent_name text not null check (length(trim(parent_name)) between 1 and 150),
 phone text not null check (phone ~ '^(\+91|91)?[6-9][0-9]{9}$'),
 attendance numeric check (attendance between 0 and 100),
 marks numeric check (marks between 0 and 100),
 language text not null default 'English' check (language in ('English','Telugu')),
 feedback_topic text not null default 'Class' check (feedback_topic in ('Class','Hostel','Bus')),
 created_at timestamptz not null default now(),
 unique(section_id,student_id)
);
create unique index if not exists students_id_ci on public.students(section_id,lower(trim(student_id)));
create table if not exists public.attendance_records (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.students(id) on delete restrict,
 date date not null,
 status text not null check (status in ('present','absent','late')),
 marked_by uuid default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 unique(student_id,date)
);
create table if not exists public.feedback_records (
 id uuid primary key default gen_random_uuid(),
 section_id uuid not null references public.sections(id) on delete restrict,
 student_id uuid references public.students(id) on delete set null,
 feedback_type text not null check (feedback_type in ('Academic','Hostel','Transport','Infrastructure','Other')),
 content text not null check (length(trim(content)) between 1 and 3000),
 status text not null default 'pending' check (status in ('pending','reviewed','resolved')),
 created_by uuid default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create table if not exists public.section_campaigns (
 id uuid primary key default gen_random_uuid(),
 section_id uuid not null references public.sections(id) on delete restrict,
 name text not null check (length(trim(name)) between 1 and 100),
 type text not null check (type in ('Attendance / mentoring','Feedback')),
 student_count integer not null check (student_count between 1 and 5000),
 details jsonb not null check (jsonb_typeof(details)='object'),
 created_by uuid default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create table if not exists public.section_activity (
 id uuid primary key default gen_random_uuid(),
 section_id uuid not null references public.sections(id) on delete restrict,
 kind text not null,
 description text not null,
 actor_id uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists section_activity_timeline on public.section_activity(section_id,created_at desc,id desc);
create index if not exists students_section on public.students(section_id);
create index if not exists feedback_section on public.feedback_records(section_id,created_at desc);
create index if not exists campaigns_section on public.section_campaigns(section_id,created_at desc);

create table if not exists public.faculty (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) between 1 and 100),
 email text not null check (length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 branch_id uuid not null references public.branches(id) on delete restrict,
 designation text not null check (length(trim(designation)) between 1 and 100),
 created_at timestamptz not null default now(),
 created_by uuid default auth.uid() references auth.users(id)
);
create unique index if not exists faculty_email_ci on public.faculty(lower(trim(email)));
create index if not exists faculty_branch on public.faculty(branch_id);

-- Correct defaults if upgrading the earlier draft schema.
alter table public.branches alter column created_by set default auth.uid();
alter table public.sections alter column created_by set default auth.uid();
alter table public.feedback_records alter column created_by set default auth.uid();
alter table public.attendance_records alter column marked_by set default auth.uid();

-- Access is enforced in Postgres, not only in the React route guard.
-- Remove the earlier broad authenticated-read policies if they exist.
drop policy if exists "Authenticated users can read branches" on public.branches;
drop policy if exists "Admins can manage branches" on public.branches;
drop policy if exists "Authenticated users can read sections" on public.sections;
drop policy if exists "Admins can manage sections" on public.sections;
drop policy if exists "Authenticated users can read students" on public.students;
drop policy if exists "Admins can manage students" on public.students;
drop policy if exists "Authenticated users can read attendance" on public.attendance_records;
drop policy if exists "Admins can manage attendance" on public.attendance_records;
drop policy if exists "Authenticated users can read feedback" on public.feedback_records;
drop policy if exists "Admins can manage feedback" on public.feedback_records;

do $$
declare t text;
begin
 foreach t in array array['branches','sections','students','attendance_records','feedback_records','section_campaigns','section_activity','faculty'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('drop policy if exists admin_read on public.%I',t);
  execute format('create policy admin_read on public.%I for select to authenticated using ((select auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'')',t);
  if t <> 'section_activity' then
   execute format('grant insert, update on public.%I to authenticated',t);
   execute format('drop policy if exists admin_insert on public.%I',t);
   execute format('drop policy if exists admin_update on public.%I',t);
   execute format('create policy admin_insert on public.%I for insert to authenticated with check ((select auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'')',t);
   execute format('create policy admin_update on public.%I for update to authenticated using ((select auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'') with check ((select auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'')',t);
  end if;
 end loop;
end $$;

-- Prevent feedback from being linked to a student from another section.
create or replace function public.validate_feedback_section() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.student_id is not null and not exists(select 1 from public.students where id=new.student_id and section_id=new.section_id) then
  raise exception 'Student does not belong to this section' using errcode='23514';
 end if;
 return new;
end $$;
drop trigger if exists feedback_section_check on public.feedback_records;
create trigger feedback_section_check before insert or update on public.feedback_records
for each row execute function public.validate_feedback_section();

-- History is written by triggers in the same transaction as each saved change.
-- Clients may read it but cannot forge, edit, or delete activity entries.
create or replace function public.record_section_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare sid uuid; label text; description text;
begin
 if tg_table_name='sections' then
  sid:=new.id; label:='section'; description:='Section '||new.name||' created';
 elsif tg_table_name='students' then
  if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new; end if;
  sid:=new.section_id; label:='students'; description:=new.student_name||' ('||new.student_id||') '||case when tg_op='INSERT' then 'added' else 'updated' end;
 elsif tg_table_name='attendance_records' then
  if tg_op='UPDATE' and new.status=old.status then return new; end if;
  select section_id,student_name into sid,label from public.students where id=new.student_id;
  description:=label||' marked '||new.status||' for '||new.date::text; label:='attendance';
 elsif tg_table_name='feedback_records' then
  if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new; end if;
  sid:=new.section_id; label:='feedback';
  description:=new.feedback_type||' feedback '||case when tg_op='INSERT' then 'added' else 'marked '||new.status end;
 elsif tg_table_name='section_campaigns' then
  sid:=new.section_id; label:='campaign'; description:=new.name||' prepared ('||new.student_count||' students)';
 end if;
 insert into public.section_activity(section_id,kind,description,actor_id) values(sid,label,description,auth.uid());
 return new;
end $$;
revoke all on function public.record_section_activity() from public,anon,authenticated;
do $$
declare t text;
begin
 foreach t in array array['sections','students','attendance_records','feedback_records','section_campaigns'] loop
  execute format('drop trigger if exists log_section_activity on public.%I',t);
  execute format('create trigger log_section_activity after insert or update on public.%I for each row execute function public.record_section_activity()',t);
 end loop;
end $$;
-- Aggregate in Postgres so the dashboard does not download student/parent details.
-- SECURITY INVOKER keeps the same admin RLS checks as ordinary table access.
create or replace function public.college_dashboard(period_days integer default 30)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare today date := (now() at time zone 'Asia/Kolkata')::date; start_day date; payload jsonb;
begin
 if coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' then
  raise exception 'Admin access required' using errcode='42501';
 end if;
 if period_days is null or period_days not in (7,30,90) then
  raise exception 'Choose 7, 30, or 90 days' using errcode='22023';
 end if;
 start_day := today - (period_days-1);
 select jsonb_build_object(
  'totals',jsonb_build_object(
   'branches',(select count(*) from public.branches),
   'sections',(select count(*) from public.sections),
   'students',(select count(*) from public.students),
   'faculty',(select count(*) from public.faculty),
   'campaigns',(select count(*) from public.section_campaigns),
   'openFeedback',(select count(*) from public.feedback_records where status<>'resolved')),
  'attendance',jsonb_build_object(
   'present',(select count(*) from public.attendance_records where date between start_day and today and status='present'),
   'absent',(select count(*) from public.attendance_records where date between start_day and today and status='absent'),
   'late',(select count(*) from public.attendance_records where date between start_day and today and status='late')),
  'feedback',jsonb_build_object(
   'pending',(select count(*) from public.feedback_records where status='pending'),
   'reviewed',(select count(*) from public.feedback_records where status='reviewed'),
   'resolved',(select count(*) from public.feedback_records where status='resolved')),
  'campaigns',jsonb_build_object(
   'mentoring',(select count(*) from public.section_campaigns where type='Attendance / mentoring'),
   'feedback',(select count(*) from public.section_campaigns where type='Feedback')),
  'branches',coalesce((select jsonb_agg(row_data order by row_data->>'code') from (
   select jsonb_build_object('id',b.id,'code',b.code,'name',b.name,
    'students',(select count(*) from public.students s join public.sections sec on sec.id=s.section_id where sec.branch_id=b.id),
    'sections',(select count(*) from public.sections sec where sec.branch_id=b.id),
    'faculty',(select count(*) from public.faculty f where f.branch_id=b.id)) row_data
   from public.branches b
  ) branch_data),'[]'::jsonb),
  'activity',coalesce((select jsonb_agg(jsonb_build_object('date',d.day::date,'count',coalesce(a.total,0)) order by d.day)
   from generate_series(start_day::timestamp,today::timestamp,interval '1 day') d(day)
   left join (
    select (created_at at time zone 'Asia/Kolkata')::date as day,count(*) total from public.section_activity
    where created_at >= (start_day::timestamp at time zone 'Asia/Kolkata')
     and created_at < ((today+1)::timestamp at time zone 'Asia/Kolkata')
    group by 1
   ) a on a.day=d.day::date),'[]'::jsonb),
  'period',jsonb_build_object('days',period_days,'from',start_day,'to',today)
 ) into payload;
 return payload;
end $$;
revoke all on function public.college_dashboard(integer) from public,anon;
grant execute on function public.college_dashboard(integer) to authenticated;
create index if not exists activity_created_at on public.section_activity(created_at);
create index if not exists attendance_date_status on public.attendance_records(date,status);
notify pgrst,'reload schema';
commit;
