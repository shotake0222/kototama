import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// サーバーサイド専用のSupabaseクライアント
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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

    // 3. 【お客様向け】サンクスメール生成
    const { data: mailTemplate } = await supabase
      .from('mail_templates')
      .select('*')
      .eq('trigger_type', 'thanks')
      .single();

    let customerBody = mailTemplate ? mailTemplate.body_content : '';
    customerBody = customerBody.replace(/{{CUSTOMER_NAME}}/g, order.customer_name);
    customerBody = customerBody.replace(/{{TOTAL_PRICE}}/g, order.total_price.toLocaleString());
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

■ AR（成果物）確認用URL
${origin}/ar/${order.hash_id}

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