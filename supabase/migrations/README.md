# supabase/migrations について（Phase 0で追加）

これまでこのリポジトリにはSupabaseのスキーマがコードとして一切バージョン管理されておらず、
実体はSupabaseダッシュボード側にのみ存在していた（`admin/dashboard/page.tsx` のコメントに
`002_oem_portal_and_mail.sql` `003_mail_templates_client_override.sql` という名前が
出てくるが、そのファイル自体はリポジトリのどこにも存在しなかった）。

ここに置いたSQLファイルは、**実際のDBに接続して生成したダンプではなく**、アプリケーション
コード（`supabase.from(...)`の呼び出し箇所）から逆算して再構成したものです。したがって：

- 列名・型・デフォルト値は「コードが期待している形」を反映しているが、実際のテーブルと
  完全に一致している保証はない。
- すべて `create table if not exists` / `add column if not exists` を使っており、
  既にテーブルや列が存在する場合は何も起きない（安全に実行できる）ように書いてある。
- **本番のSupabaseに適用する前に、必ずSupabaseダッシュボードの Table Editor / SQL Editor で
  実際のスキーマと見比べてから実行してください。** 特に `004_admin_users_and_rls_proposal.sql`
  はRLS（行レベルセキュリティ）を有効化する提案なので、適用前に必ず内容を確認し、
  可能であれば本番ではなくステージング環境で先に試すことを強く推奨します。

## ファイル一覧

- `001_baseline_core_schema.sql`: 物理商品の注文フロー（orders / order_images / system_settings）の推定スキーマ。
- `002_oem_portal_and_mail.sql`: OEM提供先まわり（clients / client_settings / client_form_config / client_members）と mail_templates の推定スキーマ。
- `003_mail_templates_client_override.sql`: mail_templates に client_id 列を追加する変更（コード中のコメントで既に適用済みとされているものを再構成）。
- `004_admin_users_and_rls_proposal.sql`: 【提案】管理者を判定する `admin_users` テーブルの新設と、既存テーブルへのRLSポリシー提案。**これは提案であり、内容を確認してから適用してください。**

## 今後の運用

新しくテーブルを追加・変更する際は、Supabaseダッシュボードで直接変更するだけでなく、
同じ内容をこの `supabase/migrations/` に連番のSQLファイルとして追加し、コードと一緒に
コミットしてください。これにより、次に別の担当者やAIが構成を確認する際に、DBへ直接
接続しなくてもコードから正確な前提を把握できるようになります。
