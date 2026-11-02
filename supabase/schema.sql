-- Run this file in the Supabase SQL Editor before using the app.
-- Authentication > Providers > Email must be enabled in your Supabase project.

create type public.account_role as enum ('admin', 'user');
create type public.approval_state as enum ('pending', 'approved', 'rejected');
create type public.subscription_plan as enum ('free', 'monthly', 'yearly');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role public.account_role not null default 'user',
  plan public.subscription_plan not null default 'free',
  requested_plan public.subscription_plan,
  approval_status public.approval_state not null default 'approved',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

-- Only one central administrator can exist.
create unique index profiles_one_admin on public.profiles (role) where role = 'admin';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, plan, approval_status)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'plan')::public.subscription_plan, 'free'),
    case when coalesce(new.raw_user_meta_data ->> 'plan', 'free') = 'free' then 'approved'::public.approval_state else 'pending'::public.approval_state end
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and approval_status = 'approved');
$$;

alter table public.profiles enable row level security;

create policy "Users can read their profile; admins can read all"
  on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());

create policy "The central admin can review user requests"
  on public.profiles for update to authenticated
  using (public.is_admin() and role = 'user')
  with check (public.is_admin() and role = 'user');

create policy "Free users can request an upgrade"
  on public.profiles for update to authenticated
  using (id = auth.uid() and role = 'user')
  with check (id = auth.uid() and role = 'user' and plan = 'free' and approval_status = 'approved' and requested_plan in ('monthly', 'yearly'));

create table public.user_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  languages jsonb not null default '[]'::jsonb,
  questions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_workspaces enable row level security;

create policy "Users can read their own workspace" on public.user_workspaces for select to authenticated using (user_id = auth.uid());
create policy "Users can create their own workspace" on public.user_workspaces for insert to authenticated with check (user_id = auth.uid());
create policy "Users can update their own workspace" on public.user_workspaces for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Bootstrap the one admin after that person has registered in the app.
-- Replace the email and run this once:
-- update public.profiles set role = 'admin', approval_status = 'approved', reviewed_at = now()
-- where email = 'owner@example.com';
