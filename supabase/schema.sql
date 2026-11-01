-- ÉLYSSIA MVP: execute this entire file in Supabase > SQL Editor.
-- Users must be 18+. Do not put a Supabase service-role key in frontend code.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  age integer not null check (age >= 18 and age <= 110),
  city text not null default '' check (char_length(city) <= 80),
  bio text not null default '' check (char_length(bio) <= 500),
  photo_url text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  liker_id uuid not null references public.profiles(id) on delete cascade,
  liked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint likes_not_self check (liker_id <> liked_id),
  constraint likes_unique unique (liker_id, liked_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint matches_not_self check (user_a <> user_b),
  constraint matches_unique_pair unique (user_a, user_b)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null default 'Signalement envoyé depuis le profil',
  created_at timestamptz not null default now(),
  constraint reports_not_self check (reporter_id <> reported_id)
);

alter table public.profiles enable row level security;
alter table public.likes enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;

drop policy if exists "Profiles visible to signed in users" on public.profiles;
create policy "Profiles visible to signed in users" on public.profiles for select to authenticated using (true);
drop policy if exists "Users create own profile" on public.profiles;
create policy "Users create own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Read own likes" on public.likes;
create policy "Read own likes" on public.likes for select to authenticated using (auth.uid() = liker_id or auth.uid() = liked_id);
drop policy if exists "Send own likes" on public.likes;
create policy "Send own likes" on public.likes for insert to authenticated with check (auth.uid() = liker_id);

drop policy if exists "Read own matches" on public.matches;
create policy "Read own matches" on public.matches for select to authenticated using (auth.uid() = user_a or auth.uid() = user_b);
-- A match is created only when both people have liked one another.
create or replace function public.create_mutual_match()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.likes l where l.liker_id = new.liked_id and l.liked_id = new.liker_id) then
    insert into public.matches(user_a,user_b)
    values (least(new.liker_id,new.liked_id), greatest(new.liker_id,new.liked_id))
    on conflict (user_a,user_b) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists likes_create_mutual_match on public.likes;
create trigger likes_create_mutual_match after insert on public.likes
for each row execute function public.create_mutual_match();

drop policy if exists "Read messages in own matches" on public.messages;
create policy "Read messages in own matches" on public.messages for select to authenticated using (
  exists(select 1 from public.matches m where m.id = match_id and (m.user_a = auth.uid() or m.user_b = auth.uid()))
);
drop policy if exists "Send messages in own matches" on public.messages;
create policy "Send messages in own matches" on public.messages for insert to authenticated with check (
  sender_id = auth.uid() and exists(select 1 from public.matches m where m.id = match_id and (m.user_a = auth.uid() or m.user_b = auth.uid()))
);

drop policy if exists "Users send reports" on public.reports;
create policy "Users send reports" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists "Users see own reports" on public.reports;
create policy "Users see own reports" on public.reports for select to authenticated using (reporter_id = auth.uid());

-- Storage bucket for profile pictures. Public photos are visible to signed-in users;
-- uploading/deleting is restricted to each user's own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos','profile-photos',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Signed in users view profile photos" on storage.objects;
create policy "Signed in users view profile photos" on storage.objects for select to authenticated using (bucket_id = 'profile-photos');
drop policy if exists "Users upload own profile photos" on storage.objects;
create policy "Users upload own profile photos" on storage.objects for insert to authenticated with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users update own profile photos" on storage.objects;
create policy "Users update own profile photos" on storage.objects for update to authenticated using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users delete own profile photos" on storage.objects;
create policy "Users delete own profile photos" on storage.objects for delete to authenticated using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Enable realtime for messages (ignore error if already added in the dashboard).
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
