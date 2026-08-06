-- Sejuk Sejuk Service — Operations System schema
-- Run this in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- This is the canonical, current-state schema, including real Supabase Auth
-- (profiles + role-scoped RLS). If you're setting up a brand new project,
-- running this file top to bottom is enough — it also creates the accounts
-- linkage tables. Real accounts themselves still need to be created via
-- Authentication → Users (or scripts/seedUsers.mjs), see README.md.

create extension if not exists "pgcrypto";

-- ── technicians ─────────────────────────────────────────────
create table if not exists technicians (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

-- Uses NOT EXISTS rather than ON CONFLICT (name) so this is safe even if
-- `technicians` already existed before this script ran and its `name`
-- column isn't actually UNIQUE — ON CONFLICT would either error or silently
-- insert duplicate technician rows in that case, both worse than this.
insert into technicians (name)
select v.name
from (values ('Ali'), ('John'), ('Bala'), ('Yusoff')) as v(name)
where not exists (select 1 from technicians t where t.name = v.name);

-- Links a technician row to their real Supabase Auth account.
alter table technicians add column if not exists user_id uuid references auth.users (id);
create unique index if not exists idx_technicians_user_id on technicians (user_id);

-- `phone` already existed on this project's `technicians` table from before
-- schema.sql managed it; added here via ALTER (not the CREATE TABLE above)
-- so a fresh install ends up with the same shape.
alter table technicians add column if not exists phone text;
alter table technicians add column if not exists active boolean not null default true;

-- ── orders ──────────────────────────────────────────────────
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  customer_name text not null,
  phone text not null,
  address text not null,
  problem_description text not null,
  service_type text not null,
  quoted_price numeric(10, 2) not null default 0,
  assigned_technician_id uuid references technicians (id),
  admin_notes text,
  status text not null default 'New'
    check (status in ('New', 'Assigned', 'In Progress', 'Job Done', 'Reviewed', 'Closed', 'Cancelled')),
  scheduled_at timestamptz,
  created_at timestamptz not null default now()
);

-- `scheduled_at` and the 'Cancelled' status value were added after this table
-- already existed on this project. Since `orders` already exists, the CREATE
-- TABLE above is a no-op — this ALTER is what actually adds the column here,
-- and it must run before the index below references it.
alter table orders add column if not exists scheduled_at timestamptz;

create index if not exists idx_orders_status on orders (status);
create index if not exists idx_orders_technician on orders (assigned_technician_id);
create index if not exists idx_orders_scheduled_at on orders (scheduled_at);

do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.orders'::regclass and contype = 'c'
  loop
    execute format('alter table orders drop constraint %I', con.conname);
  end loop;

  alter table orders add constraint orders_status_check
    check (status in ('New', 'Assigned', 'In Progress', 'Job Done', 'Reviewed', 'Closed', 'Cancelled'));
end $$;

-- Simple sequence-backed order number generator: ORDER1000, ORDER1001, ...
create sequence if not exists order_no_seq start 1000;

create or replace function next_order_no()
returns text
language sql
as $$
  select 'ORDER' || nextval('order_no_seq')::text;
$$;

-- ── service_completions ─────────────────────────────────────
create table if not exists service_completions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  work_done text not null,
  extra_charges numeric(10, 2) not null default 0,
  final_amount numeric(10, 2) not null default 0,
  remarks text,
  technician_name text not null,
  completed_at timestamptz not null default now(),
  payment_amount numeric(10, 2),
  payment_method text,
  receipt_photo_url text
);

-- `started_at` records when the technician tapped "Start Job" (tracked client-side via
-- localStorage so it survives a page reload), written on completion submit if
-- available. Added directly to this project's table before schema.sql tracked it.
alter table service_completions add column if not exists started_at timestamptz;

create index if not exists idx_completions_order on service_completions (order_id);

-- ── completion_attachments ──────────────────────────────────
create table if not exists completion_attachments (
  id uuid primary key default gen_random_uuid(),
  service_completion_id uuid not null references service_completions (id) on delete cascade,
  file_url text not null,
  file_type text not null
);

create index if not exists idx_attachments_completion on completion_attachments (service_completion_id);

-- ── audit_log ───────────────────────────────────────────────
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  action text not null,
  actor_role text not null,
  actor_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_order on audit_log (order_id);

