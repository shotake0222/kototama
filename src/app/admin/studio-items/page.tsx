'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';

// Phase 1: ユーザー基準CMS（/studio）で作られたARのモデレーション画面。
// /admin 配下なので middleware.ts の既存の認証チェック（未ログインならリダイレクト）が
// そのまま適用される。既存の admin/dashboard/page.tsx は非常に大きいファイルのため、
// 変更のリスクを避けてここでは新しい独立したページとして追加している。
export default function StudioItemsModerationPage() {
  const supabase = createClient();
  const [items, setItems] = useState<any[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  const fetchItems = async () => {
    setLoading(true);
    let query = supabase.from('ar_items').select('*, ar_item_assets(*)').order('created_at', { ascending: false });
    if (filter !== 'all') query = query.eq('moderation_status', filter);
    const { data } = await query;
    setItems(data || []);
    setLoading(false);

    // user_ar_assetsは非公開バケットのため、署名付きURLを個別に取得する
    // （005番migrationの user_ar_assets_admin_select ポリシー適用が前提）。
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

  useEffect(() => { fetchItems(); }, [filter]);

  const handleReview = async (itemId: string, decision: 'approved' | 'rejected') => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('ar_items').update({ moderation_status: decision }).eq('id', itemId);
    await supabase.from('ar_item_moderation_log').insert({
      ar_item_id: itemId,
      action: decision,
      reviewer_id: user?.id,
    });
    fetchItems();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-800">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex justify-between items-center border-b pb-4">
          <h1 className="text-2xl font-bold">スタジオCMS モデレーション</h1>
          <Link href="/admin/dashboard" className="text-sm text-blue-600 underline">← 通常の管理ダッシュボードへ</Link>
        </div>

        <div className="flex gap-2">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              {f === 'pending' ? '審査待ち' : f === 'approved' ? '公開中' : f === 'rejected' ? '非承認' : 'すべて'}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-400">読み込み中...</p>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center text-gray-400">対象がありません。</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {items.map((item) => {
              const thumbUrl = thumbUrls[item.id];
              const assetType = item.ar_item_assets?.[0]?.asset_type || 'image';
              return (
                <div key={item.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-2">
                  <div className="w-full aspect-square bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center text-xs text-gray-400">
                    {assetType === 'image' && thumbUrl ? (
                      <img src={thumbUrl} alt={item.title || 'AR'} className="w-full h-full object-cover" />
                    ) : assetType === 'video' ? '🎬 動画' : assetType === 'model' ? '🧊 3Dモデル' : '画像なし'}
                  </div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide">{assetType}</div>
                  <div className="font-bold text-sm truncate">{item.title || '(無題)'}</div>
                  <div className="text-xs text-gray-400 font-mono">{item.hash_id}</div>
                  <div className="flex gap-2">
                    <button onClick={() => handleReview(item.id, 'approved')} className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 font-bold px-3 py-2 rounded text-xs transition">承認</button>
                    <button onClick={() => handleReview(item.id, 'rejected')} className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 font-bold px-3 py-2 rounded text-xs transition">却下</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
