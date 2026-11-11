-- Optional alternative to creating this campaign in the portal.
-- Run schema.sql and calling.sql first. Copy the desired section ID from:
select s.id as section_id, b.code as branch, s.year, s.name as section
from public.sections s join public.branches b on b.id=s.branch_id
order by b.code,s.year,s.name;

-- Replace <SECTION_ID> below, then run this block in Supabase SQL Editor.
-- The campaign ID is generated and reused automatically. Existing campaigns
-- with this name in the chosen section are preserved when the script is rerun.
do $$
declare
  section_text text := '<SECTION_ID>';
  target_section uuid;
  target_campaign uuid;
begin
  if section_text='<SECTION_ID>' then
    raise exception 'Replace <SECTION_ID> with the section UUID from the query above.';
  end if;
  target_section := section_text::uuid;
  perform pg_advisory_xact_lock(8675309);
  if not exists(select 1 from public.sections where id=target_section) then
    raise exception 'Section does not exist.';
  end if;
  select id into target_campaign from public.calling_campaigns
  where section_id=target_section and name='Parent Feedback'
  order by created_at limit 1;
  if target_campaign is not null then
    raise notice 'Parent Feedback already exists: %. Existing questions are unchanged.',target_campaign;
    return;
  end if;

  insert into public.calling_campaigns(section_id,name,intro_message,language)
  values(target_section,'Parent Feedback',
    'Namaste {{parent_name}} garu! I am calling from Vignan, Duvvada, Visakhapatnam.','te')
  returning id into target_campaign;

  insert into public.calling_questions(campaign_id,position,question_text,answer_type,capture_key) values
  (target_campaign,1,'Overall, how satisfied are you with the student''s experience at Vignan? Give a number from 1 to 5.','rating','overall_satisfaction'),
  (target_campaign,2,'How would you rate the quality of teaching? (1 to 5)','rating','teaching_quality'),
  (target_campaign,3,'Do you feel your child is making good academic progress?','yes_no','academic_progress'),
  (target_campaign,4,'Are you satisfied with how teachers and staff communicate with you?','yes_no','communication_satisfaction'),
  (target_campaign,5,'How do you feel about safety and discipline on campus? (1 to 5)','rating','safety_discipline'),
  (target_campaign,6,'Are the transport, hostel or canteen services working well for you?','text','services_feedback'),
  (target_campaign,7,'What do you like most about Vignan?','text','like_most'),
  (target_campaign,8,'What is one thing we should improve?','text','improvement_suggestion'),
  (target_campaign,9,'Would you recommend Vignan to other parents?','yes_no','would_recommend'),
  (target_campaign,10,'Would you like someone from the school to call you back about any concern?','yes_no','callback_request');
  raise notice 'Created Parent Feedback campaign: %',target_campaign;
end $$;