-- ── order_reschedules ───────────────────────────────────────
-- One row per time Admin changes an already-scheduled order's `scheduled_at`
-- to a different value. This is what the KPI Dashboard's "Postpone /
-- Reschedule" column counts, instead of the placeholder "not tracked".
create table if not exists order_reschedules (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  previous_scheduled_at timestamptz,
  new_scheduled_at timestamptz,
  reason text,
  changed_by_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_reschedules_order on order_reschedules (order_id);

-- ── notifications ───────────────────────────────────────────
-- In-app notification inbox, one row per (recipient, event). There is no
-- server-side trigger writing these — the client inserts a row at the same
-- point it already writes an audit_log entry (order assigned, job completed,
-- reviewed, closed), addressed to a real auth.users.id. See src/lib/notifications.ts.
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  order_id uuid references orders (id) on delete cascade,
  title text not null,
  body text not null,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on notifications (user_id, read, created_at desc);

alter table notifications enable row level security;

drop policy if exists "notifications select" on notifications;
create policy "notifications select" on notifications for select
  using (user_id = auth.uid());

-- Insert is deliberately NOT "only insert your own row" — the entire point is
-- one user notifying a different one (e.g. a technician notifying every
-- manager on job completion). Same trust model already used for audit_log:
-- any signed-in user can write, and the app controls what's actually written.
drop policy if exists "notifications insert" on notifications;
create policy "notifications insert" on notifications for insert
  with check (auth.uid() is not null);

drop policy if exists "notifications update" on notifications;
create policy "notifications update" on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Broadcast INSERTs over Realtime so the notification bell updates live
-- without a page refresh. Realtime only ever broadcasts a row to a client
-- whose own RLS policies would let them SELECT it, so this is safe given the
-- policy above. Wrapped because Postgres errors (not no-ops) on re-adding a
-- table already in the publication, and this file is meant to be re-run.
do $$
begin
  alter publication supabase_realtime add table notifications;
exception
  when duplicate_object then null;
end $$;

-- ── profiles ────────────────────────────────────────────────
-- One row per real login, tells the app whether they're an
-- admin / technician / manager. Deliberately has NO insert/update
-- policy for regular users below — only a service-role action (dashboard
-- or scripts/seedUsers.mjs) can create or change a profile, so no logged-in
-- user can ever grant themselves a different role.
create table if not exists profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'technician', 'manager')),
  name text not null
);

-- Used to build the "Notify Manager via WhatsApp" deep link when a technician
-- completes a job (Module 2 bonus). Nullable — set via the dashboard/seed script.
alter table profiles add column if not exists phone text;

alter table profiles enable row level security;

drop policy if exists "read own profile" on profiles;
create policy "read own profile" on profiles for select using (auth.uid() = user_id);

-- Lets any signed-in user (in practice: a technician on the completion screen)
-- look up manager name/phone to build the WhatsApp notify link, without exposing
-- other technicians' or admins' profile rows.
drop policy if exists "read manager profiles" on profiles;
create policy "read manager profiles" on profiles for select using (role = 'manager');

-- Same reasoning, mirrored for admin: lets the in-app notification system
-- resolve "who is Admin" (e.g. when a Manager closes an order) without
-- exposing other technicians'/managers' profile rows.
drop policy if exists "read admin profiles" on profiles;
create policy "read admin profiles" on profiles for select using (role = 'admin');

-- ── Auth helper functions ───────────────────────────────────
-- Used inside RLS policies below. `stable` (not `security definer`): they
-- run under the calling user's own privileges, so the nested profiles/
-- technicians lookups are themselves subject to those tables' RLS policies
-- (which already allow a user to read their own profile/technician row).
create or replace function auth_role()
returns text
language sql stable
as $$
  select role from profiles where user_id = auth.uid();
$$;

create or replace function auth_technician_id()
returns uuid
language sql stable
as $$
  select id from technicians where user_id = auth.uid();
$$;

-- PostgREST calls these as the `anon`/`authenticated` roles. New functions
-- don't always inherit PUBLIC execute rights on Supabase, so grant
-- explicitly — otherwise every policy that calls them fails silently
-- with "permission denied for function" instead of just denying rows.
grant execute on function auth_role() to anon, authenticated;
grant execute on function auth_technician_id() to anon, authenticated;

-- ── Row Level Security ──────────────────────────────────────
alter table technicians enable row level security;
alter table orders enable row level security;
alter table service_completions enable row level security;
alter table completion_attachments enable row level security;
alter table audit_log enable row level security;
alter table order_reschedules enable row level security;

-- technicians: readable by anyone signed in (Admin needs the full list to
-- populate the assign-technician dropdown). Writes (adding/editing a
-- technician profile row, deactivating) are admin-only.
drop policy if exists "public read technicians" on technicians;
drop policy if exists "read technicians" on technicians;
create policy "read technicians" on technicians for select using (true);

drop policy if exists "technicians insert" on technicians;
create policy "technicians insert" on technicians for insert
  with check (auth_role() = 'admin');

drop policy if exists "technicians update" on technicians;
create policy "technicians update" on technicians for update
  using (auth_role() = 'admin')
  with check (auth_role() = 'admin');

-- orders: admin/manager see and manage everything; a technician only sees
-- and updates orders assigned to them. Only admin can create new orders.
drop policy if exists "public all orders" on orders;

