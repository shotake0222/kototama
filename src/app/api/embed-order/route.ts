import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const customerName = formData.get('customerName') as string;
    const email = formData.get('email') as string;
    const originalFile = formData.get('originalFile') as File | null;
    const processedFile = formData.get('processedFile') as File | null;
    const templateId = formData.get('templateId') as string;
    const clientId = formData.get('clientId') as string || 'unknown';
    const optionDetails = formData.get('optionDetails') as string;
    const totalPrice = parseInt(formData.get('totalPrice') as string || '0', 10);
    
    if (!customerName || !email) {
      return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400, headers: corsHeaders });
    }

    let originalFileName = '';
    let processedFileName = '';

    // 1. ファイル保存処理（テンプレート or 画像アップロード）
    if (templateId) {
      let formattedId = templateId.replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).toUpperCase().trim();
      formattedId = formattedId.replace(/ー|−|_/g, '-');
      if (!formattedId.includes('-')) formattedId = formattedId.replace('T', 'T-');
      processedFileName = `templates/${formattedId}.jpg`;
    } else {
      if (originalFile && originalFile.name !== 'template.txt') {
        originalFileName = `orig_${uuidv4()}.${originalFile.name.split('.').pop()}`;
        await supabase.storage.from('ar_images').upload(originalFileName, originalFile);
      }
      if (processedFile && processedFile.name !== 'template.txt') {
        processedFileName = `proc_${uuidv4()}.${processedFile.name.split('.').pop()}`;
        await supabase.storage.from('ar_images').upload(processedFileName, processedFile);
      }
    }

    // 2. データベース保存
    const hashId = uuidv4().replace(/-/g, '').substring(0, 16);
    const arUrl = `https://kototama.vercel.app/ar/${hashId}`;
    
    const { data: order, error: orderError } = await supabase.from('orders')
      .insert({ customer_name: customerName, email, hash_id: hashId, total_price: totalPrice, status: 'pending', client_id: clientId, option_details: optionDetails })
      .select().single();
    if (orderError) throw orderError;

    if (processedFileName) {
      await supabase.from('order_images').insert({
        order_id: order.id,
        original_image_url: originalFileName || null,
        processed_image_url: processedFileName,
      });
    }

    // 3. txtファイル読み込みと変数置換（メール送信）
    const filePath = path.join(process.cwd(), 'src', 'data', 'admin_mail.txt');
    let adminEmailBody = fs.readFileSync(filePath, 'utf-8');
    adminEmailBody = adminEmailBody
      .replace(/{{CUSTOMER_NAME}}/g, customerName)
      .replace(/{{EMAIL}}/g, email)
      .replace(/{{TOTAL_PRICE}}/g, totalPrice.toLocaleString())
      .replace(/{{OPTION_DETAILS}}/g, optionDetails)
      .replace(/{{AR_URL}}/g, arUrl);

    if (process.env.SMTP_HOST) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: 465,
        secure: true,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: `"ことたま システム" <${process.env.SMTP_USER}>`,
        to: 'info@kototama-ar.com',
        subject: `【ことたま】新規受注のお知らせ（${customerName}様）`,
        text: adminEmailBody,
      });
    } else {
      console.log('=== Mail Mock ===\n', adminEmailBody);
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500, headers: corsHeaders });
  }
}