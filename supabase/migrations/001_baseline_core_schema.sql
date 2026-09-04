-- Phase 0: 既存スキーマの推定復元（コードからの逆算。実DBのダンプではありません。
-- supabase/migrations/README.md を参照）。
--
-- orders / order_images / system_settings は、物理商品の注文フロー全体が依存する
-- 最も基本的なテーブル。すべて IF NOT EXISTS で安全に実行できるようにしてある。

create table if not exists system_settings (
  key text primary key,
  name text,
  value text
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  hash_id text unique,
  nfc_uid text,
  customer_name text,
  email text,
  phone text,
  total_price integer default 0,
  status text default 'pending',
  client_id text,
  option_details text,
  animation_type text default 'none',
  object_scale numeric default 1.0,
  ar_mode text default 'hiro',
  target_image_url text,
  mind_file_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_hash_id on orders (hash_id);
create index if not exists idx_orders_nfc_uid on orders (nfc_uid);
create index if not exists idx_orders_client_id on orders (client_id);

create table if not exists order_images (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  original_image_url text,
  processed_image_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_images_order_id on order_images (order_id);

-- 参考: 過去にOrderForm.tsx（自社サイトのメイン注文フォーム）が
-- 誤って "image_url" という列名で書き込んでいた形跡があります（Phase 0のコード修正で
-- processed_image_url / original_image_url に統一済み）。もし実際の order_images に
-- image_url 列が存在し、そこにしかデータが入っていない古い注文がある場合は、
-- 以下のような一度きりのバックフィルSQLで移行できます（実行前に必ずバックアップし、
-- 対象件数を select で確認してから実行してください）。
--
-- update order_images
--   set processed_image_url = image_url, original_image_url = image_url
--   where image_url is not null and processed_image_url is null;
