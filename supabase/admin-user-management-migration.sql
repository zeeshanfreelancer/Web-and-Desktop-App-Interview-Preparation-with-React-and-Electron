-- Run this once in the Supabase SQL Editor to enable central admin user management.
alter table public.profiles add column if not exists is_blocked boolean not null default false;
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists subscription_started_at timestamptz;
alter table public.profiles add column if not exists subscription_expires_at timestamptz;
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists free_trial_started_at timestamptz;
alter table public.profiles add column if not exists free_trial_expires_at timestamptz;

-- Table privileges are required in addition to row-level security policies.
grant select, update on table public.profiles to authenticated;
grant select, insert, update on table public.user_workspaces to authenticated;

-- New accounts receive 10 days of unlimited trial access, then remain on the free plan unless upgraded.
update public.profiles
set
  free_trial_started_at = coalesce(free_trial_started_at, created_at),
  free_trial_expires_at = coalesce(free_trial_expires_at, created_at + interval '10 days')
where plan = 'free'
  and free_trial_expires_at is null;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, plan, approval_status, free_trial_started_at, free_trial_expires_at)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'plan')::public.subscription_plan, 'free'),
    case when coalesce(new.raw_user_meta_data ->> 'plan', 'free') = 'free' then 'approved'::public.approval_state else 'pending'::public.approval_state end,
    now(),
    now() + interval '10 days'
  );
  return new;
end;
$$;

-- Repairs legacy accounts that exist in Auth but do not yet have a profile row.
create or replace function public.ensure_my_profile()
returns void language plpgsql security definer set search_path = public as $$
declare auth_user auth.users%rowtype;
begin
  select * into auth_user from auth.users where id = auth.uid();
  if auth_user.id is null then raise exception 'Not authenticated'; end if;
  insert into public.profiles (id, full_name, email, plan, approval_status, free_trial_started_at, free_trial_expires_at)
  values (
    auth_user.id,
    coalesce(nullif(auth_user.raw_user_meta_data ->> 'full_name', ''), split_part(auth_user.email, '@', 1)),
    auth_user.email,
    'free',
    'approved',
    now(),
    now() + interval '10 days'
  )
  on conflict (id) do nothing;
end;
$$;

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists direct_messages_participants_created_at on public.direct_messages (sender_id, recipient_id, created_at);
alter table public.direct_messages enable row level security;

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists group_messages_created_at on public.group_messages (created_at);
alter table public.group_messages enable row level security;

