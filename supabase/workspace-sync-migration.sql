-- Run this once in the Supabase SQL Editor to enable user workspace sync.
create table if not exists public.user_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  languages jsonb not null default '[]'::jsonb,
  questions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_workspaces enable row level security;

create policy "Users can read their own workspace"
  on public.user_workspaces for select to authenticated
  using (user_id = auth.uid());

create policy "Users can create their own workspace"
  on public.user_workspaces for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update their own workspace"
  on public.user_workspaces for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
