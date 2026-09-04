import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';

// 重要: このServer ComponentはSupabaseへのfetchを毎リクエスト実行する必要がある。
// Next.jsはデフォルトで（cookies()/headers()等を使わないページの）fetchを
// ビルド時にキャッシュ・静的化しようとするため、これを付けないと
// 「最初にアクセスされたhash（または存在しないhash）の結果」がそのまま
// 他の全hashに対しても返ってしまうバグになる。
export const dynamic = 'force-dynamic';

// ユーザー基準CMSで作成されたARの公開ビューア。
// 既存の /ar/page.tsx（物理商品・ordersテーブル用）とは完全に独立した実装にしている
// （設計ドキュメント通り、まずは別ルートとして安全に追加し、安定してから
// 共通化を検討する）。
//
// Server Componentとして実装し、user_ar_assets（非公開バケット）のファイルは
// 署名付きURL（createSignedUrl）で配布する。RLSポリシー（005番migration）で
// 「status='published' かつ moderation_status='approved'」の行だけが
// anonキーから参照できるようにしてあるため、それ以外のARはここで404になる。
//
// asset_type によって image / video / model の3種類を描画する
// （Phase 2で動画、Phase 3で3Dモデルに対応）。

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ANIMATION_ATTR: Record<string, (scale: number) => string> = {
  none: () => '',
  pulse: (s) => `animation="property: scale; from: ${s} ${s} ${s}; to: ${s * 1.15} ${s * 1.15} ${s * 1.15}; dur: 2000; dir: alternate; loop: true; easing: easeInOutSine;"`,
  float: () => 'animation="property: position; from: 0 0 0; to: 0 0 0.5; dur: 2500; dir: alternate; loop: true; easing: easeInOutSine;"',
  spin: () => 'animation="property: rotation; from: 0 0 0; to: 0 0 360; dur: 8000; loop: true; easing: linear;"',
  fade: () => 'animation="property: material.opacity; from: 1.0; to: 0.2; dur: 1500; dir: alternate; loop: true; easing: easeInOutSine;" transparent="true"',
};

export default async function StudioViewerPage({ params }: { params: { hash: string } }) {
  const { data: item } = await supabase
    .from('ar_items')
    .select('*, ar_item_assets(*)')
    .eq('hash_id', params.hash)
    .eq('status', 'published')
    .eq('moderation_status', 'approved')
    .maybeSingle();

  if (!item) notFound();

  const asset = item.ar_item_assets?.[0];
  if (!asset || !item.target_image_path || !item.mind_file_path) notFound();

  const [{ data: mindSigned }, { data: displaySigned }] = await Promise.all([
    supabase.storage.from('user_ar_assets').createSignedUrl(item.mind_file_path, 60 * 30),
    supabase.storage.from('user_ar_assets').createSignedUrl(asset.storage_path, 60 * 30),
  ]);

  if (!mindSigned?.signedUrl || !displaySigned?.signedUrl) notFound();

  // 閲覧数のインクリメント（失敗しても表示自体には影響させない、ベストエフォート）
  await supabase
    .from('ar_items')
    .update({ view_count: (item.view_count || 0) + 1 })
    .eq('id', item.id)
    .then(() => {}, () => {});

  const assetType: 'image' | 'video' | 'model' = asset.asset_type || 'image';
  const finalScale = (item.object_scale || 1.0) * 4.0;
  // 動画・3Dモデルにはアニメーション属性を適用しない（Phase 2/3ではひとまず画像のみ対応の範囲。
  // /studio/new側でもUI上disabledにしている）
  const animationAttribute = assetType === 'image' ? (ANIMATION_ATTR[item.animation_type] || ANIMATION_ATTR.none)(finalScale) : '';

  let contentHtml = '';
  if (assetType === 'video') {
    // iOSでも自動再生できるよう muted + playsinline を必須にし、マーカー検出時にのみ再生する。
    contentHtml = `
    <a-assets>
      <video id="ar-video" src="${displaySigned.signedUrl}" crossorigin="anonymous" loop muted playsinline webkit-playsinline preload="auto"></video>
    </a-assets>
    <a-entity id="target" mindar-image-target="targetIndex: 0">
      <a-video src="#ar-video" position="0 0 0" scale="${finalScale} ${finalScale} ${finalScale}" rotation="0 0 0"></a-video>
    </a-entity>
    <script>
      const targetEl = document.querySelector('#target');
      const videoEl = document.querySelector('#ar-video');
      targetEl.addEventListener('targetFound', () => { videoEl.play().catch(() => {}); });
      targetEl.addEventListener('targetLost', () => { videoEl.pause(); });
    </script>`;
  } else if (assetType === 'model') {
    const metadata = asset.metadata || {};
    const offset = Array.isArray(metadata.offset) ? metadata.offset : [0, 0, 0];
    const normalizedScale = typeof metadata.normalizedScale === 'number' ? metadata.normalizedScale : 1;
    const modelScale = normalizedScale * finalScale;
    contentHtml = `
    <a-entity id="target" mindar-image-target="targetIndex: 0">
      <a-entity position="0 0 0" scale="${modelScale} ${modelScale} ${modelScale}">
        <a-entity gltf-model="url(${displaySigned.signedUrl})" position="${offset[0]} ${offset[1]} ${offset[2]}"></a-entity>
      </a-entity>
    </a-entity>`;
  } else {
    contentHtml = `
    <a-assets>
      <img id="ar-image" crossorigin="anonymous" src="${displaySigned.signedUrl}">
    </a-assets>
    <a-entity id="target" mindar-image-target="targetIndex: 0">
      <a-image src="#ar-image" position="0 0 0" scale="${finalScale} ${finalScale} ${finalScale}" rotation="0 0 0" ${animationAttribute}></a-image>
    </a-entity>`;
  }

  const arHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <script src="https://aframe.io/releases/1.2.0/aframe.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mind-ar@1.2.2/dist/mindar-image-aframe.prod.js"></script>
  <style>body { margin: 0; overflow: hidden; background-color: transparent; }</style>
</head>
<body>
  <a-scene
    mindar-image="imageTargetSrc: ${mindSigned.signedUrl}; autoStart: true;"
    embedded
    color-space="sRGB"
    renderer="colorManagement: true, physicallyCorrectLights"
    vr-mode-ui="enabled: false"
    device-orientation-permission-ui="enabled: false"
  >
    <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>
    ${contentHtml}
  </a-scene>
</body>
</html>
  `;

  return (
    <iframe
      srcDoc={arHtml}
      style={{ width: '100vw', height: '100vh', border: 'none', position: 'fixed', top: 0, left: 0 }}
      allow="camera; gyroscope; accelerometer; magnetometer"
      title="AR Viewer"
    />
  );
}
