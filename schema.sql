-- Flight Plan — Supabase schema
-- Run this once in your project's SQL Editor (Supabase dashboard → SQL Editor → New query → Run)

-- 1. Profiles: one row per user, linked to Supabase's built-in auth.users table.
--    Holds the display username and whether they're an admin.
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz default now()
);

-- Automatically create a profile row whenever someone signs up.
-- The username comes from the signup form (stored as user metadata).
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Classes people can sign up for.
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  created_at timestamptz default now()
);

-- 3. Appointment time slots for a class.
create table public.slots (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.classes(id) on delete cascade,
  date date not null,
  time text not null,
  capacity int not null default 8,
  created_at timestamptz default now()
);

-- 4. Bookings: one row per person signed up for one slot.
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid references public.slots(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (slot_id, user_id)
);

-- 5. Calendar events.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  title text not null,
  description text default '',
  created_at timestamptz default now()
);

-- Helper used by the policies below: is the signed-in user an admin?
create function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer;

-- Turn on row-level security for every table.
alter table public.profiles enable row level security;
alter table public.classes  enable row level security;
alter table public.slots    enable row level security;
alter table public.bookings enable row level security;
alter table public.events   enable row level security;

-- Profiles: anyone signed in can see usernames (needed to show class rosters);
-- people can only edit their own profile.
create policy "profiles are viewable by everyone" on public.profiles
  for select using (true);
create policy "users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

-- Classes: everyone can browse; only admins can add/edit/delete.
create policy "classes are viewable by everyone" on public.classes
  for select using (true);
create policy "admins manage classes" on public.classes
  for all using (public.is_admin()) with check (public.is_admin());

-- Slots: everyone can browse; only admins can add/edit/delete.
create policy "slots are viewable by everyone" on public.slots
  for select using (true);
create policy "admins manage slots" on public.slots
  for all using (public.is_admin()) with check (public.is_admin());

-- Bookings: you can see your own bookings; admins can see everyone's
-- (so they can view class rosters). You can only book/cancel for yourself.
create policy "see own bookings, admins see all" on public.bookings
  for select using (auth.uid() = user_id or public.is_admin());
create policy "book a slot for yourself" on public.bookings
  for insert with check (auth.uid() = user_id);
create policy "cancel your own booking" on public.bookings
  for delete using (auth.uid() = user_id or public.is_admin());

-- Events: everyone can view; only admins can add/edit/delete.
create policy "events are viewable by everyone" on public.events
  for select using (true);
create policy "admins manage events" on public.events
  for all using (public.is_admin()) with check (public.is_admin());
