'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import Script from 'next/script';

export default function ARScene({ params }: { params: { hash: string } }) {
  const supabase = createClient();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [templateUrl, setTemplateUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchARData = async () => {
      // ハッシュIDから受注データ、関連画像、および紐づけられたテンプレート情報を取得
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
        // 1. ユーザーがアップロードした（または管理者が差し替えた）画像
        if (order.order_images && order.order_images.length > 0) {
          const { data: imgData } = supabase.storage
            .from('ar_images')
            .getPublicUrl(order.order_images[0].image_url);
          setImageUrl(imgData.publicUrl);
        }

        // 2. 管理者がダッシュボードで割り当てたテンプレート（3Dモデル/画像）
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
  if (!imageUrl && !templateUrl) return <div className="p-8 text-center">データが見つかりません。</div>;

  // テンプレートの拡張子を判定し、3Dモデルか2D画像かを識別（簡易判定）
  const isTemplate3D = templateUrl?.match(/\.(glb|gltf)$/i);

  // A-Frameのコードを文字列として構築
  const aframeHtml = `
    <a-scene embedded style="height: 100vh; width: 100vw;">
      <a-assets>
        ${imageUrl ? `<img id="user-image" src="${imageUrl}" crossorigin="anonymous" />` : ''}
        ${templateUrl ? 
          (isTemplate3D 
            ? `<a-asset-item id="template-model" src="${templateUrl}"></a-asset-item>` 
            : `<img id="template-image" src="${templateUrl}" crossorigin="anonymous" />`) 
          : ''}
      </a-assets>
      
      <!-- カメラ -->
      <a-entity camera look-controls position="0 1.6 0"></a-entity>
      
      <!-- ユーザー画像（左側に配置） -->
      ${imageUrl ? `<a-image src="#user-image" position="-1 1.5 -3" width="1.5" height="1.5"></a-image>` : ''}
      
      <!-- テンプレート（右側に配置。3Dモデルか画像かでタグを出し分け） -->
      ${templateUrl ? 
        (isTemplate3D 
          ? `<a-entity gltf-model="#template-model" position="1 0.5 -3" scale="1 1 1"></a-entity>`
          : `<a-image src="#template-image" position="1 1.5 -3" width="1.5" height="1.5"></a-image>`)
        : ''}

      <!-- 背景（環境） -->
      <a-sky color="#ECECEC"></a-sky>
    </a-scene>
  `;

  return (
    <>
      {/* A-Frameのライブラリ読み込み */}
      <Script src="https://aframe.io/releases/1.4.2/aframe.min.js" strategy="beforeInteractive" />
      <div 
        style={{ width: '100vw', height: '100vh', margin: 0, overflow: 'hidden' }}
        dangerouslySetInnerHTML={{ __html: aframeHtml }}
      />
    </>
  );
}