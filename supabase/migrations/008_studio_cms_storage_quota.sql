-- SaaS展開の準備: 1アカウントあたりの合計アップロード容量にも上限を設ける。
--
-- 007番migrationは「件数」の上限（デフォルト5件）のみで、動画1本あたり最大50MB
-- （006番migrationのbucket file_size_limit）を5件アップロードすると、実質250MB
-- まで消費できてしまい、ストレージコストが青天井になる問題があった。
--
-- storage.objects.metadata->>'size' は、Supabase Storageが実際にアップロードされた
-- バイト数を記録する列で、クライアント側から偽装できない（アプリのコードが送る値
-- ではなく、ストレージサービス自身が書き込む値）ため、ここを合計する。
--
-- ※ studio/new/page.tsx の実装は「先にファイルをアップロードしてからar_itemsに
-- insertする」順序のため、このトリガーが発火する時点で新規アップロード分も
-- 既に容量に含まれた状態で判定される。トリガーがinsertを拒否した場合、
-- アップロード済みファイルが孤児として残らないよう、studio/new/page.tsx側で
-- 失敗時にストレージから削除する処理を追加している。

create or replace function enforce_ar_items_storage_quota() returns trigger
language plpgsql as $$
declare
  total_bytes bigint;
  max_bytes constant bigint := 200 * 1024 * 1024; -- 200MB（運用しながら調整してください）
begin
  select coalesce(sum((metadata->>'size')::bigint), 0) into total_bytes
  from storage.objects
  where bucket_id = 'user_ar_assets'
    and (storage.foldername(name))[1] = new.owner_id::text;

  if total_bytes > max_bytes then
    raise exception 'ar_items_storage_quota_exceeded: このアカウントの合計アップロード容量が上限（%MB）を超えています。不要なARを削除してから再度お試しください。', (max_bytes / 1024 / 1024);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_ar_items_storage_quota on ar_items;
create trigger trg_enforce_ar_items_storage_quota
  before insert on ar_items
  for each row execute function enforce_ar_items_storage_quota();