drop policy if exists "orders select" on orders;
create policy "orders select" on orders for select
  using (auth_role() in ('admin', 'manager') or assigned_technician_id = auth_technician_id());

drop policy if exists "orders insert" on orders;
create policy "orders insert" on orders for insert
  with check (auth_role() = 'admin');

drop policy if exists "orders update" on orders;
create policy "orders update" on orders for update
  using (auth_role() in ('admin', 'manager') or assigned_technician_id = auth_technician_id())
  with check (auth_role() in ('admin', 'manager') or assigned_technician_id = auth_technician_id());

-- service_completions: admin/manager see everything; a technician can only
-- insert/see completions for orders assigned to them.
drop policy if exists "public all service_completions" on service_completions;

drop policy if exists "service_completions select" on service_completions;
create policy "service_completions select" on service_completions for select
  using (
    auth_role() in ('admin', 'manager')
    or exists (
      select 1 from orders o
      where o.id = service_completions.order_id
        and o.assigned_technician_id = auth_technician_id()
    )
  );

drop policy if exists "service_completions insert" on service_completions;
create policy "service_completions insert" on service_completions for insert
  with check (
    exists (
      select 1 from orders o
      where o.id = service_completions.order_id
        and o.assigned_technician_id = auth_technician_id()
    )
  );

-- Lets a technician resume/correct their own completion (e.g. re-attempting after
-- a dropped connection mid-submit in the field) rather than only ever inserting.
drop policy if exists "service_completions update" on service_completions;
create policy "service_completions update" on service_completions for update
  using (
    exists (
      select 1 from orders o
      where o.id = service_completions.order_id
        and o.assigned_technician_id = auth_technician_id()
    )
  )
  with check (
    exists (
      select 1 from orders o
      where o.id = service_completions.order_id
        and o.assigned_technician_id = auth_technician_id()
    )
  );

-- completion_attachments: same ownership rule, via service_completions -> orders.
drop policy if exists "public all completion_attachments" on completion_attachments;

drop policy if exists "completion_attachments select" on completion_attachments;
create policy "completion_attachments select" on completion_attachments for select
  using (
    auth_role() in ('admin', 'manager')
    or exists (
      select 1 from service_completions sc
      join orders o on o.id = sc.order_id
      where sc.id = completion_attachments.service_completion_id
        and o.assigned_technician_id = auth_technician_id()
    )
  );

drop policy if exists "completion_attachments insert" on completion_attachments;
create policy "completion_attachments insert" on completion_attachments for insert
  with check (
    exists (
      select 1 from service_completions sc
      join orders o on o.id = sc.order_id
      where sc.id = completion_attachments.service_completion_id
        and o.assigned_technician_id = auth_technician_id()
    )
  );

-- audit_log: any signed-in role can write an entry (the app controls what
-- gets logged); only admin/manager can read the trail back.
drop policy if exists "public all audit_log" on audit_log;

drop policy if exists "audit_log select" on audit_log;
create policy "audit_log select" on audit_log for select
  using (auth_role() in ('admin', 'manager'));

drop policy if exists "audit_log insert" on audit_log;
create policy "audit_log insert" on audit_log for insert
  with check (auth.uid() is not null);

-- order_reschedules: same visibility rule as service_completions (admin/
-- manager see everything, a technician sees their own orders' history);
-- only admin can write one (rescheduling is an admin action).
drop policy if exists "order_reschedules select" on order_reschedules;
create policy "order_reschedules select" on order_reschedules for select
  using (
    auth_role() in ('admin', 'manager')
    or exists (
      select 1 from orders o
      where o.id = order_reschedules.order_id
        and o.assigned_technician_id = auth_technician_id()
    )
  );

drop policy if exists "order_reschedules insert" on order_reschedules;
create policy "order_reschedules insert" on order_reschedules for insert
  with check (auth_role() = 'admin');

-- ── Storage bucket for job attachments ──────────────────────
insert into storage.buckets (id, name, public)
values ('job-attachments', 'job-attachments', true)
on conflict (id) do nothing;

-- Bucket is still marked "public" (simplest for the <img>/<a> links the app
-- renders), but read/write through the API now requires a real signed-in
-- session rather than being open to anonymous requests.
drop policy if exists "public read job-attachments" on storage.objects;
drop policy if exists "auth read job-attachments" on storage.objects;
create policy "auth read job-attachments"
  on storage.objects for select
  using (bucket_id = 'job-attachments' and auth.uid() is not null);

drop policy if exists "public upload job-attachments" on storage.objects;
drop policy if exists "auth upload job-attachments" on storage.objects;
create policy "auth upload job-attachments"
  on storage.objects for insert
  with check (bucket_id = 'job-attachments' and auth.uid() is not null);
