# Supabase Auth のメール送信を独自SMTPに切り替える手順

## なぜ必要か

`/studio` のログインはSupabase Authのマジックリンク（`signInWithOtp`）を使っています。
Supabaseには「テスト用」の組み込みメール送信機能がありますが、これには次の制限があります
（[公式ドキュメント](https://supabase.com/docs/guides/auth/auth-smtp)より）。

- 送信数が **1時間あたり2通** に制限されている。
- 送信先が **組織にあらかじめ登録されたメンバーのアドレスに限られる**（＝一般の利用者には
  そもそもメールが届かない可能性が高い）。
- 配信のSLA保証がない。

つまり、`/studio` を外部の利用者に開放する場合、独自SMTPを設定しないと
**そもそもログインメールが届かず、サインアップできない**状態になり得ます。
これはSupabaseダッシュボード側の設定であり、コードの変更では対応できません。

## 手順

1. Supabaseダッシュボード → 対象プロジェクト → 左メニュー「Authentication」→
   「SMTP Settings」を開く（直接URL: `https://supabase.com/dashboard/project/<プロジェクトref>/auth/smtp`）。
2. 「Enable Custom SMTP」をONにする。
3. 以下を入力する。
   - **Sender email**: 送信元アドレス（例: `no-reply@kototama-ar.com`）。既存の注文メールで
     使っている `SMTP_USER`（Xserverのメールアドレス）と同じものを使い回すこともできますが、
     送信量が増えるとXserver側のレート制限を注文メールと取り合う形になるため、
     可能であれば別のメールアドレス（例: `studio@kototama-ar.com`）を新規に用意することを推奨します。
   - **Sender name**: 「ことたまスタジオ」など、利用者に表示したい名前。
   - **Host**: SMTPサーバーのホスト名（Xserverの場合、注文メールで使っているものと同じ
     `sv***.xserver.jp` 形式）。
   - **Port**: `587`（Supabaseの推奨。465でSMTPS運用しているXserverのメールアカウントの
     場合は465でも動作しますが、まずは587を試し、失敗する場合は465に変更してください）。
   - **Username** / **Password**: そのメールアカウントのログイン情報。
4. 保存後、左メニュー「Authentication」→「Rate Limits」を開き、
   「Rate limit for sending emails」を確認する。独自SMTP設定直後はデフォルトで
   **1時間あたり30通**に制限されているため、想定する利用者数に応じて引き上げてください。
5. 可能であれば、送信元ドメインにSPF / DKIM / DMARCを設定してください（Xserverのメールを
   既に運用しているなら、SPFレコードは概ね設定済みのはずですが、念のため確認を推奨します）。
   設定していないと、マジックリンクメールが利用者側で迷惑メール判定されるリスクが高まります。
6. `/studio/login` から実際にログインを試し、メールが届くか確認してください。

## 参考

- [Send emails with custom SMTP – Supabase Docs](https://supabase.com/docs/guides/auth/auth-smtp)
