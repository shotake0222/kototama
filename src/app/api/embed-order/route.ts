import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

// Supabaseクライアントの初期化（サーバーサイド用）
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    
    // 基本情報の取得
    const customerName = formData.get('customerName') as string;
    const email = formData.get('email') as string;
    const clientId = formData.get('clientId') as string;
    const optionDetails = formData.get('optionDetails') as string;
    const totalPrice = Number(formData.get('totalPrice'));
    
    // ファイル関連の取得
    const templateId = formData.get('templateId') as string | null;
    const originalFile = formData.get('originalFile') as File | null;
    const processedFile = formData.get('processedFile') as File | null;
    const mindFile = formData.get('mindFile') as File | null; // 💡 フロントから送られた .mind ファイル

    const hashId = uuidv4().replace(/-/g, '').substring(0, 16);

    let processedImageUrl = null;
    let originalImageUrl = null;
    let mindFileUrl = null;
    let targetImageUrl = null;
    let arMode = 'hiro'; // デフォルトはマーカー

    // ==========================================
    // 1. ファイルをSupabase Storageへアップロード
    // ==========================================
    if (templateId) {
      // テンプレート指定の場合（パスの整形）
      let formattedId = templateId.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).toUpperCase().trim();
      formattedId = formattedId.replace(/ー|−|_/g, '-');
      if (!formattedId.includes('-')) formattedId = formattedId.replace('T', 'T-');
      processedImageUrl = `templates/${formattedId}.jpg`;
    } else {
      // ユーザー画像アップロードの場合
      if (originalFile) {
        const ext = originalFile.name.split('.').pop() || 'jpg';
        originalImageUrl = `orig_${uuidv4()}.${ext}`;
        await supabase.storage.from('ar_images').upload(originalImageUrl, originalFile);
      }
      
      if (processedFile) {
        const ext = processedFile.name.split('.').pop() || 'jpg';
        processedImageUrl = `proc_${uuidv4()}.${ext}`;
        await supabase.storage.from('ar_images').upload(processedImageUrl, processedFile);
      }

      // 💡 MindAR トラッキングデータ (.mind) のアップロード処理
      if (mindFile) {
        mindFileUrl = `minds/mind_${uuidv4()}.mind`;
        await supabase.storage.from('ar_images').upload(mindFileUrl, mindFile);
        
        arMode = 'mindar'; // ARモードをMindARに切り替え
        targetImageUrl = processedImageUrl || originalImageUrl; // マーカーとなる元の画像パスを保存
      }
    }

    // ==========================================
    // 2. データベースへの登録 (orders テーブル)
    // ==========================================
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name: customerName,
        email: email,
        hash_id: hashId,
        total_price: totalPrice,
        status: 'pending',
        client_id: clientId,
        option_details: optionDetails,
        ar_mode: arMode,                  // 💡 ARモード
        mind_file_url: mindFileUrl,       // 💡 .mindファイルのパス
        target_image_url: targetImageUrl, // 💡 ターゲット画像のパス
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // ==========================================
    // 3. 画像データの紐付け (order_images テーブル)
    // ==========================================
    if (processedImageUrl || originalImageUrl) {
      await supabase.from('order_images').insert({
        order_id: order.id,
        original_image_url: originalImageUrl,
        processed_image_url: processedImageUrl,
      });
    }

    // ==========================================
    // 4. メール送信用：システム設定の取得
    // ==========================================
    const { data: settings } = await supabase.from('system_settings').select('*');
    const getSetting = (key: string) => settings?.find(s => s.key === key)?.value || '';

    // ==========================================
    // 5. サンクスメール（自動返信）の送信処理
    // ==========================================
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'sv***.xserver.jp', // ※Vercelの環境変数に設定してください
        port: 465,
        secure: true,
        auth: {
          user: process.env.SMTP_USER || 'info@kototama-ar.com',
          pass: process.env.SMTP_PASS, // ※Vercelの環境変数に設定してください
        },
      });

      // メールテンプレートテキストの読み込み（src/data/customer_mail.txt）
      let mailText = '';
      try {
        const filePath = path.join(process.cwd(), 'src/data/customer_mail.txt');
        mailText = fs.readFileSync(filePath, 'utf8');
      } catch (e) {
        // ファイルが見つからない場合のフォールバック（保険）
        mailText = `{{CUSTOMER_NAME}} 様\n\nご注文ありがとうございます。\n以下の内容で承りました。\n\n{{OPTION_DETAILS}}\n合計金額: ¥{{TOTAL_PRICE}}\n\n【お振込先】\n{{BANK_NAME}} {{BANK_BRANCH}}\n口座番号: {{BANK_NUMBER}}\n口座名義: {{BANK_USER_NAME}}\n\n※ご入金確認後、制作を進めさせていただきます。`;
      }

      // 変数の置換
      mailText = mailText
        .replace(/{{CUSTOMER_NAME}}/g, customerName)
        .replace(/{{OPTION_DETAILS}}/g, optionDetails)
        .replace(/{{TOTAL_PRICE}}/g, totalPrice.toLocaleString())
        .replace(/{{BANK_NAME}}/g, getSetting('BANK_NAME'))
        .replace(/{{BANK_BRANCH}}/g, getSetting('BANK_BRANCH'))
        .replace(/{{BANK_NUMBER}}/g, getSetting('BANK_NUMBER'))
        .replace(/{{BANK_USER_NAME}}/g, getSetting('BANK_USER_NAME'));

      // お客様への送信（同時にinfo宛にもBCCで送信）
      await transporter.sendMail({
        from: `"ことたま" <${process.env.SMTP_USER || 'info@kototama-ar.com'}>`,
        to: email,
        bcc: process.env.SMTP_USER || 'info@kototama-ar.com',
        subject: '【ことたま】ご注文を承りました',
        text: mailText,
      });
    } catch (mailError) {
      console.error('Mail sending failed:', mailError);
      // メールの送信に失敗しても、注文データの保存は成功しているのでエラーにはせず処理を続行します
    }

    // ==========================================
    // 6. フロントエンドへの完了レスポンス
    // ==========================================
    return NextResponse.json({ success: true, hashId });

  } catch (error: any) {
    console.error('Order API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}