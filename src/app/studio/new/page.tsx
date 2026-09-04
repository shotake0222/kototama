'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import Script from 'next/script';
import { createClient } from '@/utils/supabase/client';

// ユーザーが自分でARを作成する画面（Phase 1: 画像のみ対応。動画・3Dモデルは後続フェーズ）。
//
// ここは admin/dashboard や OemPortal と同じく、ブラウザから直接Supabaseに
// 書き込む方式にしている。/api/order のようにサーバーAPIを挟んでいないのは、
// ここでの書き込みは「本人の owner_id でしか行えない」ことが
// supabase/migrations/005_studio_cms.sql のRLSポリシー
// （ar_items_owner_all: owner_id = auth.uid()）で保証されるため、
// サーバー側で追加の金銭検証などが不要なこのユースケースでは、
// RLSそのものを信頼境界として使うのが妥当と判断したため。
// ※ 005番のRLSポリシーが未適用の環境では、この画面は動作しない
//   （anonキーからの書き込みが拒否される）点に注意。
export default function StudioNewItemPage() {
  const supabase = createClient();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [displayFile, setDisplayFile] = useState<File | null>(null);
  const [scale, setScale] = useState(1.0);
  const [animationType, setAnimationType] = useState('none');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const compileImageToMind = async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const img = new Image();
        img.onload = async () => {
          try {
            // @ts-ignore
            const compiler = new window.MINDAR.IMAGE.Compiler();
            await compiler.compileImageTargets([img], () => {});
            const exportedBuffer = await compiler.exportData();
            resolve(new Blob([exportedBuffer], { type: 'application/octet-stream' }));
          } catch (err) { reject(err); }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetFile || !displayFile) {
      setErrorMessage('マーカーになる画像と、浮かび上がる画像の両方をアップロードしてください。');
      setStatus('error');
      return;
    }

    setStatus('submitting');
    setErrorMessage('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('ログインが必要です。');

      const hashId = uuidv4().replace(/-/g, '').substring(0, 16);
      const basePath = `${user.id}/${hashId}`;

      const mindBlob = await compileImageToMind(targetFile);
      const targetExt = targetFile.name.split('.').pop() || 'jpg';
      const targetPath = `${basePath}/target.${targetExt}`;
      const mindPath = `${basePath}/target.mind`;
      const displayExt = displayFile.name.split('.').pop() || 'jpg';
      const displayPath = `${basePath}/display.${displayExt}`;

      const uploads = await Promise.all([
        supabase.storage.from('user_ar_assets').upload(targetPath, targetFile),
        supabase.storage.from('user_ar_assets').upload(mindPath, mindBlob),
        supabase.storage.from('user_ar_assets').upload(displayPath, displayFile),
      ]);
      const uploadError = uploads.find((u) => u.error)?.error;
      if (uploadError) throw uploadError;

      const { data: item, error: itemError } = await supabase
        .from('ar_items')
        .insert({
          owner_id: user.id,
          hash_id: hashId,
          title: title || null,
          status: 'published',
          moderation_status: 'pending',
          ar_mode: 'mindar',
          target_image_path: targetPath,
          mind_file_path: mindPath,
          object_scale: scale,
          animation_type: animationType,
        })
        .select()
        .single();
      if (itemError) throw itemError;

      const { error: assetError } = await supabase.from('ar_item_assets').insert({
        ar_item_id: item.id,
        asset_type: 'image',
        storage_path: displayPath,
        sort_order: 0,
      });
      if (assetError) throw assetError;

      router.push('/studio');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'エラーが発生しました。');
      setStatus('error');
    }
  };

  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/mind-ar@1.2.2/dist/mindar-image.prod.js" strategy="lazyOnload" />
      <div className="min-h-screen bg-gray-50 p-6 md:p-10 text-gray-800">
        <div className="max-w-lg mx-auto bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h1 className="text-xl font-bold mb-1">新しいARを作る</h1>
          <p className="text-xs text-gray-400 mb-6">
            作成したARは、運営の確認（審査）が完了するまで一般には公開されません。
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">タイトル（任意）</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border p-2 rounded" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">マーカーになる画像（カメラにかざす写真）</label>
              <input required type="file" accept="image/png, image/jpeg" onChange={(e) => setTargetFile(e.target.files?.[0] || null)} className="w-full border p-2 rounded" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">浮かび上がる画像</label>
              <input required type="file" accept="image/png, image/jpeg" onChange={(e) => setDisplayFile(e.target.files?.[0] || null)} className="w-full border p-2 rounded" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">サイズ倍率</label>
              <input type="number" step="0.1" min="0.1" max="5" value={scale} onChange={(e) => setScale(Number(e.target.value))} className="w-full border p-2 rounded" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">アニメーション</label>
              <select value={animationType} onChange={(e) => setAnimationType(e.target.value)} className="w-full border p-2 rounded">
                <option value="none">なし</option>
                <option value="pulse">ふわふわ</option>
                <option value="float">浮遊</option>
                <option value="spin">スピン</option>
                <option value="fade">点滅</option>
              </select>
            </div>

            {status === 'error' && <p className="text-red-600 text-xs">{errorMessage}</p>}

            <button
              type="submit"
              disabled={status === 'submitting'}
              className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white p-3 rounded font-bold transition"
            >
              {status === 'submitting' ? '作成中...（マーカー解析に数十秒かかります）' : '作成する'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
