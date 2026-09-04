'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import Script from 'next/script';
import { createClient } from '@/utils/supabase/client';

// ユーザーが自分でARを作成する画面。
// Phase 1で画像のみ対応していたところに、Phase 2（動画）・Phase 3（3Dモデル）を追加。
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

type DisplayType = 'image' | 'video' | 'model';

const MAX_SIZE_BYTES: Record<DisplayType, number> = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  model: 20 * 1024 * 1024,
};

const ACCEPT: Record<DisplayType, string> = {
  image: 'image/png, image/jpeg, image/webp',
  video: 'video/mp4',
  model: '.glb,.gltf,model/gltf-binary',
};

// 🐛 バグ修正（デバッグフェーズ）: 以前はUMD版の three.min.js を <script> タグで
// 読み込んだ後、続けて examples/js/loaders/GLTFLoader.js を <script> タグで
// 読み込んでいたが、three.js は r150（npmのバージョン表記で 0.150.0）以降、
// examples/js 配下の非ESM（レガシー）ローダー群を完全に削除しており、
// examples/js/loaders/GLTFLoader.js は現在ピン留めしているバージョン
// （0.160.0）には存在しない（読み込みが404で失敗する）。このため
// これまで3Dモデルをアップロードするたびに正規化処理が必ず失敗し、
// UIでは「大きさ・位置は自動で調整される」と案内しているにもかかわらず、
// 常に無言で正規化なし（handleSubmit内のcatchでエラーを握りつぶし、
// metadataを空のまま登録）にフォールバックしていた。
// 現在配布されているのはESM版のローダーのみのため、jsDelivrの `+esm`
// （内部の import 文をCDN上のURLに解決した状態でESMをそのまま配信して
// くれる機能）を使い、ブラウザネイティブの動的importで読み込む。
// webpackIgnore コメントは、webpack（Next.jsのバンドラ）が実行時URLの
// import() をビルド時に解決しようとして失敗するのを防ぐためのもの。
const THREE_VERSION = '0.160.0';
type ThreeModules = { THREE: any; GLTFLoader: any };
let threeLoaderPromise: Promise<ThreeModules> | null = null;
function loadThreeAndGltfLoader(): Promise<ThreeModules> {
  if (threeLoaderPromise) return threeLoaderPromise;
  threeLoaderPromise = (async () => {
    const THREE: any = await import(
      /* webpackIgnore: true */ `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/+esm`
    );
    const gltfModule: any = await import(
      /* webpackIgnore: true */ `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/loaders/GLTFLoader.js/+esm`
    );
    return { THREE, GLTFLoader: gltfModule.GLTFLoader };
  })();
  return threeLoaderPromise;
}

