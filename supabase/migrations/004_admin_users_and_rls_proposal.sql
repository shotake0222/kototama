-- ============================================================================
-- 【提案】Phase 0: 管理者テーブルの新設とRLS（行レベルセキュリティ）ポリシー案
-- ============================================================================
-- このファイルは自動適用しません。内容を確認し、必要に応じて調整してから
-- Supabaseダッシュボードで実行してください（可能ならステージング環境で先に検証）。
--
-- 背景:
-- 管理画面（/admin配下）・OEMポータル（/oem）はどちらもブラウザからSupabaseの
-- anonキーを使って直接テーブルを読み書きしている。今はSupabase Authでログイン
-- できるユーザーが「運営の管理者」しかいないため実害が出ていないが、Phase 1で
-- エンドユーザー向けCMSにもSupabase Authでのログインを導入すると、
-- 「ログイン済みなら誰でも管理者と同等」という前提が崩れる。そのため、
-- 「本当に運営の管理者であるユーザー」を明示的に区別する admin_users テーブルを
-- 新設し、各テーブルのRLSポリシーをそれに基づいて設計する。
--
-- 権限モデル:
--   - service_role（サーバー側のAPI Routeが使うService Role Key）は常に全権限
--     （RLSの対象外）。/api/embed-order, /api/order, /api/send-mail, /api/oem-accounts
--     はすべてこのキーを使う想定。
--   - admin_users に登録されたユーザー = 運営の管理者。全テーブルを読み書き可能。
--   - client_members に登録されたユーザー = OEM提供先の担当者。自分の client_id の
--     行だけを読み書き可能（clients / client_settings / client_form_config /
--     mail_templatesのクライアント別上書き行）。
--   - 匿名（anon）は、公開フォームやARビューアが実際に必要とする範囲だけ許可。

-- ----------------------------------------------------------------------------
-- 0. 管理者テーブル
-- ----------------------------------------------------------------------------
create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table admin_users enable row level security;
-- admin_usersテーブル自体は誰も直接read/writeできないようにする
-- （Service Role Keyで運用側が手動 or /api/oem-accounts 経由でのみ操作する）。
-- ポリシーを一切作らないことで、anon/authenticatedロールからは完全に不可視になる。

-- ▼▼▼ 適用後に必ず実行してください ▼▼▼
-- 現在 /admin にログインしている運営アカウントのuser_idをここに入れて、
-- 自分自身を管理者として登録してください（Supabase Auth > Users 画面でuser_idを確認できます）。
-- insert into admin_users (user_id) values ('ここに管理者のuser_idを入れる');

-- ----------------------------------------------------------------------------
-- 1. ヘルパー関数（ポリシーの記述を簡潔にするため）
-- ----------------------------------------------------------------------------
create or replace function is_admin() returns boolean
language sql security definer stable as $$
  select exists (select 1 from admin_users where user_id = auth.uid());
$$;

create or replace function my_client_id() returns text
language sql security definer stable as $$
  select client_id from client_members where user_id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- 2. orders / order_images
-- ----------------------------------------------------------------------------
-- 注意: /ar/page.tsx は現状、匿名（anon）キーのブラウザクライアントで
-- orders テーブルを hash_id / nfc_uid で直接検索し、customer_name・email・
-- total_priceなど個人情報を含む全カラムを取得している。RLSで匿名read自体を
-- 許可しないとARビューアが壊れるが、単純に「匿名は全件read可」にすると
-- 個人情報が一括取得できてしまう。
--
-- 正しい直し方は、ARビューア専用の「安全な列だけを見せるVIEW」を作り、
-- /ar/page.tsx側もそのVIEWを見るように変更すること（下記コメントのVIEW定義例を参照）。
-- これは /ar/page.tsx のコード変更を伴うため、今回のPhase 0では提案に留め、
-- 実際に適用する際は先にそちらのコード修正を依頼してください。
--
-- 以下は「まずは管理者とService Roleだけに絞る」最小限のポリシー。
-- これを有効化すると /ar ビューアの匿名アクセスは止まる点に注意（VIEW方式に
-- 切り替えるまでの暫定として、絞りすぎないよう調整してください）。

