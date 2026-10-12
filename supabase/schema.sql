-- MHUB accounts: one row per saved item (mistake, score, topic, flashcard set, settings).
-- Paste this whole file into Supabase → SQL Editor → New query → Run.

create table if not exists public.mhub_docs (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  path       text        not null,
  data       jsonb,
  deleted    boolean     not null default false,
  ts         bigint      not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, path)
);

create index if not exists mhub_docs_user_updated on public.mhub_docs (user_id, updated_at);

-- Row level security: every account can only see and change its own rows.
alter table public.mhub_docs enable row level security;

drop policy if exists "mhub own select" on public.mhub_docs;
drop policy if exists "mhub own insert" on public.mhub_docs;
drop policy if exists "mhub own update" on public.mhub_docs;
drop policy if exists "mhub own delete" on public.mhub_docs;
create policy "mhub own select" on public.mhub_docs for select using (auth.uid() = user_id);
create policy "mhub own insert" on public.mhub_docs for insert with check (auth.uid() = user_id);
create policy "mhub own update" on public.mhub_docs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "mhub own delete" on public.mhub_docs for delete using (auth.uid() = user_id);

-- Keep updated_at current so devices can pull only what changed.
create or replace function public.mhub_touch() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists mhub_touch on public.mhub_docs;
create trigger mhub_touch before update on public.mhub_docs for each row execute function public.mhub_touch();
