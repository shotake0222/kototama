-- Phase 0: mail_templates への client_id 列追加（コードからの逆算復元）。
-- admin/dashboard/page.tsx・OemPortal.tsx・api/send-mail/route.ts が、
-- trigger_type='thanks' かつ client_id が一致する行をOEM提供先専用テンプレートとして、
-- client_id が null の行を共通テンプレートとして扱っている。

alter table mail_templates add column if not exists client_id text references clients(client_id) on delete cascade;

-- 同じ trigger_type + client_id の組み合わせが重複しないようにする
-- （client_idがnullの行同士がユニーク制約で衝突しないよう、部分インデックスにしている）
create unique index if not exists idx_mail_templates_trigger_client
  on mail_templates (trigger_type, client_id)
  where client_id is not null;

create unique index if not exists idx_mail_templates_trigger_global
  on mail_templates (trigger_type)
  where client_id is null;
