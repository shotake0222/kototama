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

## 適用方法（実際の手順）

**前提**: 001〜004番は `fix/security-and-oem-portal` ブランチに、005〜007番は
`feature/studio-cms` ブランチにあります（まだ `main` にマージされていないため）。
両方のブランチから該当ファイルを集めてから、以下の手順で進めてください。

1. Supabaseダッシュボード → 左メニューの「SQL Editor」を開く。
2. **001 → 002 → 003 → 004 → 005 → 006 → 007 の順番で**、1ファイルずつ中身を
   貼り付けて実行する。この順序は重要（005番のRLSポリシーは004番で作成する
   `is_admin()` 関数に依存しているため、004番より先に005番を実行するとエラーになる）。
3. **004番を実行した直後に、必ず自分自身を管理者として登録する。** Supabase
   ダッシュボードの「Authentication → Users」で、普段 `/admin` にログインしている
   アカウントのUUID（User UID列）をコピーし、SQL Editorで以下を実行する。

   ```sql
   insert into admin_users (user_id) values ('コピーしたUUID');
   ```

   これを忘れると、004・005番でRLSが有効化された瞬間に管理画面自体が
   閲覧・操作できなくなる（admin_usersに登録されたユーザーだけがadmin_all系
   ポリシーを通過できるため）。
4. 004・005番はRLS（行レベルセキュリティ）を新たに有効化する変更のため、
   可能であれば先にステージング環境で試すか、難しければ利用者の少ない
   時間帯に適用し、直後に管理画面・OEMポータル（/oem）・スタジオCMS
   （/studio, /v/[hash]）の主要な画面を一通り触って確認することを
   強く推奨する。

## 今後の運用

新しくテーブルを追加・変更する際は、Supabaseダッシュボードで直接変更するだけでなく、
同じ内容をこの `supabase/migrations/` に連番のSQLファイルとして追加し、コードと一緒に
コミットしてください。これにより、次に別の担当者やAIが構成を確認する際に、DBへ直接
接続しなくてもコードから正確な前提を把握できるようになります。