alter table public.direct_messages add column if not exists attachment_path text;
alter table public.direct_messages add column if not exists attachment_name text;
alter table public.direct_messages add column if not exists attachment_type text;
alter table public.group_messages add column if not exists attachment_path text;
alter table public.group_messages add column if not exists attachment_name text;
alter table public.group_messages add column if not exists attachment_type text;
alter table public.direct_messages add column if not exists updated_at timestamptz;
alter table public.group_messages add column if not exists updated_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-attachments', 'chat-attachments', true, 10485760)
on conflict (id) do update set public = true, file_size_limit = 10485760;
drop policy if exists "Users can view chat attachments" on storage.objects;
drop policy if exists "Users can upload chat attachments" on storage.objects;
create policy "Users can view chat attachments" on storage.objects for select to authenticated using (bucket_id = 'chat-attachments');
create policy "Users can upload chat attachments" on storage.objects for insert to authenticated with check (bucket_id = 'chat-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop function if exists public.send_direct_message(uuid, text);
drop function if exists public.send_direct_message(uuid, text, text, text, text);
drop function if exists public.get_direct_messages(uuid);
drop function if exists public.send_group_message(text);
drop function if exists public.send_group_message(text, text, text, text);
drop function if exists public.get_group_messages();

create function public.send_direct_message(target_user_id uuid, message_text text, next_attachment_path text default null, next_attachment_name text default null, next_attachment_type text default null)
returns void language plpgsql security definer set search_path = public as $$
declare recipient uuid;
begin
  if nullif(trim(message_text), '') is null and next_attachment_path is null then raise exception 'Message cannot be empty'; end if;
  if char_length(trim(message_text)) > 2000 then raise exception 'Message is too long'; end if;
  if public.is_admin() then
    select id into recipient from public.profiles where id = target_user_id and role = 'user' and not is_blocked;
  else
    select id into recipient from public.profiles where role = 'admin' and approval_status = 'approved';
  end if;
  if recipient is null then raise exception 'Recipient is not available'; end if;
  if next_attachment_path is not null and next_attachment_path !~ ('^' || auth.uid()::text || '/') then raise exception 'Invalid attachment'; end if;
  insert into public.direct_messages (sender_id, recipient_id, body, attachment_path, attachment_name, attachment_type) values (auth.uid(), recipient, coalesce(trim(message_text), ''), next_attachment_path, next_attachment_name, next_attachment_type);
end;
$$;

create function public.get_direct_messages(target_user_id uuid default null)
returns table(id uuid, body text, created_at timestamptz, is_mine boolean, sender_label text, attachment_path text, attachment_name text, attachment_type text)
language plpgsql security definer set search_path = public as $$
declare other_user uuid;
begin
  if public.is_admin() then
    other_user := target_user_id;
    if not exists (select 1 from public.profiles target_profile where target_profile.id = other_user and target_profile.role = 'user') then raise exception 'User not found'; end if;
  else
    select p.id into other_user from public.profiles p where p.role = 'admin' and p.approval_status = 'approved';
  end if;
  return query select m.id, m.body, m.created_at, m.sender_id = auth.uid(),
    case when m.sender_id = auth.uid() then 'You' when public.is_admin() then p.full_name else 'Administrator' end, m.attachment_path, m.attachment_name, m.attachment_type
  from public.direct_messages m join public.profiles p on p.id = m.sender_id
  where (m.sender_id = auth.uid() and m.recipient_id = other_user) or (m.sender_id = other_user and m.recipient_id = auth.uid())
  order by m.created_at asc;
end;
$$;

create function public.send_group_message(message_text text, next_attachment_path text default null, next_attachment_name text default null, next_attachment_type text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if nullif(trim(message_text), '') is null and next_attachment_path is null then raise exception 'Message cannot be empty'; end if;
  if char_length(trim(message_text)) > 2000 then raise exception 'Message is too long'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and approval_status = 'approved' and not is_blocked) then raise exception 'Account is not allowed to send messages'; end if;
  if next_attachment_path is not null and next_attachment_path !~ ('^' || auth.uid()::text || '/') then raise exception 'Invalid attachment'; end if;
  insert into public.group_messages (sender_id, body, attachment_path, attachment_name, attachment_type) values (auth.uid(), coalesce(trim(message_text), ''), next_attachment_path, next_attachment_name, next_attachment_type);
end;
$$;

create function public.get_group_messages()
returns table(id uuid, body text, created_at timestamptz, is_mine boolean, sender_label text, attachment_path text, attachment_name text, attachment_type text)
language sql security definer set search_path = public as $$
  select m.id, m.body, m.created_at, m.sender_id = auth.uid(),
    case when m.sender_id = auth.uid() then 'You' when p.role = 'admin' then 'Administrator' when public.is_admin() then p.full_name else 'Anonymous member' end,
    m.attachment_path, m.attachment_name, m.attachment_type
  from public.group_messages m join public.profiles p on p.id = m.sender_id
  order by m.created_at asc;
$$;

create or replace function public.get_chat_stats()
returns table(total_users bigint, active_users bigint) language sql security definer set search_path = public as $$
  select count(*) filter (where role = 'user'), count(*) filter (where role = 'user' and last_seen_at > now() - interval '75 seconds') from public.profiles;
$$;

create or replace function public.edit_chat_message(message_scope text, target_message_id uuid, next_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then raise exception 'Administrators cannot edit chat messages'; end if;
  if nullif(trim(next_body), '') is null then raise exception 'Message cannot be empty'; end if;
  if char_length(trim(next_body)) > 2000 then raise exception 'Message is too long'; end if;
  if message_scope = 'group' then
    update public.group_messages set body = trim(next_body), updated_at = now()
    where id = target_message_id and sender_id = auth.uid() and created_at >= now() - interval '10 minutes';
  elsif message_scope = 'direct' then
    update public.direct_messages set body = trim(next_body), updated_at = now()
    where id = target_message_id and sender_id = auth.uid() and created_at >= now() - interval '10 minutes';
  else
    raise exception 'Invalid message type';
  end if;
  if not found then raise exception 'Messages can only be edited by their sender within 10 minutes'; end if;
end;
$$;

create or replace function public.admin_delete_chat_message(message_scope text, target_message_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if message_scope = 'group' then
    delete from public.group_messages where id = target_message_id;
  elsif message_scope = 'direct' then
    delete from public.direct_messages where id = target_message_id;
  else
    raise exception 'Invalid message type';
  end if;
  if not found then raise exception 'Message not found'; end if;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Users can view profile avatars" on storage.objects;
drop policy if exists "Users can upload their profile avatar" on storage.objects;
drop policy if exists "Users can replace their profile avatar" on storage.objects;
create policy "Users can view profile avatars" on storage.objects
  for select to authenticated using (bucket_id = 'profile-avatars');
create policy "Users can upload their profile avatar" on storage.objects
  for insert to authenticated with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can replace their profile avatar" on storage.objects
  for update to authenticated using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.update_my_avatar(next_avatar_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if next_avatar_path is null or next_avatar_path !~ ('^' || auth.uid()::text || '/avatar\.(jpg|png|webp)$') then
    raise exception 'Invalid avatar path';
  end if;
  update public.profiles set avatar_path = next_avatar_path where id = auth.uid();
end;
$$;

create or replace function public.remove_my_avatar()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set avatar_path = null where id = auth.uid();
end;
$$;

-- Give paid accounts created before subscription tracking a fresh initial period.
-- This only affects rows that do not already have an expiry date.
update public.profiles
set
  subscription_started_at = coalesce(subscription_started_at, now()),
  subscription_expires_at = now() + case
    when plan = 'monthly' then interval '1 month'
    when plan = 'yearly' then interval '1 year'
  end
where plan in ('monthly', 'yearly')
  and subscription_expires_at is null;

create or replace function public.touch_last_seen()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set last_seen_at = now() where id = auth.uid();
end;
$$;

create or replace function public.admin_get_user_details(target_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select jsonb_build_object(
    'profile', to_jsonb(p),
    'workspace', jsonb_build_object(
      'languages', coalesce(w.languages, '[]'::jsonb),
      'questions', coalesce(w.questions, '{}'::jsonb)
    )
  ) into result
  from public.profiles p left join public.user_workspaces w on w.user_id = p.id
  where p.id = target_user_id and p.role = 'user';
  if result is null then raise exception 'User not found'; end if;
  return result;
end;
$$;

create or replace function public.admin_save_user_workspace(target_user_id uuid, next_languages jsonb, next_questions jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  insert into public.user_workspaces (user_id, languages, questions, updated_at)
  values (target_user_id, next_languages, next_questions, now())
  on conflict (user_id) do update set languages = excluded.languages, questions = excluded.questions, updated_at = excluded.updated_at;
end;
$$;

create or replace function public.admin_set_user_blocked(target_user_id uuid, blocked boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  update public.profiles set is_blocked = blocked where id = target_user_id and role = 'user';
  if not found then raise exception 'User not found'; end if;
end;
$$;

-- Approving a monthly or yearly plan starts (or extends) that user's subscription.
create or replace function public.admin_review_user(target_user_id uuid, decision public.approval_state)
returns void language plpgsql security definer set search_path = public as $$
declare
  current_profile public.profiles%rowtype;
  is_upgrade boolean;
  next_plan public.subscription_plan;
  base_expiry timestamptz;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if decision not in ('approved', 'rejected') then raise exception 'Invalid review decision'; end if;

  select * into current_profile from public.profiles where id = target_user_id and role = 'user' for update;
  if not found then raise exception 'User not found'; end if;

  is_upgrade := current_profile.requested_plan is not null and current_profile.approval_status = 'approved';
  next_plan := case when is_upgrade and decision = 'approved' then current_profile.requested_plan else current_profile.plan end;

  if is_upgrade then
    update public.profiles set
      plan = next_plan,
      requested_plan = null,
      approval_status = 'approved',
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where id = target_user_id;
  else
    update public.profiles set
      approval_status = decision,
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where id = target_user_id;
  end if;

  if decision = 'approved' and next_plan in ('monthly', 'yearly') then
    base_expiry := greatest(coalesce(current_profile.subscription_expires_at, now()), now());
    update public.profiles set
      subscription_started_at = coalesce(subscription_started_at, now()),
      subscription_expires_at = base_expiry + case when next_plan = 'monthly' then interval '1 month' else interval '1 year' end
    where id = target_user_id;
  end if;
end;
$$;

-- Deletes the Supabase Auth account and cascades to profiles/workspace.
create or replace function public.admin_delete_user(target_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  delete from auth.users where id = target_user_id and id <> auth.uid();
  if not found then raise exception 'User not found'; end if;
end;
$$;

revoke all on function public.touch_last_seen() from public;
revoke all on function public.ensure_my_profile() from public;
revoke all on table public.direct_messages, public.group_messages from public;
revoke all on function public.send_direct_message(uuid, text, text, text, text) from public;
revoke all on function public.get_direct_messages(uuid) from public;
revoke all on function public.send_group_message(text, text, text, text) from public;
revoke all on function public.get_group_messages() from public;
revoke all on function public.get_chat_stats() from public;
revoke all on function public.edit_chat_message(text, uuid, text) from public;
revoke all on function public.admin_delete_chat_message(text, uuid) from public;
revoke all on function public.update_my_avatar(text) from public;
revoke all on function public.remove_my_avatar() from public;
revoke all on function public.admin_get_user_details(uuid) from public;
revoke all on function public.admin_save_user_workspace(uuid, jsonb, jsonb) from public;
revoke all on function public.admin_set_user_blocked(uuid, boolean) from public;
revoke all on function public.admin_review_user(uuid, public.approval_state) from public;
revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.ensure_my_profile() to authenticated;
grant execute on function public.send_direct_message(uuid, text, text, text, text) to authenticated;
grant execute on function public.get_direct_messages(uuid) to authenticated;
grant execute on function public.send_group_message(text, text, text, text) to authenticated;
grant execute on function public.get_group_messages() to authenticated;
grant execute on function public.get_chat_stats() to authenticated;
grant execute on function public.edit_chat_message(text, uuid, text) to authenticated;
grant execute on function public.admin_delete_chat_message(text, uuid) to authenticated;
grant execute on function public.update_my_avatar(text) to authenticated;
grant execute on function public.remove_my_avatar() to authenticated;
grant execute on function public.admin_get_user_details(uuid) to authenticated;
grant execute on function public.admin_save_user_workspace(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.admin_set_user_blocked(uuid, boolean) to authenticated;
grant execute on function public.admin_review_user(uuid, public.approval_state) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
