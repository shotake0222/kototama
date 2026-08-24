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
  const [imageUrl, setImageUrl] = useState<string | null>(null);
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
        // UID または 旧ハッシュID の両方で検索できるように or句 を使用（互換性担保）
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

        // 処理済み画像があれば優先、なければオリジナル画像を取得
        const imgData = data.order_images?.[0];
        const path = imgData?.processed_image_url || imgData?.original_image_url;
        
        if (path) {
          // テンプレート画像かどうかでURLのプレフィックスを判定（パスが直接保存されている前提）
          const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ar_images/${path}`;
          setImageUrl(url);
        }
        
        if (data.object_scale) {
          setScale(data.object_scale);
        }
      } catch (err) {
        console.error(err);
        setError('通信エラーが発生しました。電波の良い場所で再度お試しください。');
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [uid, supabase]);

  // ローディング画面
  if (loading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-900 text-white z-50 font-sans">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500 mb-4"></div>
        <p>ARデータを読み込み中...</p>
      </div>
    );
  }

  // エラー画面
  if (error || !imageUrl) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-900 text-white p-8 text-center z-50 font-sans">
        <div>
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-rose-400 font-bold leading-relaxed">{error || '画像データが見つかりません。'}</p>
        </div>
      </div>
    );
  }

  // Next.js（React）環境で A-Frame（AR.js）の独自タグによるエラーを防ぐため、HTMLとして直接挿入
  // 将来 MindAR に切り替える時は、ここの arHtml の中身を MindAR 用に書き換えるだけで済みます！
  const arHtml = `
    <a-scene embedded arjs="trackingMethod: best; sourceType: webcam; debugUIEnabled: false;">
      <a-marker preset="hiro">
        <a-image 
          src="${imageUrl}" 
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
      {/* AR.js 必須スクリプトの読み込み */}
      <Script src="https://aframe.io/releases/1.2.0/aframe.min.js" strategy="beforeInteractive" />
      <Script src="https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js" strategy="beforeInteractive" />
      
      {/* ARカメラ描画エリア */}
      <div 
        style={{ margin: 0, overflow: 'hidden', width: '100vw', height: '100vh', backgroundColor: '#000' }} 
        dangerouslySetInnerHTML={{ __html: arHtml }} 
      />
    </>
  );
}

// Next.jsの仕様上、useSearchParams を使うコンポーネントは Suspense で囲む必要があります
export default function ARPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 flex items-center justify-center bg-gray-900 text-white z-50 font-sans">
        システム準備中...
      </div>
    }>
      <ARViewer />
    </Suspense>
  );
}