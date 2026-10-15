-- CodeKita group messaging migration
-- Run this file once in Supabase SQL Editor after the existing schema.sql.

create table if not exists public.conversation_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_group_members (
  group_id uuid not null references public.conversation_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create or replace function public.is_conversation_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $
  select exists (
    select 1 from public.conversation_group_members m
    where m.group_id = p_group_id and m.user_id = auth.uid()
  );
$;

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.conversation_groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists group_members_user_idx on public.conversation_group_members(user_id, joined_at desc);
create index if not exists group_messages_group_idx on public.group_messages(group_id, created_at desc);

alter table public.conversation_groups enable row level security;
alter table public.conversation_group_members enable row level security;
alter table public.group_messages enable row level security;

drop policy if exists conversation_groups_read_member on public.conversation_groups;
create policy conversation_groups_read_member on public.conversation_groups for select
using (created_by = auth.uid() or public.is_conversation_group_member(id));

drop policy if exists conversation_groups_create_owner on public.conversation_groups;
create policy conversation_groups_create_owner on public.conversation_groups for insert
with check (created_by = auth.uid());

drop policy if exists conversation_groups_update_owner on public.conversation_groups;
create policy conversation_groups_update_owner on public.conversation_groups for update
using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists conversation_group_members_read_member on public.conversation_group_members;
create policy conversation_group_members_read_member on public.conversation_group_members for select
using (user_id = auth.uid() or public.is_conversation_group_member(group_id));

drop policy if exists conversation_group_members_insert_owner on public.conversation_group_members;
create policy conversation_group_members_insert_owner on public.conversation_group_members for insert
with check (
  exists (select 1 from public.conversation_groups g where g.id = group_id and g.created_by = auth.uid())
  or (user_id = auth.uid() and exists (select 1 from public.conversation_groups g where g.id = group_id and g.created_by = auth.uid()))
);

drop policy if exists conversation_group_members_delete_owner_or_self on public.conversation_group_members;
create policy conversation_group_members_delete_owner_or_self on public.conversation_group_members for delete
using (user_id = auth.uid() or exists (select 1 from public.conversation_groups g where g.id = group_id and g.created_by = auth.uid()));

drop policy if exists group_messages_read_member on public.group_messages;
create policy group_messages_read_member on public.group_messages for select
using (public.is_conversation_group_member(group_id));

drop policy if exists group_messages_insert_member on public.group_messages;
create policy group_messages_insert_member on public.group_messages for insert
with check (sender_id = auth.uid() and public.is_conversation_group_member(group_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_messages'
  ) then
    alter publication supabase_realtime add table public.group_messages;
  end if;
end $$;
