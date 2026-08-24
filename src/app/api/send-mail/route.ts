import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// サーバーサイド専用のSupabaseクライアント（環境変数から直接生成）
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: Request) {
  try {
    const { orderId } = await request.json();

    // 1. 注文情報の取得
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
    if (orderError || !order) throw new Error('Order not found');

    // 2. システム設定の取得（置換用変数）
    const { data: settingsData } = await supabase.from('system_settings').select('key, value');
    const settings = settingsData?.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>) || {};

    // 3. メールテンプレート（サンクスメール）の取得
    const { data: mailTemplate } = await supabase
      .from('mail_templates')
      .select('*')
      .eq('trigger_type', 'thanks')
      .single();
    
    if (!mailTemplate) throw new Error('Mail template not found');

    // 4. 文面の変数置換処理 ({{変数名}} を実際の値に置き換え)
    let body = mailTemplate.body_content;
    body = body.replace(/{{CUSTOMER_NAME}}/g, order.customer_name);
    body = body.replace(/{{TOTAL_PRICE}}/g, order.total_price.toLocaleString());
    
    // システム設定のキーをすべて置換処理にかける（例: {{BANK_NAME}}）
    Object.keys(settings).forEach((key) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      body = body.replace(regex, settings[key]);
    });

    // 5. メール送信処理
    // ※ 実際にはここで Resend や SendGrid 等のAPIを呼び出します。
    // 例: await resend.emails.send({ from: '...', to: order.email, subject: mailTemplate.subject, text: body });
    console.log('=== 送信されるメール内容 ===');
    console.log(`To: ${order.email}`);
    console.log(`Subject: ${mailTemplate.subject}`);
    console.log(`Body:\n${body}`);
    console.log('============================');

    return NextResponse.json({ success: true, message: 'Mail processed successfully' });
  } catch (error) {
    console.error('Mail API Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process mail' }, { status: 500 });
  }
}