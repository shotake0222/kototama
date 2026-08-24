'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const supabase = createClient();

  // ログイン画面ではサイドバーを表示しない
  if (pathname === '/admin/login') {
    return <div className="bg-gray-50 min-h-screen">{children}</div>;
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/admin/login';
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* サイドバー */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 text-lg font-bold border-b border-gray-800 tracking-wider">
          管理パネル
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/admin/dashboard" className={`block p-3 rounded text-sm transition-colors ${pathname.includes('dashboard') ? 'bg-blue-600' : 'hover:bg-gray-800'}`}>
            受注・画像管理
          </Link>
          <Link href="/admin/templates" className={`block p-3 rounded text-sm transition-colors ${pathname.includes('templates') ? 'bg-blue-600' : 'hover:bg-gray-800'}`}>
            ARテンプレート管理
          </Link>
          <Link href="/admin/settings" className={`block p-3 rounded text-sm transition-colors ${pathname.includes('settings') ? 'bg-blue-600' : 'hover:bg-gray-800'}`}>
            システム設定
          </Link>
          <Link href="/admin/mail-templates" className={`block p-3 rounded text-sm transition-colors ${pathname.includes('mail-templates') ? 'bg-blue-600' : 'hover:bg-gray-800'}`}>
            メール文面設定
          </Link>
        </nav>
        <div className="p-4 border-t border-gray-800">
          <button onClick={handleLogout} className="w-full text-left p-3 rounded text-sm text-gray-300 hover:text-white hover:bg-gray-800 transition-colors">
            ログアウト
          </button>
        </div>
      </aside>

      {/* メインコンテンツエリア */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}