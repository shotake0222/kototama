-- Phase 0: OEM提供先まわりのスキーマ推定復元（コードからの逆算。
-- supabase/migrations/README.md を参照）。
-- admin/dashboard/page.tsx のコメントで「002_oem_portal_and_mail.sql を適用済み」と
-- 参照されているファイル名に合わせている。

create table if not exists clients (
  client_id text primary key,
  name text not null,
  contact_email text,
  status text not null default 'active',
  welcome_message text,
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists client_settings (
  client_id text not null references clients(client_id) on delete cascade,
  key text not null,
  name text,
  value text,
  primary key (client_id, key)
);

create table if not exists client_form_config (
  client_id text primary key references clients(client_id) on delete cascade,
  show_charm_option boolean not null default true,
  show_key_ring_option boolean not null default true,
  require_phone boolean not null default false,
  allow_own_marker_upload boolean not null default true,
  use_default_marker boolean not null default false,
  default_marker_target_url text,
  default_marker_mind_url text,
  default_animation_type text not null default 'none',
  custom_note text
);

-- OEMポータル（/oem）にログインできるユーザーと、どのOEM提供先に属するかの対応表。
-- 1ユーザー = 1提供先を想定（user_idを主キーにしている）。
create table if not exists client_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  client_id text not null references clients(client_id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_members_client_id on client_members (client_id);

create table if not exists mail_templates (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null,
  subject text,
  body_content text,
  created_at timestamptz not null default now()
);
