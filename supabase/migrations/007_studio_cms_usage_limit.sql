-- Phase 4相当: 1アカウントあたりの作成数に上限を設ける（無制限アップロードによる
-- 濫用・ストレージコスト増を防ぐ）。クライアント側のチェックだけでは
-- APIを直接叩かれた場合に迂回できてしまうため、DB側のトリガーで確実に強制する。
--
-- 上限値はいったん5件に設定。運用しながら調整してください
-- （変更する場合はこの関数内の定数を書き換えて再実行するだけでよい）。

create or replace function enforce_ar_items_limit() returns trigger
language plpgsql as $$
declare
  current_count int;
  max_items constant int := 5;
begin
  select count(*) into current_count
  from ar_items
  where owner_id = new.owner_id and status != 'archived';

  if current_count >= max_items then
    raise exception 'ar_items_limit_exceeded: このアカウントで作成できるARの上限（%件）に達しています。', max_items;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_ar_items_limit on ar_items;
create trigger trg_enforce_ar_items_limit
  before insert on ar_items
  for each row execute function enforce_ar_items_limit();
