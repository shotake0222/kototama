'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';

const MODERATION_LABEL: Record<string, string> = {
  pending: '審査中',
  approved: '公開中',
  rejected: '非承認',
};

export default function StudioDashboardPage() {
  const supabase = createClient();
  const [items, setItems] = useState<any[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email || '');

      const { data } = await supabase
        .from('ar_items')
        .select('*, ar_item_assets(*)')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });
      setItems(data || []);
      setLoading(false);

      // user_ar_assetsは非公開バケットのため、本人所有分を署名付きURLで取得する
      const urls: Record<string, string> = {};
      await Promise.all(
        (data || []).map(async (item: any) => {
          const path = item.ar_item_assets?.[0]?.storage_path;
          if (!path) return;
          const { data: signed } = await supabase.storage.from('user_ar_assets').createSignedUrl(path, 300);
          if (signed?.signedUrl) urls[item.id] = signed.signedUrl;
        })
      );
      setThumbUrls(urls);
    };
    load();
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/studio/login';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10 text-gray-800">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">マイAR一覧</h1>
            <p className="text-xs text-gray-400 mt-1">{email}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/studio/new" className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2 rounded-lg text-sm transition">
              ＋ 新しいARを作る
            </Link>
            <button onClick={handleLogout} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-bold text-sm transition">
              ログアウト
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-400">読み込み中...</p>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center text-gray-400">
            まだARを作成していません。「＋ 新しいARを作る」から始めましょう。
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {items.map((item) => {
              const origin = typeof window !== 'undefined' ? window.location.origin : '';
              const viewUrl = `${origin}/v/${item.hash_id}`;
              const thumb = thumbUrls[item.id];
              const assetType = item.ar_item_assets?.[0]?.asset_type || 'image';
              return (
                <div key={item.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-2">
                  <div className="w-full aspect-square bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
                    {assetType === 'image' && thumb ? (
                      <img src={thumb} alt={item.title || 'AR'} className="w-full h-full object-cover" />
                    ) : assetType === 'video' ? (
                      <span className="text-gray-400 text-xs">🎬 動画</span>
                    ) : assetType === 'model' ? (
                      <span className="text-gray-400 text-xs">🧊 3Dモデル</span>
                    ) : (
                      <span className="text-gray-300 text-xs">画像なし</span>
                    )}
                  </div>
                  <div className="font-bold text-sm truncate">{item.title || '(無題)'}</div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`px-2 py-0.5 rounded-full font-bold ${
                      item.moderation_status === 'approved' ? 'bg-green-100 text-green-700' :
                      item.moderation_status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {MODERATION_LABEL[item.moderation_status] || item.moderation_status}
                    </span>
                  </div>
                  {item.moderation_status === 'approved' && (
                    <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline break-all block">
                      {viewUrl}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
