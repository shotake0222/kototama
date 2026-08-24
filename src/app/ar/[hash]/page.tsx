'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import Script from 'next/script';

export default function ARScene({ params }: { params: { hash: string } }) {
  const supabase = createClient();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchARData = async () => {
      // ハッシュIDから受注データと関連画像を取得
      const { data: order, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_images ( image_url ),
          templates ( object_url )
        `)
        .eq('hash_id', params.hash)
        .single();

      if (order && order.order_images?.[0]) {
        // Storageから画像の公開URLを取得
        const { data } = supabase.storage
          .from('ar_images')
          .getPublicUrl(order.order_images[0].image_url);
        
        setImageUrl(data.publicUrl);
      }
      setLoading(false);
    };

    fetchARData();
  }, [params.hash, supabase]);

  if (loading) return <div className="p-8 text-center">読み込み中...</div>;
  if (!imageUrl) return <div className="p-8 text-center">データが見つかりません。</div>;

  // A-Frameのコードを文字列として定義
  const aframeHtml = `
    <a-scene embedded style="height: 100vh; width: 100vw;">
      <a-assets>
        <img id="user-image" src="${imageUrl}" crossorigin="anonymous" />
      </a-assets>
      
      <!-- カメラ -->
      <a-entity camera look-controls position="0 1.6 0"></a-entity>
      
      <!-- ユーザーがアップロードした画像を表示 -->
      <a-image src="#user-image" position="0 1.5 -3" width="2" height="1.5"></a-image>
      
      <!-- 背景（環境） -->
      <a-sky color="#ECECEC"></a-sky>
    </a-scene>
  `;

  return (
    <>
      <Script src="https://aframe.io/releases/1.4.2/aframe.min.js" strategy="beforeInteractive" />
      <div 
        style={{ width: '100vw', height: '100vh', margin: 0, overflow: 'hidden' }}
        dangerouslySetInnerHTML={{ __html: aframeHtml }}
      />
    </>
  );
}