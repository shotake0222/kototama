'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import Script from 'next/script';

export default function ARScene({ params }: { params: { hash: string } }) {
  const supabase = createClient();
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [templateUrl, setTemplateUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchARData = async () => {
      const { data: order, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_images ( image_url ),
          templates ( object_url )
        `)
        .eq('hash_id', params.hash)
        .single();

      if (order) {
        if (order.order_images && order.order_images.length > 0) {
          const { data: mediaData } = supabase.storage
            .from('ar_images')
            .getPublicUrl(order.order_images[0].image_url);
          setMediaUrl(mediaData.publicUrl);
        }

        if (order.templates && order.templates.object_url) {
          const { data: tplData } = supabase.storage
            .from('templates')
            .getPublicUrl(order.templates.object_url);
          setTemplateUrl(tplData.publicUrl);
        }
      }
      setLoading(false);
    };

    fetchARData();
  }, [params.hash, supabase]);

  if (loading) return <div className="p-8 text-center">読み込み中...</div>;
  if (!mediaUrl && !templateUrl) return <div className="p-8 text-center">データが見つかりません。</div>;

  const isVideo = mediaUrl?.match(/\.(mp4|webm|mov)$/i);
  const isTemplate3D = templateUrl?.match(/\.(glb|gltf)$/i);

  // エラー原因だったバッククォートの入れ子を避け、安全なダブルクォーテーションの結合に変更
  const aframeHtml = `
    <a-scene embedded arjs="sourceType: webcam; debugUIEnabled: false;" style="height: 100vh; width: 100vw;">
      <a-assets>
        ${mediaUrl ? 
          (isVideo 
            ? "<video id='user-media' src='" + mediaUrl + "' autoplay loop muted playsinline crossorigin='anonymous'></video>"
            : "<img id='user-media' src='" + mediaUrl + "' crossorigin='anonymous' />") 
          : ""}
        
        ${templateUrl ? 
          (isTemplate3D 
            ? "<a-asset-item id='template-model' src='" + templateUrl + "'></a-asset-item>" 
            : "<img id='template-image' src='" + templateUrl + "' crossorigin='anonymous' />") 
          : ""}
      </a-assets>
      
      <a-marker type="pattern" url="/markers/custom.patt">
        ${mediaUrl ? 
          (isVideo 
            ? "<a-video src='#user-media' position='0 0.1 0' rotation='-90 0 0' width='2' height='1.5'></a-video>"
            : "<a-image src='#user-media' position='0 0.1 0' rotation='-90 0 0' width='2' height='1.5'></a-image>") 
          : ""}

        ${templateUrl ? 
          (isTemplate3D 
            ? "<a-entity gltf-model='#template-model' position='0 0 0' scale='1 1 1'></a-entity>"
            : "<a-image src='#template-image' position='0 0 0' rotation='-90 0 0' width='3' height='2.5'></a-image>")
          : ""}
      </a-marker>

      <a-entity camera></a-entity>
    </a-scene>
  `;

  return (
    <>
      <Script src="https://aframe.io/releases/1.4.2/aframe.min.js" strategy="beforeInteractive" />
      <Script src="https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js" strategy="beforeInteractive" />
      
      <div 
        style={{ width: '100vw', height: '100vh', margin: 0, overflow: 'hidden' }}
        dangerouslySetInnerHTML={{ __html: aframeHtml }}
      />
    </>
  );
}