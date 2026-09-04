import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // /admin 以下のアクセス（ログイン画面は除く）で、未ログインならリダイレクト
  if (request.nextUrl.pathname.startsWith('/admin') && !request.nextUrl.pathname.startsWith('/admin/login')) {
    if (!user) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  // Phase 1: /studio 以下（ユーザー基準CMS）も、ログイン画面自身を除いて
  // 未ログインなら /studio/login へリダイレクトする。/admin と同じ
  // Supabase Authセッションを見るが、admin_usersでの権限区別はしない
  // （/studioは一般ユーザー向けのため、ログインさえしていれば入れる）。
  if (request.nextUrl.pathname.startsWith('/studio') && !request.nextUrl.pathname.startsWith('/studio/login')) {
    if (!user) {
      return NextResponse.redirect(new URL('/studio/login', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/admin/:path*', '/studio/:path*'],
}