-- Run this once in Supabase (SQL Editor → New query → paste → Run),
-- after schema.sql. First put your two emails on the lines marked ←.

-- ---------- Profiles: who is the teacher, who is the student ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  role text not null check (role in ('teacher', 'student')),
  teacher_id uuid references public.profiles (id)
);

alter table public.profiles enable row level security;

drop policy if exists "read own and students" on public.profiles;
create policy "read own and students" on public.profiles
  for select to authenticated using (id = auth.uid() or teacher_id = auth.uid());

create or replace function public.can_access(owner_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select owner_id = auth.uid()
      or exists (select 1 from profiles where id = owner_id and teacher_id = auth.uid());
$$;

-- ---------- Diary cells: one diary per person ----------

alter table public.cells add column if not exists owner uuid references auth.users on delete cascade;

do $$
declare
  teacher_email text := 'alessia.valmori.94@gmail.com';  -- ← your email
  student_email text := 'alura279@gmail.com';            -- ← your dad's email
  teacher uuid;
  student uuid;
begin
  select id into teacher from auth.users where lower(email) = lower(teacher_email);
  select id into student from auth.users where lower(email) = lower(student_email);
  if teacher is null or student is null then
    raise exception 'Email not found. Check both emails in Authentication → Users.';
  end if;

  insert into public.profiles (id, name, role, teacher_id) values (teacher, 'Alessia', 'teacher', null)
    on conflict (id) do update set name = excluded.name, role = 'teacher', teacher_id = null;
  insert into public.profiles (id, name, role, teacher_id) values (student, 'Dad', 'student', teacher)
    on conflict (id) do update set name = excluded.name, role = 'student', teacher_id = teacher;

  update public.cells set owner = teacher where owner is null;
end $$;

alter table public.cells alter column owner set not null;
alter table public.cells alter column owner set default auth.uid();

alter table public.cells drop constraint if exists cells_pkey;
alter table public.cells add primary key (owner, kind, day, idx, field);

alter table public.cells drop constraint if exists cells_field_check;
alter table public.cells add constraint cells_field_check check (field in ('en', 'it', 'fix'));

drop policy if exists "family can read" on public.cells;
drop policy if exists "family can insert" on public.cells;
drop policy if exists "family can update" on public.cells;
drop policy if exists "cells read" on public.cells;
drop policy if exists "cells insert" on public.cells;
drop policy if exists "cells update" on public.cells;

create policy "cells read" on public.cells
  for select to authenticated using (public.can_access(owner));
create policy "cells insert" on public.cells
  for insert to authenticated with check (public.can_access(owner));
create policy "cells update" on public.cells
  for update to authenticated using (public.can_access(owner)) with check (public.can_access(owner));

-- ---------- Review statistics (the teacher can read the student's) ----------

create table if not exists public.review_words (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  word_id text not null,
  known int not null default 0,
  missed int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (owner, word_id)
);

create table if not exists public.review_sessions (
  id bigint generated always as identity primary key,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  total int not null,
  known int not null,
  created_at timestamptz not null default now()
);

alter table public.review_words enable row level security;
alter table public.review_sessions enable row level security;

drop policy if exists "review words read" on public.review_words;
drop policy if exists "review words write" on public.review_words;
drop policy if exists "review words update" on public.review_words;
drop policy if exists "review sessions read" on public.review_sessions;
drop policy if exists "review sessions write" on public.review_sessions;

create policy "review words read" on public.review_words
  for select to authenticated using (public.can_access(owner));
create policy "review words write" on public.review_words
  for insert to authenticated with check (owner = auth.uid());
create policy "review words update" on public.review_words
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

create policy "review sessions read" on public.review_sessions
  for select to authenticated using (public.can_access(owner));
create policy "review sessions write" on public.review_sessions
  for insert to authenticated with check (owner = auth.uid());
