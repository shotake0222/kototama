import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 変更点: RLSをOEM関連テーブル（clients / client_settings / client_form_config /
// mail_templates）に導入していく前提のため、匿名キーではなく Service Role Key を
// 使うように変更しています。Service Role は RLS を無視して全テーブルを読み書き
// できるため、サーバー側（この Route Handler の中）でのみ使用してください。
// .env に SUPABASE_SERVICE_ROLE_KEY を追加し、NEXT_PUBLIC_ を付けないよう
// 注意してください（ブラウザに漏れると誰でも全データを読み書きできます）。
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { orderId } = await request.json();

    // サイトのベースURLを取得（メールへのリンク用）
    const origin = request.headers.get('origin') || 'https://kototama.vercel.app';

    // 1. 注文情報の取得
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
    if (orderError || !order) throw new Error('Order not found');

    // 2. システム設定の取得（置換用）
    const { data: settingsData } = await supabase.from('system_settings').select('key, value');
    const settings = settingsData?.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>) || {};

    // 2.5 このOEM提供先の名称（プレースホルダー用。提供先が無ければ空文字）
    let clientName = '';
    if (order.client_id) {
      const { data: clientRow } = await supabase
        .from('clients')
        .select('name')
        .eq('client_id', order.client_id)
        .maybeSingle();
      clientName = clientRow?.name || '';
    }

    // 3. 【お客様向け】サンクスメール生成
    // ==========================================
    // ▼▼▼ OEM対応: 注文がどのOEM提供先経由かに応じてテンプレートを切り替える ▼▼▼
    // mail_templates に client_id 列（003_mail_templates_client_override.sql で追加）
    // があれば、まずそのOEM提供先専用のテンプレート（trigger_type='thanks' かつ
    // client_id が一致する行）を探し、無ければ従来通り共通テンプレート
    // （client_id が NULL の行）にフォールバックします。
    let mailTemplate: any = null;
    if (order.client_id) {
      const { data: clientTemplate } = await supabase
        .from('mail_templates')
        .select('*')
        .eq('trigger_type', 'thanks')
        .eq('client_id', order.client_id)
        .maybeSingle();
      mailTemplate = clientTemplate;
    }
    if (!mailTemplate) {
      const { data: globalTemplate } = await supabase
        .from('mail_templates')
        .select('*')
        .eq('trigger_type', 'thanks')
        .is('client_id', null)
        .maybeSingle();
      mailTemplate = globalTemplate;
    }
    // ==========================================
    // ▲▲▲ 追記ここまで（以降は元の実装と同じ置換ロジック）▲▲▲
    // ==========================================

    let customerBody = mailTemplate ? mailTemplate.body_content : '';
    customerBody = customerBody.replace(/{{CUSTOMER_NAME}}/g, order.customer_name);
    customerBody = customerBody.replace(/{{TOTAL_PRICE}}/g, order.total_price.toLocaleString());
    // 🐛 バグ修正（デバッグフェーズ）: /ar はクエリパラメータ ?uid= でハッシュを受け取る
    // 実装（src/app/ar/page.tsx）で、/ar/<hash> というパス形式のルートは存在しない。
    // 以前はここが /ar/${hash} になっており、メール内のARリンクが404になっていた。
    customerBody = customerBody.replace(/{{AR_URL}}/g, `${origin}/ar?uid=${order.hash_id}`);
    customerBody = customerBody.replace(/{{CLIENT_NAME}}/g, clientName);
    Object.keys(settings).forEach((key) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      customerBody = customerBody.replace(regex, settings[key]);
    });

    // 4. 【管理者向け】通知メール生成
    const adminSubject = `【受注通知】新規注文が入りました（${order.customer_name}様）`;
    const adminBody = `
管理者の皆様

新規のご注文がありました。

■ ご注文情報
・お名前: ${order.customer_name} 様
・メールアドレス: ${order.email}
・ご請求金額: ${order.total_price.toLocaleString()} 円
・OEM提供先: ${clientName || '自社サイト（提供先なし）'}

■ AR（成果物）確認用URL
${origin}/ar?uid=${order.hash_id}

■ 管理画面ダッシュボード（画像差し替え等）
${origin}/admin/dashboard

対応をお願いいたします。
`;

    // 5. メール送信処理
    // ※Vercel環境でのテスト用として、まずはサーバーログに出力します。
    // （実際のメール配信には Resend や SendGrid などの外部APIアカウントが必要です）
    console.log('=== 📤 [お客様宛] サンクスメール ===');
    console.log(`To: ${order.email}`);
    console.log(`Subject: ${mailTemplate?.subject}`);
    console.log(`Body:\n${customerBody}`);
    console.log('====================================');

    console.log('=== 📥 [管理者宛] 受注通知メール ===');
    console.log(`To: admin@example.com`); // 実際の運用時はここを管理者アドレスにします
    console.log(`Subject: ${adminSubject}`);
    console.log(`Body:\n${adminBody}`);
    console.log('====================================');

    return NextResponse.json({ success: true, message: 'Mail processed successfully' });
  } catch (error) {
    console.error('Mail API Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process mail' }, { status: 500 });
  }
}