import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

// OEM提供先ポータル（/oem）のログインアカウントを発行するAPI。
// 管理画面（admin/dashboard/page.tsx の handleIssueOemAccount）から呼ばれる。
// これまでこのファイル自体が存在せず、管理画面のボタンがリンク切れだった（Phase 0で新規作成）。
//
// 🔒 重要: このAPIは「OEM提供先のログインアカウントを作成し、指定した
// client_id に紐付ける」という強い権限を持つため、必ず運営の管理者だけが
// 呼び出せるようにする必要がある。/admin 配下は middleware.ts で
// 未ログインユーザーをリダイレクトしているが、/api/oem-accounts はその
// matcher (/admin/:path*) の対象外なので、ここで改めて認証チェックを行う。
//
// admin_users テーブル（Phase 0のRLS提案 004_admin_users_and_rls_proposal.sql）が
// 適用済みなら、そこに登録されたユーザーだけを管理者として扱う。まだ適用して
// いない場合は、従来通り「Supabase Authでログイン済みかどうか」のみで判定する
// （今までの実質的な運用と同じで、新たな穴を開けるわけではない）。ただし
// Phase 1でエンドユーザー向けCMSのアカウントが増えると「ログイン済みなら誰でも
// admin_users相当」という状態は危険になるため、admin_usersの適用を強く推奨する。
async function assertIsAdmin(): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(_name: string, _value: string, _options: CookieOptions) {},
        remove(_name: string, _options: CookieOptions) {},
      },
    }
  );

  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return { ok: false, status: 401, error: 'ログインが必要です。' };

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { data: adminRow, error } = await serviceClient
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      // admin_usersテーブルが未作成などの場合はここに来る。安全側に倒すため
      // ログを残した上で「ログイン済みなら許可」という従来相当の挙動にフォールバックする。
      console.warn('[oem-accounts] admin_users check failed, falling back to any-authenticated-user:', error.message);
      return { ok: true };
    }
    if (!adminRow) return { ok: false, status: 403, error: '管理者権限がありません。' };
    return { ok: true };
  } catch (err: any) {
    console.warn('[oem-accounts] admin_users check threw, falling back to any-authenticated-user:', err?.message);
    return { ok: true };
  }
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function POST(request: Request) {
  const authCheck = await assertIsAdmin();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  }

  try {
    const { clientId, email } = await request.json();
    if (!clientId || !email) {
      return NextResponse.json({ error: 'clientIdとemailは必須です。' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: clientRow } = await supabase.from('clients').select('client_id').eq('client_id', clientId).maybeSingle();
    if (!clientRow) {
      return NextResponse.json({ error: '指定されたOEM提供先が見つかりません。' }, { status: 404 });
    }

    // まず新規作成を試み、「既に登録済み」エラーなら既存ユーザーを探して再利用する。
    const tempPassword = generateTempPassword();
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

    let userId: string;
    let reused = false;

    if (createError) {
      const alreadyExists = /already|registered|exists/i.test(createError.message || '');
      if (!alreadyExists) throw createError;

      // 既存ユーザーを検索する（Supabase Admin APIにメール直接検索が無いためページングで探す）
      let foundId: string | null = null;
      let page = 1;
      while (!foundId) {
        const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        if (listError) throw listError;
        const match = listData.users.find((u) => u.email?.toLowerCase() === String(email).toLowerCase());
        if (match) { foundId = match.id; break; }
        if (listData.users.length < 200) break; // 最終ページまで見つからなかった
        page += 1;
      }
      if (!foundId) throw new Error('既存アカウントの検索に失敗しました。');
      userId = foundId;
      reused = true;
    } else {
      userId = created.user.id;
    }

    const { error: memberError } = await supabase
      .from('client_members')
      .upsert({ user_id: userId, client_id: clientId }, { onConflict: 'user_id' });
    if (memberError) throw memberError;

    return NextResponse.json(
      reused
        ? { reused: true, email }
        : { reused: false, email, tempPassword }
    );
  } catch (error: any) {
    console.error('oem-accounts API error:', error);
    return NextResponse.json({ error: error.message || 'アカウント発行に失敗しました。' }, { status: 500 });
  }
}
