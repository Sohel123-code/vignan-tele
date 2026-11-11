-- Run AFTER schema.sql. Additive migration: existing college records are unchanged.
begin;
create table if not exists public.calling_campaigns (
 id uuid primary key default gen_random_uuid(), section_id uuid not null references public.sections(id),
 name text not null check(length(name) between 1 and 150), intro_message text not null default '',
 language text not null default 'en' check(language in ('en','hi','te','ta','kn','ml','mr')),
 status text not null default 'draft' check(status in ('draft','running','paused','completed')),
 revision integer not null default 1, next_dispatch_at timestamptz not null default now(),
 confirmed_by uuid references auth.users(id), confirmed_at timestamptz,
 created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.calling_questions (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.calling_campaigns(id) on delete cascade,
 position integer not null, question_text text not null check(length(question_text) between 1 and 500),
 answer_type text not null check(answer_type in ('text','rating','yes_no','choice')),
 choices jsonb not null default '[]', required boolean not null default true, unique(campaign_id,position)
);
create table if not exists public.calling_contacts (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.calling_campaigns(id) on delete cascade,
 name text, phone text not null check(phone ~ '^\+[1-9][0-9]{9,14}$'), extra jsonb not null default '{}',
 call_status text not null default 'pending' check(call_status in ('pending','queued','calling','completed','failed','no_answer','needs_review','do_not_call')),
 last_error text, created_at timestamptz not null default now(), unique(campaign_id,phone)
);
create table if not exists public.calling_calls (
 id uuid primary key default gen_random_uuid(), contact_id uuid not null references public.calling_contacts(id),
 outpero_call_id text unique, status text not null default 'queued', duration_seconds integer,
 started_at timestamptz not null default now(), ended_at timestamptz, created_at timestamptz not null default now()
);
create unique index if not exists calling_one_active_attempt on public.calling_calls(contact_id) where ended_at is null;
create unique index if not exists calling_one_active_phone on public.calling_contacts(phone) where call_status in ('queued','calling','needs_review');
create table if not exists public.calling_feedback (
 id uuid primary key default gen_random_uuid(), call_id uuid not null unique references public.calling_calls(id),
 contact_id uuid not null references public.calling_contacts(id), transcript text, summary text, outcome text,
 sentiment text check(sentiment in ('positive','neutral','negative')), rating integer check(rating between 1 and 5),
 answers jsonb not null default '[]', extraction_source text, recording_url text, created_at timestamptz not null default now()
);
create table if not exists public.calling_webhook_events (
 id uuid primary key default gen_random_uuid(), event_id text not null unique, payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','processed','unmatched','ignored')),
 last_error text, attempts integer not null default 0, received_at timestamptz not null default now()
);
create table if not exists public.calling_suppressions (
 phone text primary key, created_at timestamptz not null default now()
);
alter table public.calling_campaigns add column if not exists outpero_employee_id text;
alter table public.calling_questions add column if not exists capture_key text;
alter table public.calling_calls add column if not exists provider_status text;
alter table public.calling_calls add column if not exists outpero_employee_id text;
alter table public.calling_calls add column if not exists provider_detail text;
alter table public.calling_calls add column if not exists last_polled_at timestamptz;
alter table public.calling_calls add column if not exists sync_error text;
alter table public.calling_feedback add column if not exists captured jsonb not null default '{}';
alter table public.calling_feedback add column if not exists recording_expires_at timestamptz;
create index if not exists calling_contacts_campaign on public.calling_contacts(campaign_id,call_status);
create index if not exists calling_calls_contact on public.calling_calls(contact_id,created_at desc);
create index if not exists calling_events_pending on public.calling_webhook_events(status,received_at);

do $$ declare t text; begin
 foreach t in array array['calling_campaigns','calling_questions','calling_contacts','calling_calls','calling_feedback','calling_webhook_events','calling_suppressions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('drop policy if exists admin_read on public.%I',t);
  if t not in ('calling_webhook_events','calling_suppressions') then
   execute format('grant select on public.%I to authenticated',t);
   execute format('create policy admin_read on public.%I for select to authenticated using ((select auth.jwt()->''app_metadata''->>''role'')=''admin'')',t);
  end if;
 end loop;
end $$;

-- All writes use service-only RPCs. Row/advisory locks serialize simultaneous clicks,
-- uploads, pauses and worker claims; no browser client can bypass the API.
create or replace function public.calling_mutate(p_action text,p_id uuid,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path=public as $$
declare c calling_campaigns; q jsonb; n integer; total integer; inserted integer; cid uuid; begin
 perform pg_advisory_xact_lock(8675309);
 if p_action='create' then
  insert into calling_campaigns(section_id,name,intro_message,language,created_by,outpero_employee_id)
  values((p_data->>'section_id')::uuid,p_data->>'name',coalesce(p_data->>'intro_message',''),p_data->>'language',(p_data->>'actor')::uuid,p_data->>'outpero_employee_id') returning * into c;
  return to_jsonb(c);
 end if;
 select * into c from calling_campaigns where id=p_id for update;
 if not found then raise exception 'Campaign not found' using errcode='P0002'; end if;
 if p_action in ('questions','upload','agent') then
  if c.status <> 'draft' or exists(select 1 from calling_calls a join calling_contacts t on t.id=a.contact_id where t.campaign_id=p_id) then
   raise exception 'Create a new campaign to change a started script or contact list' using errcode='22023'; end if;
  if p_action='agent' then
   update calling_campaigns set outpero_employee_id=p_data->>'outpero_employee_id',revision=revision+1 where id=p_id returning * into c;
   return to_jsonb(c);
  elsif p_action='questions' then
   if jsonb_array_length(p_data->'questions') not between 1 and 15 then raise exception 'Add 1 to 15 questions' using errcode='22023'; end if;
   delete from calling_questions where campaign_id=p_id;
   n:=0;
   for q in select value from jsonb_array_elements(p_data->'questions') loop
    n:=n+1;
    insert into calling_questions(campaign_id,position,question_text,answer_type,choices,required,capture_key)
    values(p_id,n,q->>'question_text',q->>'answer_type',coalesce(q->'choices','[]'),coalesce((q->>'required')::boolean,true),nullif(q->>'capture_key',''));
   end loop;
   update calling_campaigns set revision=revision+1 where id=p_id;
   return jsonb_build_object('saved',n);
  end if;
  select count(*) into total from calling_contacts where campaign_id=p_id;
  select count(*) into n from jsonb_array_elements(p_data->'contacts') x where not exists(select 1 from calling_contacts t where t.campaign_id=p_id and t.phone=x->>'phone');
  if total+n>(p_data->>'max_contacts')::integer then raise exception 'Demo contact limit reached' using errcode='22023'; end if;
  insert into calling_contacts(campaign_id,name,phone,extra)
  select p_id,x->>'name',x->>'phone',coalesce(x->'extra','{}') from jsonb_array_elements(p_data->'contacts') x
  on conflict(campaign_id,phone) do nothing;
  get diagnostics inserted=row_count;
  return jsonb_build_object('inserted',inserted,'duplicates',jsonb_array_length(p_data->'contacts')-inserted);
 elsif p_action='start' then
  if c.revision<>(p_data->>'revision')::integer then raise exception 'Script changed. Generate and confirm it again' using errcode='22023'; end if;
  if not exists(select 1 from calling_questions where campaign_id=p_id) then raise exception 'Save questions first' using errcode='22023'; end if;
  if exists(select 1 from calling_campaigns where id<>p_id and status='running') or exists(select 1 from calling_contacts where campaign_id<>p_id and call_status in ('queued','calling','needs_review')) then
   raise exception 'Finish the other campaign before changing the shared Outpero script' using errcode='22023'; end if;
  if not exists(select 1 from calling_contacts where campaign_id=p_id and call_status='pending') then raise exception 'No pending contacts' using errcode='22023'; end if;
  if exists(select 1 from calling_contacts where campaign_id=p_id and call_status='pending' and not (phone=any(array(select jsonb_array_elements_text(p_data->'allowed_phones'))))) then
   raise exception 'Every pending number must be in DEMO_ALLOWED_PHONES' using errcode='22023'; end if;
  update calling_campaigns set status='running',confirmed_by=(p_data->>'actor')::uuid,confirmed_at=now() where id=p_id returning * into c;
 elsif p_action='pause' then
  update calling_campaigns set status='paused' where id=p_id and status='running' returning * into c;
 elsif p_action='retry' then
  if c.status='running' or exists(select 1 from calling_contacts where campaign_id=p_id and call_status in ('queued','calling','needs_review')) then raise exception 'Wait for active calls and resolve uncertain delivery first' using errcode='22023'; end if;
  update calling_contacts set call_status='pending',last_error=null where campaign_id=p_id and call_status in ('failed','no_answer') and phone not in(select phone from calling_suppressions);
  get diagnostics n=row_count;
  update calling_campaigns set status='paused' where id=p_id;
  return jsonb_build_object('requeued',n);
 else raise exception 'Unknown action' using errcode='22023'; end if;
 return to_jsonb(c);
end $$;

create or replace function public.calling_claim(p_delay_ms integer)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare c calling_campaigns; t calling_contacts; a calling_calls; begin
 perform pg_advisory_xact_lock(8675309);
 -- Suppress opt-outs in all current and future campaigns.
 update calling_contacts set call_status='do_not_call' where call_status='pending' and phone in(select phone from calling_suppressions);
 update calling_campaigns campaign_row set status='completed' where status in ('running','paused') and not exists(select 1 from calling_contacts contact_row where contact_row.campaign_id=campaign_row.id and contact_row.call_status in ('pending','queued','calling','needs_review'));
 select * into c from calling_campaigns where status='running' and next_dispatch_at<=now() order by created_at limit 1 for update;
 if not found then return null; end if;
 select * into t from calling_contacts where campaign_id=c.id and call_status='pending' order by created_at,id limit 1 for update;
 if not found then return null; end if;
 update calling_contacts set call_status='queued',last_error=null where id=t.id;
 insert into calling_calls(contact_id,outpero_employee_id) values(t.id,c.outpero_employee_id) returning * into a;
 update calling_campaigns set next_dispatch_at=now()+make_interval(secs=>greatest(p_delay_ms,1000)/1000.0) where id=c.id;
 return jsonb_build_object('contact',to_jsonb(t),'attempt',to_jsonb(a),'campaign',to_jsonb(c));
end $$;

create or replace function public.calling_delivery(p_call uuid,p_provider_id text,p_status text,p_error text default null)
returns void language plpgsql security invoker set search_path=public as $$
declare a calling_calls; begin
 select * into a from calling_calls where id=p_call for update;
 if not found then raise exception 'Attempt not found'; end if;
 -- A webhook may complete before intake responds: never regress terminal status.
 update calling_calls set outpero_call_id=coalesce(outpero_call_id,p_provider_id) where id=p_call;
 if a.ended_at is not null then return; end if;
 update calling_calls set status=p_status,ended_at=case when p_status='failed' then now() else null end where id=p_call;
 update calling_contacts set call_status=p_status,last_error=p_error where id=a.contact_id;
end $$;

-- Match exact provider IDs first. Phone-only fallback is intentionally refused for
-- retried contacts: a delayed first-attempt webhook must not complete a later call.
create or replace function public.calling_match(p_provider_id text,p_phone text,p_contact_id text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare a calling_calls; t calling_contacts; n integer; begin
 if p_provider_id is not null then select * into a from calling_calls where outpero_call_id=p_provider_id; end if;
 if a.id is null then
  select count(*) into n from calling_calls x join calling_contacts y on y.id=x.contact_id
   where x.ended_at is null and ((p_contact_id is not null and y.id::text=p_contact_id) or (p_contact_id is null and y.phone=p_phone))
   and (x.outpero_call_id is null or x.outpero_call_id=p_provider_id)
   and (select count(*) from calling_calls z where z.contact_id=y.id)=1;
  if n<>1 then return null; end if;
  select x.* into a from calling_calls x join calling_contacts y on y.id=x.contact_id
   where x.ended_at is null and ((p_contact_id is not null and y.id::text=p_contact_id) or (p_contact_id is null and y.phone=p_phone))
   and (x.outpero_call_id is null or x.outpero_call_id=p_provider_id)
   and (select count(*) from calling_calls z where z.contact_id=y.id)=1;
 end if;
 if a.id is null then return null; end if;
 select * into t from calling_contacts where id=a.contact_id;
 if p_phone is not null and t.phone<>p_phone then return null; end if;
 if p_contact_id is not null and t.id::text<>p_contact_id then return null; end if;
 return jsonb_build_object('attempt',to_jsonb(a),'contact',to_jsonb(t));
end $$;

create or replace function public.calling_finish(p_event uuid,p_call uuid,p_result jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare a calling_calls; t calling_contacts; e calling_webhook_events; begin
 select * into e from calling_webhook_events where id=p_event for update;
 if e.status='processed' then return; end if;
 select * into a from calling_calls where id=p_call for update;
 if not found then raise exception 'Attempt missing'; end if;
 select * into t from calling_contacts where id=a.contact_id for update;
 if a.ended_at is null then
  update calling_calls set outpero_call_id=coalesce(outpero_call_id,p_result->>'outperoCallId'),status=p_result->>'status',duration_seconds=(p_result->>'durationSeconds')::integer,ended_at=now() where id=a.id;
  insert into calling_feedback(call_id,contact_id,transcript,summary,outcome,sentiment,rating,answers,extraction_source,recording_url,captured,recording_expires_at)
  values(a.id,t.id,p_result->>'transcript',p_result->>'summary',p_result->>'outcome',p_result->>'sentiment',(p_result->>'rating')::integer,coalesce(p_result->'items','[]'),p_result->>'source',p_result->>'recordingUrl',coalesce(p_result->'captured','{}'),(p_result->>'recordingExpiresAt')::timestamptz) on conflict(call_id) do nothing;
  update calling_contacts set call_status=p_result->>'status',last_error=null where id=t.id;
  if p_result->>'status'='do_not_call' then insert into calling_suppressions(phone) values(t.phone) on conflict do nothing; end if;
  insert into section_activity(section_id,kind,description) select section_id,'calling','Feedback call: '||(p_result->>'status') from calling_campaigns where id=t.campaign_id;
 end if;
 update calling_webhook_events set status='processed',last_error=null where id=e.id;
 update calling_campaigns c set status='completed' where id=t.campaign_id and not exists(select 1 from calling_contacts x where x.campaign_id=c.id and x.call_status in ('pending','queued','calling','needs_review'));
end $$;

-- A process could stop after Outpero accepts a lead. Keep that attempt for manual
-- reconciliation rather than risk placing the same call twice on restart.
create or replace function public.calling_recover() returns void language sql security invoker set search_path=public as $$
 update calling_contacts t set call_status='needs_review',last_error='Delivery interrupted. Check Outpero before retrying.'
 from calling_calls a where a.contact_id=t.id and a.status='queued' and a.ended_at is null and a.started_at<now()-interval '2 minutes' and t.call_status='queued';
$$;
do $$ declare f record; begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('calling_mutate','calling_claim','calling_delivery','calling_match','calling_finish','calling_recover') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
grant select,insert on public.section_activity to service_role;
notify pgrst,'reload schema';
commit;
