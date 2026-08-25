import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';

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
    const mindFile = formData.get('mindFile') as File | null;

    const hashId = uuidv4().replace(/-/g, '').substring(0, 16);

    let processedImageUrl = null;
    let originalImageUrl = null;
    let mindFileUrl = null;
    let targetImageUrl = null;
    let arMode = 'hiro'; 

    // ==========================================
    // 1. ファイルをSupabase Storageへアップロード
    // ==========================================
    if (templateId) {
      let formattedId = templateId.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).toUpperCase().trim();
      formattedId = formattedId.replace(/ー|−|_/g, '-');
      if (!formattedId.includes('-')) formattedId = formattedId.replace('T', 'T-');
      processedImageUrl = `templates/${formattedId}.jpg`;
    } else {
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

      if (mindFile) {
        mindFileUrl = `minds/mind_${uuidv4()}.mind`;
        await supabase.storage.from('ar_images').upload(mindFileUrl, mindFile);
        arMode = 'mindar';
        targetImageUrl = processedImageUrl || originalImageUrl;
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
        ar_mode: arMode,
        mind_file_url: mindFileUrl,
        target_image_url: targetImageUrl,
      })
      .select()
      .single();

    if (orderError) throw orderError;

    if (processedImageUrl || originalImageUrl) {
      await supabase.from('order_images').insert({
        order_id: order.id,
        original_image_url: originalImageUrl,
        processed_image_url: processedImageUrl,
      });
    }

    // ==========================================
    // 3. メール送信用：システム設定の取得
    // ==========================================
    const { data: settings } = await supabase.from('system_settings').select('*');
    const getSetting = (key: string) => settings?.find(s => s.key === key)?.value || '';

    // ==========================================
    // 4. サンクスメール（自動返信）の送信処理
    // ==========================================
    let mailErrorMsg = null;
    try {
      // 💡 Vercelの環境変数 (SMTP_HOST, SMTP_USER, SMTP_PASS) が正しく設定されているか確認
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        throw new Error('SMTP credentials are not configured in Vercel Environment Variables.');
      }

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'sv***.xserver.jp',
        port: 465,
        secure: true, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      // 💡 外部ファイル読み込みによるエラーを防ぐため、テンプレートを直接定義
      const mailText = `
${customerName} 様

この度は「ことたま」をご注文いただき、誠にありがとうございます。
以下の内容でご注文を承りました。

--------------------------------------------------
【ご注文内容】
${optionDetails}
--------------------------------------------------
合計金額: ¥${totalPrice.toLocaleString()}（税込・送料込）

【お振込先のご案内】
恐れ入りますが、以下の口座へお振込をお願いいたします。
ご入金の確認ができ次第、制作と発送の準備を進めさせていただきます。

銀行名 ：${getSetting('BANK_NAME')}
支店名 ：${getSetting('BANK_BRANCH')}
口座番号：${getSetting('BANK_NUMBER')}
口座名義：${getSetting('BANK_USER_NAME')}

※お振込手数料はお客様のご負担にてお願いいたします。
※ご注文から7日以内にお振込が確認できない場合、自動キャンセルとなる場合がございます。

ご不明な点がございましたら、本メールへの返信にてお問い合わせください。
引き続きよろしくお願いいたします。

==================================================
ことたま - 大切なメッセージを風化させないARキーホルダー
https://kototama-ar.com/
==================================================
      `.trim();

// お客様への送信（同時に運営側の複数アドレスへBCCで送信）
      await transporter.sendMail({
        from: `"ことたま" <${process.env.SMTP_USER}>`,
        to: email,
        // 💡 ここを配列 [ ] にして、カンマ区切りで増やしたいアドレスをクォーテーション('')で囲んで追加します
        bcc: [
          process.env.SMTP_USER,             // 元々のinfoアドレス
          'shotake0222@gmail.com',           // 追加したいアドレス1
          'shotaro6022@gmail.com'          // 追加したいアドレス2（何個でも増やせます）
        ],
        subject: '【ことたま】ご注文を承りました',
        text: mailText,
      });
      
      console.log('✅ Mail sent successfully to:', email);

    } catch (mailError: any) {
      console.error('❌ Mail sending failed:', mailError);
      mailErrorMsg = mailError.message; // エラーメッセージを保持
    }

    // ==========================================
    // 5. フロントエンドへの完了レスポンス
    // ==========================================
    // メール送信に失敗しても、注文自体は成功しているので success: true を返す
    // ただし、デバッグ用に mail_status を追加
    return NextResponse.json({ 
      success: true, 
      hashId,
      mail_status: mailErrorMsg ? `Failed: ${mailErrorMsg}` : 'Sent Successfully'
    });

  } catch (error: any) {
    console.error('Order API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}