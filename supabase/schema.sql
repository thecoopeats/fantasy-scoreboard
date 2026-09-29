-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.sleeper_accounts (
  user_id         uuid primary key references auth.users on delete cascade,
  username        text not null,
  sleeper_user_id text not null,
  created_at      timestamptz not null default now()
);

create table if not exists public.espn_leagues (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  league_id   text not null,
  league_name text,
  team_id     int,
  team_name   text,
  espn_s2     text, -- encrypted by the app, null for public leagues
  swid        text, -- encrypted by the app, null for public leagues
  created_at  timestamptz not null default now(),
  unique (user_id, league_id)
);

-- Row level security: each person can only see and change their own rows.
alter table public.sleeper_accounts enable row level security;
alter table public.espn_leagues enable row level security;

drop policy if exists "own sleeper account" on public.sleeper_accounts;
create policy "own sleeper account" on public.sleeper_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own espn leagues" on public.espn_leagues;
create policy "own espn leagues" on public.espn_leagues
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


create table if not exists public.yahoo_accounts (
  user_id       uuid primary key references auth.users on delete cascade,
  yahoo_guid    text,
  access_token  text not null, -- encrypted by the app
  refresh_token text not null, -- encrypted by the app
  expires_at    timestamptz not null,
  redirect_uri  text not null,
  created_at    timestamptz not null default now()
);

alter table public.yahoo_accounts enable row level security;

drop policy if exists "own yahoo account" on public.yahoo_accounts;
create policy "own yahoo account" on public.yahoo_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