// アップロードされたglTF/GLBのバウンディングボックスを計算し、
// 「中心を原点に、最大辺が1.0になる」ための正規化パラメータを返す。
// ユーザーが作った3Dモデルは原点位置・スケールがバラバラなため、
// これをやらないとAR上での見え方がモデルごとにバラついてしまう。
async function computeModelNormalization(file: File): Promise<{ offset: [number, number, number]; normalizedScale: number }> {
  const { THREE, GLTFLoader } = await loadThreeAndGltfLoader();
  const objectUrl = URL.createObjectURL(file);
  try {
    const loader = new GLTFLoader();
    const gltf: any = await new Promise((resolve, reject) => {
      loader.load(objectUrl, resolve, undefined, reject);
    });
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    return {
      offset: [-center.x, -center.y, -center.z],
      normalizedScale: 1 / maxDim,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function StudioNewItemPage() {
  const supabase = createClient();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [displayType, setDisplayType] = useState<DisplayType>('image');
  const [displayFile, setDisplayFile] = useState<File | null>(null);
  const [scale, setScale] = useState(1.0);
  const [animationType, setAnimationType] = useState('none');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [progressLabel, setProgressLabel] = useState('作成する');

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

  const handleDisplayFileChange = (file: File | null) => {
    if (file && file.size > MAX_SIZE_BYTES[displayType]) {
      const maxMb = Math.round(MAX_SIZE_BYTES[displayType] / (1024 * 1024));
      alert(`ファイルサイズが大きすぎます（上限 ${maxMb}MB）。`);
      return;
    }
    setDisplayFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetFile || !displayFile) {
      setErrorMessage('マーカーになる画像と、表示するコンテンツの両方をアップロードしてください。');
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

      setProgressLabel('マーカーを解析中...（数十秒かかります）');
      const mindBlob = await compileImageToMind(targetFile);
      const targetExt = targetFile.name.split('.').pop() || 'jpg';
      const targetPath = `${basePath}/target.${targetExt}`;
      const mindPath = `${basePath}/target.mind`;

      // 表示コンテンツの種類に応じたメタデータ（3Dモデルのみ正規化情報を持つ）
      let metadata: Record<string, any> = {};
      if (displayType === 'model') {
        setProgressLabel('3Dモデルを解析中...');
        try {
          const norm = await computeModelNormalization(displayFile);
          metadata = { offset: norm.offset, normalizedScale: norm.normalizedScale };
        } catch (err) {
          console.warn('3Dモデルの解析に失敗しました。正規化なしで登録します。', err);
        }
      }

      setProgressLabel('アップロード中...');
      const displayExt = (displayFile.name.split('.').pop() || (displayType === 'video' ? 'mp4' : displayType === 'model' ? 'glb' : 'jpg')).toLowerCase();
      const displayPath = `${basePath}/display.${displayExt}`;

      // 🐛 バグ修正（デバッグフェーズ）: これまでアップロード時のMIMEタイプを
      // File.typeブラウザ判定に任せていたが、.glb/.gltfはOS・ブラウザによって
      // 空文字列など不定の値になることがあり、006番migrationで設定した
      // バケットのallowed_mime_typesと一致せずアップロード自体が拒否される
      // ケースがあった（3Dモデルの種類によっては再現しないため気づきにくい）。
      // 拡張子から明示的にcontentTypeを指定し、ブラウザの判定に依存しないようにする。
      const displayContentType =
        displayType === 'video'
          ? 'video/mp4'
          : displayType === 'model'
          ? (displayExt === 'gltf' ? 'model/gltf+json' : 'model/gltf-binary')
          : displayFile.type || 'image/jpeg';

      const uploads = await Promise.all([
        supabase.storage.from('user_ar_assets').upload(targetPath, targetFile, { contentType: targetFile.type || 'image/jpeg' }),
        supabase.storage.from('user_ar_assets').upload(mindPath, mindBlob, { contentType: 'application/octet-stream' }),
        supabase.storage.from('user_ar_assets').upload(displayPath, displayFile, { contentType: displayContentType }),
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
        asset_type: displayType,
        storage_path: displayPath,
        sort_order: 0,
        metadata,
      });
      if (assetError) throw assetError;

      router.push('/studio');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'エラーが発生しました。');
      setStatus('error');
      setProgressLabel('作成する');
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
              <label className="block text-sm font-medium mb-1">表示コンテンツの種類</label>
              <div className="flex gap-2">
                {(['image', 'video', 'model'] as DisplayType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setDisplayType(t); setDisplayFile(null); }}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold border transition ${displayType === t ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-gray-500 border-gray-200'}`}
                  >
                    {t === 'image' ? '画像' : t === 'video' ? '動画' : '3Dモデル'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {displayType === 'image' ? '浮かび上がる画像' : displayType === 'video' ? '再生する動画（MP4、上限50MB）' : '表示する3Dモデル（glTF/GLB、上限20MB）'}
              </label>
              <input
                required
                type="file"
                accept={ACCEPT[displayType]}
                onChange={(e) => handleDisplayFileChange(e.target.files?.[0] || null)}
                className="w-full border p-2 rounded"
              />
              {displayType === 'video' && (
                <p className="text-xs text-gray-400 mt-1">iOSでも自動再生できるよう、音声なし（ミュート）で再生されます。</p>
              )}
              {displayType === 'model' && (
                <p className="text-xs text-gray-400 mt-1">モデルの大きさ・位置は自動で調整されます（下の「サイズ倍率」でさらに微調整できます）。</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">サイズ倍率</label>
              <input type="number" step="0.1" min="0.1" max="5" value={scale} onChange={(e) => setScale(Number(e.target.value))} className="w-full border p-2 rounded" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">アニメーション{displayType !== 'image' && <span className="text-gray-400 font-normal">（動画・3Dモデルには適用されません）</span>}</label>
              <select value={animationType} onChange={(e) => setAnimationType(e.target.value)} disabled={displayType !== 'image'} className="w-full border p-2 rounded disabled:bg-gray-100 disabled:text-gray-400">
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
              {status === 'submitting' ? progressLabel : '作成する'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