alter table orders enable row level security;
alter table order_images enable row level security;

create policy "orders_admin_all" on orders for all
  using (is_admin()) with check (is_admin());

create policy "order_images_admin_all" on order_images for all
  using (is_admin()) with check (is_admin());

-- 参考: ARビューア用の安全なVIEW例（列を絞ることでPIIを露出させない）。
-- 実際に使う場合は /ar/page.tsx のクエリ対象をこのVIEWに変更してください。
--
-- create view public_ar_view as
--   select o.hash_id, o.nfc_uid, o.ar_mode, o.target_image_url, o.mind_file_url,
--          o.object_scale, o.animation_type,
--          oi.id as image_id, oi.original_image_url, oi.processed_image_url
--   from orders o
--   left join order_images oi on oi.order_id = o.id;
-- grant select on public_ar_view to anon;

-- ----------------------------------------------------------------------------
-- 3. system_settings（グローバル設定）
-- ----------------------------------------------------------------------------
-- PRICE_*/PRODUCT_* は埋め込みフォームが匿名で読む必要がある一方、
-- BANK_* など機密情報は匿名readから除外したい。RLSは列単位の制御が
-- できないため、匿名からの直接テーブルアクセスはさせず、代わりに
-- Phase 0で修正済みの /api/settings （PRICE_/PRODUCT_のみ返す）経由でのみ
-- 公開する方針にする。

alter table system_settings enable row level security;

create policy "system_settings_admin_all" on system_settings for all
  using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- 4. clients / client_settings / client_form_config / client_members
-- ----------------------------------------------------------------------------
alter table clients enable row level security;
alter table client_settings enable row level security;
alter table client_form_config enable row level security;
alter table client_members enable row level security;

create policy "clients_admin_all" on clients for all
  using (is_admin()) with check (is_admin());
create policy "clients_member_select" on clients for select
  using (client_id = my_client_id());
create policy "clients_member_update_own" on clients for update
  using (client_id = my_client_id())
  with check (client_id = my_client_id());

-- OrderForm.tsx / embed.js は clients / client_form_config / client_settings を
-- 匿名で「参照専用」で読む必要がある（注文フォームの表示設定・料金上書きのため）。
-- ステータスがactiveなクライアントの設定のみを公開する。
create policy "clients_public_select_active" on clients for select
  using (status = 'active');

create policy "client_settings_admin_all" on client_settings for all
  using (is_admin()) with check (is_admin());
create policy "client_settings_member_all_own" on client_settings for all
  using (client_id = my_client_id()) with check (client_id = my_client_id());
create policy "client_settings_public_select" on client_settings for select
  using (true);

create policy "client_form_config_admin_all" on client_form_config for all
  using (is_admin()) with check (is_admin());
create policy "client_form_config_member_all_own" on client_form_config for all
  using (client_id = my_client_id()) with check (client_id = my_client_id());
create policy "client_form_config_public_select" on client_form_config for select
  using (true);

-- client_members自体は本人と管理者のみ参照可能（他のOEM提供先のuser_idを見せない）
create policy "client_members_admin_all" on client_members for all
  using (is_admin()) with check (is_admin());
create policy "client_members_self_select" on client_members for select
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 5. mail_templates
-- ----------------------------------------------------------------------------
alter table mail_templates enable row level security;

create policy "mail_templates_admin_all" on mail_templates for all
  using (is_admin()) with check (is_admin());
create policy "mail_templates_member_all_own" on mail_templates for all
  using (client_id = my_client_id()) with check (client_id = my_client_id());
-- client_id が null（共通テンプレート）の行は、参照だけは誰でもできてよい
-- （メール本文には機密情報を書かない前提。差し込み変数の説明文レベル）。
create policy "mail_templates_public_select_global" on mail_templates for select
  using (client_id is null);
