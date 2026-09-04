import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

// スタジオCMS（/studio）で新しいARが投稿され、審査待ち（moderation_status = 'pending'）
// になったことを運営に知らせるための通知API。
//
// 背景: これまで新しい投稿があっても、/admin/studio-items を手動で開いて
// 確認しない限り誰も気づけなかった。既存の注文通知メール（/api/embed-order 内の
// 実装）と同じ nodemailer + SMTP_USER/SMTP_PASS の仕組みを使って、実際に
// 送信できる形にしている（/api/send-mail はコンソールログのみで実際には
// 送信しない未完成の実装のため、そちらは踏襲しない）。
//
// hashIdだけを受け取り、タイトル・投稿者メールアドレスなどはこのAPI自身が
// Service Role Keyでar_items/auth.usersから取得し直す（クライアントから
// 送られてきた値をそのまま信用しない）。
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { hashId } = await request.json();
    if (!hashId) {
      return NextResponse.json({ success: false, error: 'hashId is required' }, { status: 400 });
    }

    const { data: item, error: itemError } = await supabase
      .from('ar_items')
      .select('id, title, hash_id, owner_id, moderation_status, created_at')
      .eq('hash_id', hashId)
      .maybeSingle();

    if (itemError || !item) {
      return NextResponse.json({ success: false, error: 'item not found' }, { status: 404 });
    }

    let ownerEmail = '(不明)';
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(item.owner_id);
      ownerEmail = userData?.user?.email || ownerEmail;
    } catch (err) {
      console.warn('[studio-notify] failed to look up owner email:', err);
    }

    // SMTP未設定の環境（ローカル開発・ステージング等）では通知をスキップする。
    // これはエラーではなく想定内の挙動として扱い、AR作成自体は成功として返す
    // （呼び出し側 studio/new/page.tsx も通知失敗でAR作成を失敗扱いにしない設計）。
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log(`[studio-notify] SMTP not configured, skipping notification for ${hashId}`);
      return NextResponse.json({ success: true, mail_status: 'skipped (SMTP not configured)' });
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

    const origin = request.headers.get('origin') || 'https://kototama-ar.com';
    const adminEmails = [
      process.env.SMTP_USER,
      'shotaro6022@gmail.com',
      'shotake0222@gmail.com',
    ];

    const bodyText = `
運営の皆様

ことたまスタジオ（/studio）に新しいARが投稿され、審査待ちです。

【投稿内容】
タイトル: ${item.title || '(無題)'}
投稿者: ${ownerEmail}
投稿日時: ${new Date(item.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}

■ 審査画面
${origin}/admin/studio-items

対応をお願いいたします。
    `.trim();

    await transporter.sendMail({
      from: `"ことたまスタジオ" <${process.env.SMTP_USER}>`,
      to: adminEmails,
      subject: `【スタジオCMS】新しいARが審査待ちです（${item.title || '無題'}）`,
      text: bodyText,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    // 通知メールの失敗でAR作成そのものを失敗扱いにしたくないため、
    // ここでは常に200番台で返し、詳細はサーバーログにのみ残す。
    console.error('[studio-notify] failed to send notification:', error);
    return NextResponse.json({ success: false, error: error.message || 'unknown error' });
  }
}
