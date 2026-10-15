-- CodeKita: persistent image/GIF attachments on comments.
-- Safe to run in Supabase SQL Editor after the base schema.

alter table public.comments add column if not exists media_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comment-media',
  'comment-media',
  false,
  5242880,
  array['image/jpeg','image/png','image/gif','image/webp','image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "CodeKita comment media authorized read" on storage.objects;
create policy "CodeKita comment media authorized read"
on storage.objects for select to authenticated
using (
  bucket_id = 'comment-media'
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(name))[2]
      and ((p.status = 'published' and p.visibility = 'public') or p.user_id = auth.uid())
  )
);

drop policy if exists "CodeKita comment media owner upload" on storage.objects;
create policy "CodeKita comment media owner upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'comment-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "CodeKita comment media owner delete" on storage.objects;
create policy "CodeKita comment media owner delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'comment-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);
