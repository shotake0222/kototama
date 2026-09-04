import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Supabase Authのマジックリンク（signInWithOtp）から戻ってくるコールバック。
// /studio/login がメール送信時に emailRedirectTo で指定するURL。
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/studio';

  if (code) {
    const supabase = createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
