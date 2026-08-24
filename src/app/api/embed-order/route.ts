import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer'; // 追加：メール送信用ライブラリ

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

    // 2. セキュアなハッシュ化URLの生成とDB保存
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

    // 3. Nodemailerを使ったメール送信処理（XServer経由）
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

    // Vercelの環境変数からSMTP設定を読み込む
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, // 例: sv***.xserver.jp
      port: 465, // XServerのセキュアポート
      secure: true,
      auth: {
        user: process.env.SMTP_USER, // 例: no-reply@kototama-ar.com
        pass: process.env.SMTP_PASS, // メールアドレスのパスワード
      },
    });

    // SMTP設定が存在する場合のみメールを送信
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      await transporter.sendMail({
        from: `"ことたま システム" <${process.env.SMTP_USER}>`, // 送信元
        to: 'info@kototama-ar.com', // 宛先（管理者）
        subject: `【ことたま】新規受注のお知らせ（${customerName}様）`,
        text: adminEmailBody,
      });
    } else {
      console.log('=== SMTP設定が未登録のため、ログ出力のみ行います ===');
      console.log(adminEmailBody);
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });

  } catch (error) {
    console.error('Embed API Error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500, headers: corsHeaders });
  }
}