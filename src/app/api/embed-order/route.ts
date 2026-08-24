import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';

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
    
    // 【追加】テンプレートIDを受け取る
    const templateId = formData.get('templateId') as string;
    
    if (!customerName || !email) {
      return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400, headers: corsHeaders });
    }

    let fileName = '';

    // 1. テンプレート or 画像アップロードの分岐処理
    if (templateId) {
      // 全角を半角にし、小文字を大文字に変換する安全処理
      let formattedId = templateId.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
          return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
      }).toUpperCase().trim();
      // 揺れを吸収 (例: Tー01, T-01, T01)
      formattedId = formattedId.replace(/ー|−|_/g, '-');
      if (!formattedId.includes('-')) formattedId = formattedId.replace('T', 'T-');
      
      // Supabase内のテンプレートフォルダのパスを指定
      fileName = `templates/${formattedId}.jpg`;
      
    } else if (file && file.name !== 'template.txt') {
      // 通常の画像アップロード処理
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

    // 画像（またはテンプレートパス）をAR用に登録
    if (fileName) {
      await supabase.from('order_images').insert({
        order_id: order.id,
        image_url: fileName,
      });
    }

    // 3. Nodemailerを使ったメール送信処理
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

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    if (process.env.SMTP_HOST) {
      await transporter.sendMail({
        from: `"ことたま システム" <${process.env.SMTP_USER}>`,
        to: 'info@kototama-ar.com',
        subject: `【ことたま】新規受注のお知らせ（${customerName}様）`,
        text: adminEmailBody,
      });
    } else {
      console.log(adminEmailBody);
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });

  } catch (error) {
    console.error('Embed API Error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500, headers: corsHeaders });
  }
}