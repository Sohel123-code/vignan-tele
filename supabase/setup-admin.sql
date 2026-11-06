-- Run in your Supabase SQL Editor after creating the admin in Authentication > Users.
-- Replace the email below. No service-role key is needed in the React application.
-- Sign out and sign in again after assigning this role.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where lower(email) = lower('replace-with-your-admin-email@example.com');

-- Verify the intended account was updated.
select id, email, raw_app_meta_data->>'role' as app_role
from auth.users
where lower(email) = lower('replace-with-your-admin-email@example.com');
