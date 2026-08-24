'use client';
import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // ログアウト処理（必要に応じて適宜修正してください）
  const handleLogout = () => {
    if (confirm('ログアウトしますか？')) {
      // ログアウトのロジック（例: Cookie削除、ログイン画面への遷移など）
      window.location.href = '/admin/login'; 
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-100 font-sans">
      {/* 整理されたシンプルなサイドバー */}
      <aside className="w-64 bg-gray-900 text-gray-300 flex flex-col shadow-xl z-10">
        <div className="p-6 text-xl font-extrabold text-white border-b border-gray-800 tracking-wider">
          ことたま 管理
        </div>
        
        <nav className="flex-1 p-4 mt-2">
          {/* ダッシュボードへのリンクのみを残す */}
          <Link 
            href="/admin/dashboard" 
            className="block px-4 py-3 bg-blue-600 text-white rounded-lg font-bold shadow transition hover:bg-blue-500"
          >
            📊 ダッシュボード
          </Link>
          
          <div className="mt-6 px-4 text-xs text-gray-500 font-bold">
            ※機能はすべてダッシュボードに統合されています
          </div>
        </nav>
        
        <div className="p-4 border-t border-gray-800">
          <button 
            onClick={handleLogout}
            className="w-full text-left px-4 py-3 hover:bg-gray-800 hover:text-white rounded-lg transition font-bold text-sm"
          >
            🚪 ログアウト
          </button>
        </div>
      </aside>
      
      {/* メインコンテンツ（ここに先ほどのダッシュボード画面が表示されます） */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}