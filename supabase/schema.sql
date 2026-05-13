-- =============================================
-- KU-KMS+ Database Schema
-- =============================================

create extension if not exists "uuid-ossp";

-- =============================================
-- assignments テーブル
-- =============================================
create table if not exists public.assignments (
  id                   uuid        primary key default uuid_generate_v4(),
  user_id              uuid        not null references auth.users(id) on delete cascade,
  course_id            text        not null,
  title                text        not null,
  category             text        not null default '',
  deadline             timestamptz,
  detail_url           text        not null default '',
  is_submitted_lms     boolean     not null default false,
  is_completed_manual  boolean     not null default false,
  is_hidden            boolean     not null default false,
  updated_at           timestamptz not null default now(),
  created_at           timestamptz not null default now(),

  -- スクレイパーからの重複登録を防ぐユニーク制約
  constraint assignments_user_course_title_key unique (user_id, course_id, title)
);

-- =============================================
-- Row Level Security
-- =============================================
alter table public.assignments enable row level security;

create policy "select own assignments"
  on public.assignments for select
  using (auth.uid() = user_id);

create policy "insert own assignments"
  on public.assignments for insert
  with check (auth.uid() = user_id);

create policy "update own assignments"
  on public.assignments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own assignments"
  on public.assignments for delete
  using (auth.uid() = user_id);

-- =============================================
-- インデックス
-- =============================================
create index if not exists assignments_user_deadline_idx
  on public.assignments (user_id, deadline asc nulls last);

create index if not exists assignments_user_hidden_completed_idx
  on public.assignments (user_id, is_hidden, is_completed_manual);

-- =============================================
-- updated_at 自動更新トリガー
-- =============================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger assignments_set_updated_at
  before update on public.assignments
  for each row
  execute function public.set_updated_at();
