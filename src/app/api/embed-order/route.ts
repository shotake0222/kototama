import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';

// Supabaseクライアントの初期化
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
    const totalPrice = Number(formData.get('totalPrice')) || 0;
    
    // 追加・ファイル関連の取得
    const animationType = (formData.get('animationType') as string) || 'none';
    const templateId = formData.get('templateId') as string | null;
    const originalFile = formData.get('originalFile') as File | null;
    const processedFile = formData.get('processedFile') as File | null;
    const mindFile = formData.get('mindFile') as File | null;
    const targetImageFile = formData.get('targetImageFile') as File | null;

    const hashId = uuidv4().replace(/-/g, '').substring(0, 16);

    let arMode = mindFile ? 'mindar' : 'hiro';
    let targetImageUrl = null;
    let mindFileUrl = null;

    // ==========================================
    // 1. Ordersテーブルに注文データを作成 (先に行う)
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
        animation_type: animationType,
        ar_mode: arMode
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // ==========================================
    // 2. ターゲット画像（MindAR用）の処理
    // ==========================================
    if (mindFile && targetImageFile) {
      const mindExt = mindFile.name.split('.').pop() || 'mind';
      const targetExt = targetImageFile.name.split('.').pop() || 'jpg';
      const baseName = `target_${uuidv4().substring(0,8)}`;
      
      mindFileUrl = `minds/${baseName}.${mindExt}`;
      targetImageUrl = `targets/${baseName}.${targetExt}`;
      
      await supabase.storage.from('ar_images').upload(mindFileUrl, mindFile);
      await supabase.storage.from('ar_images').upload(targetImageUrl, targetImageFile);
      
      // 生成したファイルのURLをordersテーブルに紐付け
      await supabase.from('orders').update({ 
        mind_file_url: mindFileUrl, 
        target_image_url: targetImageUrl 
      }).eq('id', order.id);
    }

    // ==========================================
    // 3. 表示するARオブジェクト（画像）の処理
    // ==========================================
    if (templateId) {
      // テンプレート指定の場合
      let formattedId = templateId.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).toUpperCase().trim();
      formattedId = formattedId.replace(/ー|−|_/g, '-');
      if (!formattedId.includes('-')) formattedId = formattedId.replace('T', 'T-');
      
      const processedImageUrl = `templates/${formattedId}.jpg`;
      
      await supabase.from('order_images').insert({ 
        order_id: order.id, 
        processed_image_url: processedImageUrl
      });
      
    } else {
      // 画像アップロードの場合
      if (originalFile) {
        const ext = originalFile.name.split('.').pop() || 'jpg';
        const originalImageUrl = `orig_${uuidv4()}.${ext}`;
        await supabase.storage.from('ar_images').upload(originalImageUrl, originalFile);
        
        let processedImageUrl = null;
        if (processedFile) {
          const pExt = processedFile.name.split('.').pop() || 'jpg';
          processedImageUrl = `proc_${uuidv4()}.${pExt}`;
          await supabase.storage.from('ar_images').upload(processedImageUrl, processedFile);
        }
        
        await supabase.from('order_images').insert({
          order_id: order.id,
          original_image_url: originalImageUrl,
          processed_image_url: processedImageUrl || originalImageUrl
        });
      }

      // アルバム機能（2枚目以降の画像）の処理
      const albumFiles = formData.getAll('albumFiles');
      if (albumFiles && albumFiles.length > 0) {
        for (const file of albumFiles) {
          const f = file as File;
          const ext = f.name.split('.').pop() || 'jpg';
          const path = `proc_album_${uuidv4()}.${ext}`;
          
          await supabase.storage.from('ar_images').upload(path, f);
          
          await supabase.from('order_images').insert({
            order_id: order.id,
            processed_image_url: path
          });
        }
      }
    }

    // ==========================================
    // 4. メール送信用：システム設定の取得
    // ==========================================
    const { data: settings } = await supabase.from('system_settings').select('*');
    const getSetting = (key: string) => settings?.find(s => s.key === key)?.value || '';

    // ==========================================
    // 5. メールの送信処理
    // ==========================================
    let mailErrorMsg = null;
    try {
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        throw new Error('SMTP credentials are not configured.');
      }

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'sv***.xserver.jp',
        port: 465,
        secure: true, 
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      // お客様向けメールの本文
      const customerMailText = `
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

※ご注文から7日以内にお振込が確認できない場合、自動キャンセルとなる場合がございます。

==================================================
ことたま - 大切なメッセージを風化させないARキーホルダー
https://kototama-ar.com/
==================================================
      `.trim();

      // 運営側向けメールの本文
      const adminMailText = `
※このメールはシステムからの自動送信です。

LPより「ことたま」の新規注文が入りました。
管理ダッシュボードより内容をご確認ください。

【注文日時】
${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}

【お客様情報】
氏名: ${customerName}
メール: ${email}
経路: ${clientId}

【オプション・配送先詳細】
${optionDetails}

【決済情報】
合計金額: ¥${totalPrice.toLocaleString()}
ステータス: pending（未入金）

【AR・画像情報】
モード: ${arMode === 'mindar' ? 'イメージトラッキング(MindAR)' : '通常マーカー(Hiro)'}
テンプレート指定: ${templateId || 'なし（画像アップロード）'}
アニメーション: ${animationType}
AR用URL: https://app.kototama-ar.com/ar?uid=${hashId}
      `.trim();

      // 1. お客様への送信
      await transporter.sendMail({
        from: `"ことたま" <${process.env.SMTP_USER}>`,
        to: email,
        subject: '【ことたま】ご注文を承りました',
        text: customerMailText,
      });
      
      // 2. 運営側（複数人）への送信
      const adminEmails = [
        process.env.SMTP_USER,
        'shotaro6022@gmail.com',
        'shotake0222@gmail.com'
      ];

      await transporter.sendMail({
        from: `"ことたまシステム" <${process.env.SMTP_USER}>`,
        to: adminEmails,
        subject: `【新規注文】${customerName} 様よりご注文が入りました`,
        text: adminMailText,
      });

      console.log('✅ Emails sent successfully to customer and admins.');

    } catch (mailError: any) {
      console.error('❌ Mail sending failed:', mailError);
      mailErrorMsg = mailError.message; 
    }

    // ==========================================
    // 6. フロントエンドへの完了レスポンス
    // ==========================================
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