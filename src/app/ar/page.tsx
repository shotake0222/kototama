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
  
  const [arMode, setArMode] = useState<'hiro' | 'mindar'>('hiro');
  const [animationType, setAnimationType] = useState('none');
  const [mindFileUrl, setMindFileUrl] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [scale, setScale] = useState(1.0);
  
  const [aframeLoaded, setAframeLoaded] = useState(false);
  const [arjsLoaded, setArjsLoaded] = useState(false);
  
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

        setArMode(data.ar_mode === 'mindar' ? 'mindar' : 'hiro');
        setAnimationType(data.animation_type || 'none');
        
        const storageBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ar_images/`;
        if (data.mind_file_url) setMindFileUrl(storageBase + data.mind_file_url);

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

  const isArReady = aframeLoaded && arjsLoaded;

  // 💡 AR.js のカメラ映像(videoタグ)が画面外に飛ばないように強制するCSS
  const globalCss = `
    body, html {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: transparent !important;
    }
    #arjs-video {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
      z-index: -2 !important;
    }
    .a-canvas {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      z-index: 10 !important;
    }
  `;

  if (arMode === 'hiro') {
    const arHtml = `
      <a-scene embedded arjs="trackingMethod: best; sourceType: webcam; debugUIEnabled: false;" renderer="logarithmicDepthBuffer: true;">
        <a-marker preset="hiro">
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
        <style dangerouslySetInnerHTML={{ __html: globalCss }} />
        
        <Script 
          src="https://aframe.io/releases/1.2.0/aframe.min.js" 
          strategy="afterInteractive" 
          onLoad={() => setAframeLoaded(true)} 
        />
        {aframeLoaded && (
          <Script 
            src="https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js" 
            strategy="afterInteractive" 
            onLoad={() => setArjsLoaded(true)} 
          />
        )}
        
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 1, overflow: 'hidden' }}>
          {isArReady ? (
            <div dangerouslySetInnerHTML={{ __html: arHtml }} style={{ width: '100%', height: '100%' }} />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-gray-900 z-50">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500 mb-4"></div>
              <p>カメラを起動中...</p>
            </div>
          )}
        </div>
      </>
    );
  }

  if (arMode === 'mindar') {
    const targetSrc = mindFileUrl || ''; 
    const mindArHtml = `
      <a-scene mindar-image="imageTargetSrc: ${targetSrc};" color-space="sRGB" renderer="colorManagement: true, physicallyCorrectLights" vr-mode-ui="enabled: false" device-orientation-permission-ui="enabled: false">
        <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>
        <a-entity mindar-image-target="targetIndex: 0">
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
        <style dangerouslySetInnerHTML={{ __html: globalCss }} />
        
        <Script 
          src="https://aframe.io/releases/1.3.0/aframe.min.js" 
          strategy="afterInteractive" 
          onLoad={() => setAframeLoaded(true)} 
        />
        {aframeLoaded && (
          <Script 
            src="https://cdn.jsdelivr.net/npm/mind-ar@1.2.2/dist/mindar-image-aframe.prod.js" 
            strategy="afterInteractive" 
            onLoad={() => setArjsLoaded(true)} 
          />
        )}
        
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 1, overflow: 'hidden' }}>
          {isArReady ? (
            <div dangerouslySetInnerHTML={{ __html: mindArHtml }} style={{ width: '100%', height: '100%' }} />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-gray-900 z-50">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500 mb-4"></div>
              <p>カメラを起動中...</p>
            </div>
          )}
        </div>
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