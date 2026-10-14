create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null default 'Pengguna CodeKita',
  bio text not null default '',
  avatar_url text,
  website text,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_project_id uuid references public.projects(id) on delete set null,
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  tags text[] not null default '{}',
  category text not null default 'Eksperimen',
  level text not null default 'Pemula' check (level in ('Pemula','Menengah','Lanjutan')),
  html_code text not null default '',
  css_code text not null default '',
  js_code text not null default '',
  status text not null default 'draft' check (status in ('draft','published')),
  visibility text not null default 'public' check (visibility in ('public','private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_public_feed_idx on public.projects(status, visibility, created_at desc);
create index if not exists projects_user_idx on public.projects(user_id, updated_at desc);

create table if not exists public.project_likes (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(project_id, user_id)
);

create table if not exists public.project_reposts (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(project_id, user_id)
);

create table if not exists public.bookmarks (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  collection_id uuid,
  created_at timestamptz not null default now(),
  primary key(project_id, user_id)
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookmarks_collection_id_fkey') then
    alter table public.bookmarks
      add constraint bookmarks_collection_id_fkey
      foreign key (collection_id) references public.collections(id) on delete set null;
  end if;
end $$;

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists comments_project_created_idx on public.comments(project_id, created_at asc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('like','comment','follow','repost','message','system')),
  project_id uuid references public.projects(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx on public.notifications(recipient_id, created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index if not exists messages_pair_idx on public.messages(sender_id, recipient_id, created_at desc);
create index if not exists messages_recipient_idx on public.messages(recipient_id, created_at desc);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 1000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
for each row execute function public.set_updated_at();

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_name text;
  safe_username text;
begin
  base_name := coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(coalesce(new.email, 'pengguna'), '@', 1));
  safe_username := lower(regexp_replace(split_part(coalesce(new.email, 'pengguna'), '@', 1), '[^a-zA-Z0-9_]', '', 'g'));
  if safe_username = '' then safe_username := 'pengguna'; end if;
  safe_username := left(safe_username, 18) || '_' || substr(replace(new.id::text, '-', ''), 1, 6);

  insert into public.profiles(id, username, display_name)
  values (new.id, safe_username, left(base_name, 60))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_codekita on auth.users;
create trigger on_auth_user_created_codekita
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create or replace function public.notify_codekita_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
  actor_user uuid;
  target_project uuid;
  notification_type text;
  target_comment uuid;
begin
  if tg_table_name = 'project_likes' then
    target_project := new.project_id;
    actor_user := new.user_id;
    notification_type := 'like';
    select user_id into target_user from public.projects where id = target_project;
  elsif tg_table_name = 'comments' then
    target_project := new.project_id;
    actor_user := new.user_id;
    target_comment := new.id;
    notification_type := 'comment';
    select user_id into target_user from public.projects where id = target_project;
  elsif tg_table_name = 'project_reposts' then
    target_project := new.project_id;
    actor_user := new.user_id;
    notification_type := 'repost';
    select user_id into target_user from public.projects where id = target_project;
  elsif tg_table_name = 'follows' then
    actor_user := new.follower_id;
    target_user := new.following_id;
    notification_type := 'follow';
  elsif tg_table_name = 'messages' then
    actor_user := new.sender_id;
    target_user := new.recipient_id;
    notification_type := 'message';
  end if;

  if target_user is not null and actor_user is distinct from target_user then
    insert into public.notifications(recipient_id, actor_id, type, project_id, comment_id)
    values (target_user, actor_user, notification_type, target_project, target_comment);
  end if;
  return new;
end;
$$;

drop trigger if exists notify_project_likes_codekita on public.project_likes;
create trigger notify_project_likes_codekita after insert on public.project_likes
for each row execute function public.notify_codekita_activity();

drop trigger if exists notify_project_comments_codekita on public.comments;
create trigger notify_project_comments_codekita after insert on public.comments
for each row execute function public.notify_codekita_activity();

drop trigger if exists notify_project_reposts_codekita on public.project_reposts;
create trigger notify_project_reposts_codekita after insert on public.project_reposts
for each row execute function public.notify_codekita_activity();

drop trigger if exists notify_follows_codekita on public.follows;
create trigger notify_follows_codekita after insert on public.follows
for each row execute function public.notify_codekita_activity();

drop trigger if exists notify_messages_codekita on public.messages;
create trigger notify_messages_codekita after insert on public.messages
for each row execute function public.notify_codekita_activity();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_likes enable row level security;
alter table public.project_reposts enable row level security;
alter table public.bookmarks enable row level security;
alter table public.collections enable row level security;
alter table public.follows enable row level security;
alter table public.comments enable row level security;
alter table public.notifications enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;

drop policy if exists profiles_public_read on public.profiles;
create policy profiles_public_read on public.profiles for select using (true);
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert with check (auth.uid() = id);
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists projects_read_public_or_owner on public.projects;
create policy projects_read_public_or_owner on public.projects for select
using ((status = 'published' and visibility = 'public') or user_id = auth.uid());
drop policy if exists projects_insert_self on public.projects;
create policy projects_insert_self on public.projects for insert with check (user_id = auth.uid());
drop policy if exists projects_update_self on public.projects;
create policy projects_update_self on public.projects for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists projects_delete_self on public.projects;
create policy projects_delete_self on public.projects for delete using (user_id = auth.uid());

drop policy if exists likes_read_visible_projects on public.project_likes;
create policy likes_read_visible_projects on public.project_likes for select
using (exists (select 1 from public.projects p where p.id = project_likes.project_id and ((p.status = 'published' and p.visibility = 'public') or p.user_id = auth.uid())));
drop policy if exists likes_insert_self on public.project_likes;
create policy likes_insert_self on public.project_likes for insert with check (user_id = auth.uid() and exists (select 1 from public.projects p where p.id = project_id and p.status = 'published' and p.visibility = 'public'));
drop policy if exists likes_delete_self on public.project_likes;
create policy likes_delete_self on public.project_likes for delete using (user_id = auth.uid());

drop policy if exists reposts_read_visible_projects on public.project_reposts;
create policy reposts_read_visible_projects on public.project_reposts for select
using (exists (select 1 from public.projects p where p.id = project_reposts.project_id and ((p.status = 'published' and p.visibility = 'public') or p.user_id = auth.uid())));
drop policy if exists reposts_insert_self on public.project_reposts;
create policy reposts_insert_self on public.project_reposts for insert with check (user_id = auth.uid() and exists (select 1 from public.projects p where p.id = project_id and p.status = 'published' and p.visibility = 'public'));
drop policy if exists reposts_delete_self on public.project_reposts;
create policy reposts_delete_self on public.project_reposts for delete using (user_id = auth.uid());

drop policy if exists bookmarks_read_self on public.bookmarks;
create policy bookmarks_read_self on public.bookmarks for select using (user_id = auth.uid());
drop policy if exists bookmarks_insert_self on public.bookmarks;
create policy bookmarks_insert_self on public.bookmarks for insert with check (user_id = auth.uid());
drop policy if exists bookmarks_delete_self on public.bookmarks;
create policy bookmarks_delete_self on public.bookmarks for delete using (user_id = auth.uid());

drop policy if exists collections_read_self on public.collections;
create policy collections_read_self on public.collections for select using (user_id = auth.uid());
drop policy if exists collections_insert_self on public.collections;
create policy collections_insert_self on public.collections for insert with check (user_id = auth.uid());
drop policy if exists collections_update_self on public.collections;
create policy collections_update_self on public.collections for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists collections_delete_self on public.collections;
create policy collections_delete_self on public.collections for delete using (user_id = auth.uid());

drop policy if exists follows_read_public on public.follows;
create policy follows_read_public on public.follows for select using (true);
drop policy if exists follows_insert_self on public.follows;
create policy follows_insert_self on public.follows for insert with check (follower_id = auth.uid() and following_id <> auth.uid());
drop policy if exists follows_delete_self on public.follows;
create policy follows_delete_self on public.follows for delete using (follower_id = auth.uid());

drop policy if exists comments_read_visible_projects on public.comments;
create policy comments_read_visible_projects on public.comments for select
using (exists (select 1 from public.projects p where p.id = comments.project_id and ((p.status = 'published' and p.visibility = 'public') or p.user_id = auth.uid())));
drop policy if exists comments_insert_self on public.comments;
create policy comments_insert_self on public.comments for insert with check (user_id = auth.uid() and exists (select 1 from public.projects p where p.id = project_id and p.status = 'published' and p.visibility = 'public'));
drop policy if exists comments_update_self on public.comments;
create policy comments_update_self on public.comments for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists comments_delete_self on public.comments;
create policy comments_delete_self on public.comments for delete using (user_id = auth.uid());

drop policy if exists notifications_read_self on public.notifications;
create policy notifications_read_self on public.notifications for select using (recipient_id = auth.uid());
drop policy if exists notifications_update_self on public.notifications;
create policy notifications_update_self on public.notifications for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

drop policy if exists messages_read_participant on public.messages;
create policy messages_read_participant on public.messages for select using (sender_id = auth.uid() or recipient_id = auth.uid());
drop policy if exists messages_insert_sender on public.messages;
create policy messages_insert_sender on public.messages for insert with check (sender_id = auth.uid() and recipient_id <> auth.uid());
drop policy if exists messages_update_recipient on public.messages;
create policy messages_update_recipient on public.messages for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

drop policy if exists reports_insert_self on public.reports;
create policy reports_insert_self on public.reports for insert with check (reporter_id = auth.uid());
drop policy if exists reports_read_self on public.reports;
create policy reports_read_self on public.reports for select using (reporter_id = auth.uid());


grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.projects, public.project_likes, public.project_reposts, public.comments, public.follows to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.projects, public.project_likes, public.project_reposts, public.bookmarks, public.collections, public.follows, public.comments, public.notifications, public.messages, public.reports to authenticated;
