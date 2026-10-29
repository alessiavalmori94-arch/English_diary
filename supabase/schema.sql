-- Run this once in Supabase: SQL Editor → New query → paste → Run.

create table if not exists public.cells (
  kind text not null check (kind in ('words', 'sentences')),
  day date not null,
  idx smallint not null check (idx between 0 and 4),
  field text not null check (field in ('en', 'it')),
  value text not null default '',
  updated_at timestamptz not null default now(),
  primary key (kind, day, idx, field)
);

alter table public.cells enable row level security;

-- Every signed-in user shares the same diary, so sign-ups must be disabled
-- (Authentication → Sign In / Providers → turn off "Allow new users to sign up").
create policy "family can read" on public.cells
  for select to authenticated using (true);

create policy "family can insert" on public.cells
  for insert to authenticated with check (true);

create policy "family can update" on public.cells
  for update to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.cells;
