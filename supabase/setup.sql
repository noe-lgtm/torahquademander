begin;
create table if not exists public.moadon_state (
  id integer primary key check (id = 1),
  revision bigint not null default 0,
  body jsonb not null
);
alter table public.moadon_state enable row level security;
revoke all on public.moadon_state from public, anon, authenticated;
grant select, insert, update on public.moadon_state to service_role;
insert into public.moadon_state (id, body)
values (1, '{"sessions":[],"ideas":[]}'::jsonb)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moadon-audio','moadon-audio',false,3800000,array['audio/webm','audio/mp4','audio/ogg'])
on conflict (id) do nothing;
commit;
