-- Run once in Supabase: SQL Editor → New query → paste → Run.
-- Rules are attached to Dad's profile. The teacher can create, edit, and delete;
-- the student can read them.

create table if not exists public.rules (
  id bigint generated always as identity primary key,
  owner uuid not null references public.profiles (id) on delete cascade,
  slug text,
  title text not null,
  explanation text not null,
  examples text not null default '',
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rules_title_not_empty check (length(trim(title)) > 0),
  constraint rules_explanation_not_empty check (length(trim(explanation)) > 0)
);

alter table public.rules add column if not exists slug text;
alter table public.rules add column if not exists content jsonb not null default '{}'::jsonb;
create unique index if not exists rules_slug_key on public.rules (slug);

alter table public.rules enable row level security;

drop policy if exists "rules read" on public.rules;
create policy "rules read" on public.rules
  for select to authenticated using (public.can_access(owner));

drop policy if exists "rules teacher insert" on public.rules;
create policy "rules teacher insert" on public.rules
  for insert to authenticated with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'teacher'
    )
    and exists (
      select 1 from public.profiles
      where id = owner and role = 'student' and teacher_id = auth.uid()
    )
  );

drop policy if exists "rules teacher update" on public.rules;
create policy "rules teacher update" on public.rules
  for update to authenticated using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'teacher'
    )
    and exists (
      select 1 from public.profiles
      where id = owner and role = 'student' and teacher_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'teacher'
    )
    and exists (
      select 1 from public.profiles
      where id = owner and role = 'student' and teacher_id = auth.uid()
    )
  );

drop policy if exists "rules teacher delete" on public.rules;
create policy "rules teacher delete" on public.rules
  for delete to authenticated using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'teacher'
    )
    and exists (
      select 1 from public.profiles
      where id = owner and role = 'student' and teacher_id = auth.uid()
    )
  );

-- The first custom visual guide. New guides can use different layouts in content.
insert into public.rules (owner, slug, title, explanation, examples, content)
select p.id,
  'much-many-too-much',
  'How much, how many, very & too',
  'Guarda il nome o l’aggettivo che viene dopo.',
  '',
  $$
  {
    "theme": "quantity",
    "sections": [
      {
        "title": "QUANTO? · Guarda il nome",
        "columns": 2,
        "items": [
          {
            "title": "HOW MANY",
            "formula": "how many + nome plurale numerabile",
            "examples": [
              { "en": "How many books?", "it": "Quanti libri?" }
            ]
          },
          {
            "title": "HOW MUCH",
            "formula": "how much + nome non numerabile",
            "examples": [
              { "en": "How much water?", "it": "Quanta acqua?" }
            ]
          }
        ]
      },
      {
        "title": "MOLTO + NOME · Conta o non conta?",
        "columns": 3,
        "items": [
          {
            "title": "A LOT OF",
            "formula": "Affermativa: a lot of + entrambi",
            "examples": [
              { "en": "a lot of books / a lot of time", "it": "molti libri / molto tempo" }
            ]
          },
          {
            "title": "MANY",
            "formula": "Negativa/domanda: many + plurale",
            "examples": [
              { "en": "I don't have many books.", "it": "Non ho molti libri." }
            ]
          },
          {
            "title": "MUCH",
            "formula": "Negativa/domanda: much + non numerabile",
            "examples": [
              { "en": "We don't have much time.", "it": "Non abbiamo molto tempo." }
            ]
          }
        ]
      },
      {
        "title": "MOLTO + AGGETTIVO",
        "columns": 2,
        "items": [
          {
            "title": "VERY",
            "formula": "very + aggettivo = molto",
            "examples": [
              { "en": "very tired", "it": "molto stanco" }
            ]
          },
          {
            "title": "REALLY",
            "formula": "really + aggettivo = superlativo assoluto",
            "examples": [
              { "en": "really tired", "it": "stanchissimo" }
            ],
            "tone": "neutral"
          }
        ]
      },
      {
        "title": "TROPPO",
        "columns": 3,
        "items": [
          {
            "title": "TOO",
            "formula": "too + aggettivo",
            "examples": [
              { "en": "too tired", "it": "troppo stanco" }
            ],
            "tone": "caution"
          },
          {
            "title": "TOO MANY",
            "formula": "too many + nome plurale numerabile",
            "examples": [
              { "en": "too many bags", "it": "troppe borse" }
            ],
            "tone": "caution"
          },
          {
            "title": "TOO MUCH",
            "formula": "too much + nome non numerabile",
            "examples": [
              { "en": "too much sugar", "it": "troppo zucchero" }
            ],
            "tone": "caution"
          }
        ]
      }
    ],
    "takeaway": "NOME: a lot of nelle affermative · many con plurali · much con nomi non numerabili. AGGETTIVO: very = molto · really = -issimo. TROPPO: too + aggettivo."
  }
  $$::jsonb
from public.profiles p
where p.id = (
  select id from public.profiles where role = 'student' and name = 'Dad' order by id limit 1
)
on conflict (slug) do update set
  title = excluded.title,
  explanation = excluded.explanation,
  content = excluded.content,
  updated_at = now();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rules'
  ) then
    alter publication supabase_realtime add table public.rules;
  end if;
end $$;
