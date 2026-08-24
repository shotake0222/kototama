import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const customerName = formData.get('customerName') as string;
    const email = formData.get('email') as string;
    const file = formData.get('file') as File;
    const clientId = formData.get('clientId') as string || 'unknown';
    const optionDetails = formData.get('optionDetails') as string;
    const totalPrice = parseInt(formData.get('totalPrice') as string || '0', 10);
    
    if (!customerName || !email || !file) {
      return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400, headers: corsHeaders });
    }

    // 1. ファイルをSupabaseにアップロード
    let fileName = 'template_only';
    if (file.name !== 'template.txt') {
      const fileExt = file.name.split('.').pop();
      fileName = `${uuidv4()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('ar_images')
        .upload(fileName, file);
      if (uploadError) throw uploadError;
    }

    // 2. セキュアなハッシュ化URLの生成とデータベース保存
    const hashId = uuidv4().replace(/-/g, '').substring(0, 16);
    const arUrl = `https://kototama.vercel.app/ar/${hashId}`;
    
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name: customerName,
        email: email,
        hash_id: hashId,
        total_price: totalPrice,
        status: 'pending',
        client_id: clientId,
        option_details: optionDetails
      })
      .select()
      .single();

    if (orderError) throw orderError;

    if (fileName !== 'template_only') {
      await supabase.from('order_images').insert({
        order_id: order.id,
        image_url: fileName,
      });
    }

    // 3. 構成図要件：管理者（info@kototama-ar.com）への通知メール送信処理
    const adminEmailBody = `
新しい受注がありました。

【お客様名】${customerName} 様
【メールアドレス】${email}
【受注金額】¥${totalPrice.toLocaleString()}

【ご注文詳細】
${optionDetails}

【生成されたARのURL】
${arUrl}
※このURLは管理者およびお客様専用のハッシュ化された非公開リンクです。
※管理画面のダッシュボードからも詳細をご確認いただけます。
    `.trim();

    // Vercel環境でよく使われるResend等のメールAPI呼び出し（環境変数が設定されている場合）
    if (process.env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'no-reply@kototama-ar.com',
          to: 'info@kototama-ar.com,shotake0222@gmail.com,shotaro6022@gmail.com',
          subject: `【ことたま】新規受注のお知らせ（${customerName}様）`,
          text: adminEmailBody
        })
      });
    } else {
      // 開発中・APIキー未設定時はVercelのサーバーログに出力して確認可能にする
      console.log('=== 管理者宛てメール送信ロジック実行 ===');
      console.log(adminEmailBody);
    }

    // 4. ユーザー側（フロントエンド）にはARのURLは返さず、成功ステータスのみを返す
    return NextResponse.json({ success: true }, { headers: corsHeaders });

  } catch (error) {
    console.error('Embed API Error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500, headers: corsHeaders });
  }
}