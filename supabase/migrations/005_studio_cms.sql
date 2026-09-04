-- Phase 1: ユーザー基準CMS（/studio）のためのスキーマ新設。
-- 既存テーブル（orders / order_images / system_settings / clients / ...）は
-- 一切変更しない。新規テーブルのみを追加する。

create table if not exists ar_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  hash_id text unique not null,
  title text,
  status text not null default 'draft',              -- draft / published / archived
  moderation_status text not null default 'pending',  -- pending / approved / rejected
  ar_mode text not null default 'mindar',             -- mindar / hiro
  target_image_path text,
  mind_file_path text,
  object_scale numeric not null default 1.0,
  animation_type text not null default 'none',
  view_count int not null default 0,
  -- 将来、物理商品（orders）にこのCMSで作ったARを紐付ける可能性のための予約列。
  -- 今回のスコープでは常にNULLで、ordersテーブル側は一切変更しない。
  linked_order_id uuid references orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ar_items_owner_id on ar_items (owner_id);
create index if not exists idx_ar_items_hash_id on ar_items (hash_id);
create index if not exists idx_ar_items_moderation on ar_items (status, moderation_status);

create table if not exists ar_item_assets (
  id uuid primary key default gen_random_uuid(),
  ar_item_id uuid not null references ar_items(id) on delete cascade,
  asset_type text not null default 'image', -- image / video / model（video/modelはPhase 2以降で使用）
  storage_path text not null,
  sort_order int not null default 0,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_ar_item_assets_item_id on ar_item_assets (ar_item_id);

create table if not exists ar_item_moderation_log (
  id uuid primary key default gen_random_uuid(),
  ar_item_id uuid not null references ar_items(id) on delete cascade,
  action text not null, -- submitted / approved / rejected
  reviewer_id uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- ストレージバケット（ユーザーアップロード専用。既存のar_imagesとは分離）
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('user_ar_assets', 'user_ar_assets', false)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- RLS（本番適用は各自の判断で。004番のRLS提案と同様、まず内容を確認してください）
-- ----------------------------------------------------------------------------
-- 004_admin_users_and_rls_proposal.sql の is_admin() 関数を使う。
-- 未適用の場合はこのブロックより前に004番を先に適用してください。

alter table ar_items enable row level security;
alter table ar_item_assets enable row level security;
alter table ar_item_moderation_log enable row level security;

-- 本人は自分のar_itemsを全操作可能
create policy "ar_items_owner_all" on ar_items for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 公開済み・承認済みの行は誰でも参照可能（/v/[hash] ビューア用）
create policy "ar_items_public_select_published" on ar_items for select
  using (status = 'published' and moderation_status = 'approved');

-- 管理者は全操作可能（モデレーション用）
create policy "ar_items_admin_all" on ar_items for all
  using (is_admin()) with check (is_admin());

create policy "ar_item_assets_owner_all" on ar_item_assets for all
  using (exists (select 1 from ar_items i where i.id = ar_item_assets.ar_item_id and i.owner_id = auth.uid()))
  with check (exists (select 1 from ar_items i where i.id = ar_item_assets.ar_item_id and i.owner_id = auth.uid()));

create policy "ar_item_assets_public_select_published" on ar_item_assets for select
  using (exists (
    select 1 from ar_items i
    where i.id = ar_item_assets.ar_item_id
      and i.status = 'published' and i.moderation_status = 'approved'
  ));

create policy "ar_item_assets_admin_all" on ar_item_assets for all
  using (is_admin()) with check (is_admin());

create policy "ar_item_moderation_log_admin_all" on ar_item_moderation_log for all
  using (is_admin()) with check (is_admin());
create policy "ar_item_moderation_log_owner_select" on ar_item_moderation_log for select
  using (exists (select 1 from ar_items i where i.id = ar_item_moderation_log.ar_item_id and i.owner_id = auth.uid()));

-- storage.objects 側のポリシー（user_ar_assetsバケットのみ対象）。
-- 実際のパス構成は user_ar_assets/{owner_id}/{hash_id}/{ファイル名} （1番目=所有者のuser_id、
-- 2番目=ar_items.hash_id）。owner_idはUUID形式で一致するため、このポリシーはキャスト不要。
create policy "user_ar_assets_owner_all" on storage.objects for all
  using (bucket_id = 'user_ar_assets' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'user_ar_assets' and (storage.foldername(name))[1] = auth.uid()::text);

-- バケット自体はpublic=falseだが、公開・承認済みのar_itemに属するファイルだけは
-- 誰でも参照できるようにする（/v/[hash] ビューアが画像を表示するため）。
--
-- 🐛 バグ修正（デバッグフェーズ）: このコメント・当初のポリシーは
-- パス構成を user_ar_assets/{owner_id}/{ar_item_id}/{asset_id}.{ext}
-- （2番目のフォルダ名 = ar_items.id のUUID）と想定して
-- ((storage.foldername(name))[2])::uuid でキャストしていたが、
-- 実際の src/app/studio/new/page.tsx の実装は
-- `${user.id}/${hashId}/target.ext` のように、2番目のフォルダ名として
-- ar_items.hash_id（uuidv4を16文字に切り詰めたハイフン無し文字列。
-- 正規のUUID形式ではない）を使っている。そのため元のポリシーのまま
-- RLSを有効化すると、匿名ユーザーが/v/[hash]を開くたびにこのポリシーの
-- 評価で「invalid input syntax for type uuid」エラーが発生し、
-- 公開ARの署名付きURL取得が常に失敗する（=公開ビューアが機能しない）
-- 致命的な不具合だった。hash_id は text 型なのでキャストせずに
-- 直接比較する。
create policy "user_ar_assets_public_select_published" on storage.objects for select
  using (
    bucket_id = 'user_ar_assets'
    and exists (
      select 1 from ar_items i
      where i.hash_id = (storage.foldername(name))[2]
        and i.status = 'published' and i.moderation_status = 'approved'
    )
  );

-- 管理者はモデレーションのため、審査待ち（pending）の画像も含めて全件参照できる必要がある。
create policy "user_ar_assets_admin_select" on storage.objects for select
  using (bucket_id = 'user_ar_assets' and is_admin());
