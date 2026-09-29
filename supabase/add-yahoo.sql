-- Adds Yahoo support. Run once in Supabase: SQL Editor -> New query -> paste -> Run.

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
