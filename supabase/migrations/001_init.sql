create table drawings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  title text not null default 'Untitled',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table drawings enable row level security;
create policy "Users manage own drawings" on drawings
  for all using (auth.uid() = owner_id);

create table user_secrets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  provider text not null,
  encrypted_key text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, provider)
);
alter table user_secrets enable row level security;
create policy "No client access" on user_secrets for all using (false);
