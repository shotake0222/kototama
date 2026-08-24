'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import Script from 'next/script';

function ARViewer() {
  const searchParams = useSearchParams();
  const uid = searchParams.get('uid');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // AR描画に必要なデータ群
  const [arMode, setArMode] = useState<'hiro' | 'mindar'>('hiro'); // 💡将来の分岐用
  const [animationType, setAnimationType] = useState('none');
  const [mindFileUrl, setMindFileUrl] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]); // 💡アルバム用に複数枚受け取れるよう配列化
  const [scale, setScale] = useState(1.0);
  
  const supabase = createClient();

  useEffect(() => {
    if (!uid) {
      setError('NFCタグの情報が読み取れません。もう一度タッチしてください。');
      setLoading(false);
      return;
    }

    const fetchOrder = async () => {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_images(*)')
          .or(`nfc_uid.eq.${uid},hash_id.eq.${uid}`)
          .single();

        if (error || !data) {
          setError('データが見つかりません。未登録のタグか、表示期間が終了しています。');
          setLoading(false);
          return;
        }

        // 💡 将来の拡張データの取得（デフォルト値も設定）
        setArMode(data.ar_mode === 'mindar' ? 'mindar' : 'hiro');
        setAnimationType(data.animation_type || 'none');
        
        const storageBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ar_images/`;
        if (data.mind_file_url) setMindFileUrl(storageBase + data.mind_file_url);

        // 💡 アルバム機能を見据えて、登録されている画像をすべて配列に格納
        const imageUrls = data.order_images
          .map((img: any) => img.processed_image_url || img.original_image_url)
          .filter(Boolean)
          .map((path: string) => storageBase + path);
        
        setImages(imageUrls);
        if (data.object_scale) setScale(data.object_scale);
        
      } catch (err) {
        console.error(err);
        setError('通信エラーが発生しました。');
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [uid, supabase]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-900 text-white z-50 font-sans">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500 mb-4"></div>
        <p>ARデータを読み込み中...</p>
      </div>
    );
  }

  if (error || images.length === 0) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-900 text-white p-8 text-center z-50 font-sans">
        <div><div className="text-4xl mb-4">⚠️</div><p className="text-rose-400 font-bold leading-relaxed">{error || '画像データが見つかりません。'}</p></div>
      </div>
    );
  }

  // ====================================================
  // 💡 【モード1】従来のAR.js（hiroマーカー）モード
  // ====================================================
  if (arMode === 'hiro') {
    const arHtml = `
      <a-scene embedded arjs="trackingMethod: best; sourceType: webcam; debugUIEnabled: false;">
        <a-marker preset="hiro">
          <!-- TODO: アルバムアニメーション実装時はここに複数タグやA-Frameアニメーションを記述 -->
          <a-image 
            src="${images[0]}" 
            position="0 0.5 0" 
            rotation="-90 0 0" 
            scale="${scale * 2} ${scale * 2} ${scale * 2}"
          ></a-image>
        </a-marker>
        <a-entity camera></a-entity>
      </a-scene>
    `;

    return (
      <>
        <Script src="https://aframe.io/releases/1.2.0/aframe.min.js" strategy="beforeInteractive" />
        <Script src="https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js" strategy="beforeInteractive" />
        <div style={{ margin: 0, overflow: 'hidden', width: '100vw', height: '100vh', backgroundColor: '#000' }} dangerouslySetInnerHTML={{ __html: arHtml }} />
      </>
    );
  }

  // ====================================================
  // 💡 【モード2】将来の MindAR（イメージトラッキング）モード
  // ====================================================
  if (arMode === 'mindar') {
    // ※ mindFileUrl が必須になります（対象物の特徴点ファイル）
    const targetSrc = mindFileUrl || ''; 
    const mindArHtml = `
      <a-scene mindar-image="imageTargetSrc: ${targetSrc};" color-space="sRGB" renderer="colorManagement: true, physicallyCorrectLights" vr-mode-ui="enabled: false" device-orientation-permission-ui="enabled: false">
        <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>
        <a-entity mindar-image-target="targetIndex: 0">
          <!-- TODO: アルバムアニメーション実装時はここに複数タグやA-Frameアニメーションを記述 -->
          <a-image 
            src="${images[0]}" 
            position="0 0 0" 
            height="1" 
            width="1"
            scale="${scale} ${scale} ${scale}"
          ></a-image>
        </a-entity>
      </a-scene>
    `;

    return (
      <>
        {/* MindARはA-Frame v1.3.0以上が推奨です */}
        <Script src="https://aframe.io/releases/1.3.0/aframe.min.js" strategy="beforeInteractive" />
        <Script src="https://cdn.jsdelivr.net/npm/mind-ar@1.2.2/dist/mindar-image-aframe.prod.js" strategy="beforeInteractive" />
        <div style={{ margin: 0, overflow: 'hidden', width: '100vw', height: '100vh', backgroundColor: '#000' }} dangerouslySetInnerHTML={{ __html: mindArHtml }} />
      </>
    );
  }

  return null;
}

export default function ARPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-gray-900 text-white z-50">システム準備中...</div>}>
      <ARViewer />
    </Suspense>
  );
}