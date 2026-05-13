-- assignments テーブルに授業名カラムを追加
-- schema.sql を初回実行済みの場合、このファイルだけを SQL Editor で実行してください

alter table public.assignments
  add column if not exists course_name text;
