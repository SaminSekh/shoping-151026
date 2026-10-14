-- ============================================================
-- NovaCart admin — Supabase schema
-- Run this once in the Supabase SQL editor (Dashboard > SQL > New query).
-- ============================================================

-- ---------- products ----------
create table if not exists public.products (
    id           text primary key,
    name         text not null,
    brand        text default '',
    category     text default '',
    price        numeric default 0,
    mrp          numeric default 0,
    rating       numeric default 4.5,
    review_count integer default 0,
    stock        integer default 0,
    images       jsonb default '[]'::jsonb,
    colors       jsonb default '[]'::jsonb,
    sizes        jsonb default '[]'::jsonb,
    description  text default '',
    highlights   jsonb default '[]'::jsonb,
    badges       jsonb default '[]'::jsonb,
    keywords     text default '',
    visible      boolean default true,
    sort_order   integer default 0,
    created_at   timestamptz default now(),
    updated_at   timestamptz default now()
);

create index if not exists products_sort_idx on public.products (sort_order, created_at);

-- ---------- settings (single row, id = 1) ----------
create table if not exists public.settings (
    id         integer primary key default 1,
    data       jsonb not null default '{}'::jsonb,
    updated_at timestamptz default now(),
    constraint settings_singleton check (id = 1)
);

-- ---------- orders ----------
create table if not exists public.orders (
    id         text primary key,
    status     text not null default 'pending',
    data       jsonb not null default '{}'::jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);

-- ---------- users (shopper accounts managed by the store) ----------
-- Simple shopper accounts: phone + password are handled by the storefront
-- and the admin panel. Passwords are stored in plain text so the admin
-- can view and change them — do NOT use this for a real store.
create table if not exists public.users (
    id         text primary key,
    name       text default '',
    phone      text unique,
    password   text default '',
    addresses  jsonb not null default '[]'::jsonb,
    cart       jsonb not null default '[]'::jsonb,
    cart_removed jsonb not null default '[]'::jsonb,
    visits     integer not null default 0,
    last_visit timestamptz,
    banned     boolean not null default false,
    last_ip    text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Upgrade an existing users table that predates the cart_removed column.
alter table public.users
    add column if not exists cart_removed jsonb not null default '[]'::jsonb;

-- Upgrade an existing users table that predates the visit tracking columns.
alter table public.users
    add column if not exists visits integer not null default 0;
alter table public.users
    add column if not exists last_visit timestamptz;

-- Upgrade an existing users table that predates the ban columns.
alter table public.users
    add column if not exists banned boolean not null default false;
alter table public.users
    add column if not exists last_ip text;

create index if not exists users_created_idx on public.users (created_at desc);
create index if not exists users_phone_idx on public.users (phone);

-- ---------- bans (blocked shoppers and their IPs) ----------
-- A ban is matched against a visitor by IP address, account id or mobile
-- number. The storefront checks this table on load; the admin panel manages
-- rows from the Users section.
create table if not exists public.bans (
    id         text primary key,
    ip         text,
    user_id    text,
    phone      text,
    reason     text default '',
    created_at timestamptz default now()
);

create index if not exists bans_ip_idx on public.bans (ip);
create index if not exists bans_user_idx on public.bans (user_id);
create index if not exists bans_phone_idx on public.bans (phone);

-- ---------- reviews (shopper ratings & reviews) ----------
-- One row per review; the review payload is stored in `data` jsonb so the
-- storefront and admin can evolve its shape without migrations.
create table if not exists public.reviews (
    id         text primary key,
    product_id text,
    user_id    text,
    data       jsonb not null default '{}'::jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists reviews_product_idx on public.reviews (product_id);
create index if not exists reviews_user_idx on public.reviews (user_id);

-- ---------- profiles (one row per auth user) ----------
create table if not exists public.profiles (
    id         uuid primary key references auth.users (id) on delete cascade,
    name       text default '',
    phone      text default '',
    email      text default '',
    addresses  jsonb not null default '[]'::jsonb,
    updated_at timestamptz default now()
);

-- Create a profile row automatically whenever a new user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.profiles (id, name, phone, email)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
        coalesce(new.raw_user_meta_data ->> 'phone', ''),
        coalesce(new.email, '')
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ---------- Row Level Security ----------
alter table public.products enable row level security;
alter table public.settings enable row level security;
alter table public.orders enable row level security;
alter table public.profiles enable row level security;
alter table public.users enable row level security;
alter table public.reviews enable row level security;
alter table public.bans enable row level security;

-- Public storefront can read products and settings.
drop policy if exists "products_read" on public.products;
create policy "products_read" on public.products
    for select using (true);

drop policy if exists "settings_read" on public.settings;
create policy "settings_read" on public.settings
    for select using (true);

-- ------------------------------------------------------------------
-- WARNING: the policies below let the anon key write data, which is
-- what the simple-password admin panel relies on. Anyone with your
-- anon key can also write. For real protection, switch the admin panel
-- to Supabase Auth and change these to `to authenticated using (true)`.
-- ------------------------------------------------------------------
drop policy if exists "products_write" on public.products;
create policy "products_write" on public.products
    for all using (true) with check (true);

drop policy if exists "settings_write" on public.settings;
create policy "settings_write" on public.settings
    for all using (true) with check (true);

-- The storefront (anon) creates orders; the admin panel reads and updates them.
drop policy if exists "orders_read" on public.orders;
create policy "orders_read" on public.orders
    for select using (true);

drop policy if exists "orders_write" on public.orders;
create policy "orders_write" on public.orders
    for all using (true) with check (true);

-- Shopper accounts: the storefront signs people in and the admin panel
-- manages them, both with the anon key.
drop policy if exists "users_all" on public.users;
create policy "users_all" on public.users
    for all using (true) with check (true);

-- Bans: the storefront reads them to block visitors, the admin panel writes.
drop policy if exists "bans_all" on public.bans;
create policy "bans_all" on public.bans
    for all using (true) with check (true);

-- Reviews: the storefront posts them and the admin can moderate, all with
-- the anon key (same caveat as above).
drop policy if exists "reviews_all" on public.reviews;
create policy "reviews_all" on public.reviews
    for all using (true) with check (true);

-- Profiles are private: each signed-in user can only touch their own row.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
    for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
    for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
    for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------- seed the settings row ----------
insert into public.settings (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;
