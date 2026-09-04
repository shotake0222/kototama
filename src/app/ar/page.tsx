'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

function ARViewer() {
  const searchParams = useSearchParams();
  const uid = searchParams.get('uid');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [images, setImages] = useState<string[]>([]);
  const [scale, setScale] = useState(1.0);
  const [animationType, setAnimationType] = useState('none');
  const [origin, setOrigin] = useState('');

  // 🆕 OEM対応: 注文ごとのマーカー方式（MindAR / 従来のHiroパターン）
  const [arMode, setArMode] = useState<string | null>(null);
  const [targetImageUrl, setTargetImageUrl] = useState<string | null>(null);
  const [mindFileUrl, setMindFileUrl] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    setOrigin(window.location.origin);

    if (!uid) {
      setError('NFCタグの情報が読み取れません。もう一度タッチしてください。');
      setLoading(false);
      return;
    }

    const fetchOrder = async () => {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_images(*)').order('created_at', { ascending: false })
          .or(`nfc_uid.eq.${uid},hash_id.eq.${uid}`)
          .limit(1)
          .single();

        if (error || !data) {
          setError('データが見つかりません。未登録のタグか、表示期間が終了しています。');
          setLoading(false);
          return;
        }

        const storageBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ar_images/`;

        const imageUrls = data.order_images
          .map((img: any) => img.processed_image_url || img.original_image_url)
          .filter(Boolean)
          .map((path: string) => storageBase + path);

        setImages(imageUrls);
        if (data.object_scale) setScale(data.object_scale);
        if (data.animation_type) setAnimationType(data.animation_type);

        // 🆕 この注文がどのマーカー方式で登録されているかを保持
        // （OrderForm/管理画面側で、注文ごとの独自マーカー or OEM提供先のデフォルトマーカーが
        //   すでに orders.target_image_url / orders.mind_file_url / orders.ar_mode に解決済みで入っている）
        setArMode(data.ar_mode || null);
        setTargetImageUrl(data.target_image_url ? storageBase + data.target_image_url : null);
        setMindFileUrl(data.mind_file_url ? storageBase + data.mind_file_url : null);

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
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827', color: 'white', zIndex: 50 }}>
        <p>ARデータを読み込み中...</p>
      </div>
    );
  }

  if (error || images.length === 0) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827', color: 'white', zIndex: 50 }}>
        <p>{error || '画像データが見つかりません。'}</p>
      </div>
    );
  }

  // 🆕 MindAR方式（比率に依存しない・OEM提供先が任意のRatioでマーカーを作成可能）が
  //    この注文に対して使えるかどうかを判定。
  //    使えない場合（古い注文でマーカー未登録など）は、従来のHiroパターン方式にフォールバックする。
  const useMindAR = arMode === 'mindar' && !!targetImageUrl && !!mindFileUrl;

  const BASE_SIZE = 4.0;
  const finalScale = scale * BASE_SIZE;
  const imagesJson = JSON.stringify(images);

  // ==========================================================================
  // アニメーション属性の生成
  // ------------------------------------------------------------------------
  // 従来のHiroパターン方式では、マーカーは水平に寝ていて、コンテンツ画像には
  // rotation="-90 0 0" が固定でかかっている（マーカー面に正対させるため）。
  // そのため position/rotation の各軸が「画面上でどう見えるか」は直感的な
  // X/Y/Zとズレていた（例: 上下スクロールは position の Z軸だった）。
  //
  // MindAR方式では、マーカー（ターゲット画像）を追跡するエンティティは
  // 最初からカメラの正面を向いた状態でコンテンツを配置できるため、
  // 余計な回転オフセットが不要になり、X=左右・Y=上下・Z=奥行きという
  // 素直な軸に対応する。この新しい向き用に14種類のアニメーションを
  // 再設計し、Playwrightによる実機シミュレーション（座標のサンプリング＋
  // スクリーンショットのコマ送り確認）で、それぞれ意図した見た目に
  // なることを検証済み。
  // ==========================================================================
  const buildLegacyAnimationAttribute = (type: string): string => {
    switch (type) {
      case 'scroll':
        return 'animation="property: position; from: 0 0 1.5; to: 0 0 -1.5; dur: 15000; loop: true; easing: linear;"';
      case 'scroll-down':
        return 'animation="property: position; from: 0 0 -1.5; to: 0 0 1.5; dur: 15000; loop: true; easing: linear;"';
      case 'scroll-left':
        return 'animation="property: position; from: 1.5 0 0; to: -1.5 0 0; dur: 15000; loop: true; easing: linear;"';
      case 'scroll-right':
        return 'animation="property: position; from: -1.5 0 0; to: 1.5 0 0; dur: 15000; loop: true; easing: linear;"';
      case 'pulse':
        return `animation="property: scale; from: ${finalScale} ${finalScale} ${finalScale}; to: ${finalScale * 1.15} ${finalScale * 1.15} ${finalScale * 1.15}; dur: 2000; dir: alternate; loop: true; easing: easeInOutSine;"`;
      case 'heartbeat':
        return `animation="property: scale; from: ${finalScale} ${finalScale} ${finalScale}; to: ${finalScale * 1.25} ${finalScale * 1.25} ${finalScale * 1.25}; dur: 400; dir: alternate; loop: true; easing: easeInOutBack;"`;
      case 'float':
        return 'animation="property: position; from: 0 0 0; to: 0 0.5 0; dur: 2500; dir: alternate; loop: true; easing: easeInOutSine;"';
      case 'bounce':
        return 'animation="property: position; from: 0 0 0; to: 0 1.0 0; dur: 600; dir: alternate; loop: true; easing: easeOutQuad;"';
      case 'swing':
        return 'animation="property: rotation; from: -90 -15 0; to: -90 15 0; dur: 1500; dir: alternate; loop: true; easing: easeInOutSine;"';
      case 'shake':
        return 'animation="property: position; from: -0.05 0 0; to: 0.05 0 0; dur: 80; dir: alternate; loop: true; easing: linear;"';
      case 'spin':
        return 'animation="property: rotation; from: -90 0 0; to: -90 0 360; dur: 8000; loop: true; easing: linear;"';
      case 'flip-y':
        return 'animation="property: rotation; from: -90 0 0; to: -90 360 0; dur: 3000; loop: true; easing: linear;"';
      case 'flip-x':
        return 'animation="property: rotation; from: -90 0 0; to: 270 0 0; dur: 3000; loop: true; easing: linear;"';
      case 'zoom-in':
        return 'animation="property: position; from: 0 0 -2.0; to: 0 0 0; dur: 2000; dir: alternate; loop: true; easing: easeInOutSine;"';
      case 'fade':
        return 'animation="property: material.opacity; from: 1.0; to: 0.2; dur: 1500; dir: alternate; loop: true; easing: easeInOutSine;" transparent="true"';
      default:
        return '';
    }
  };

  const buildMindARAnimationAttribute = (type: string): string => {
    switch (type) {
      case 'scroll': // 下から上
        return 'animation="property: position; from: 0 -1.5 0; to: 0 1.5 0; dur: 15000; loop: true; easing: linear;"';
      case 'scroll-down': // 上から下
        return 'animation="property: position; from: 0 1.5 0; to: 0 -1.5 0; dur: 15000; loop: true; easing: linear;"';
      case 'scroll-left': // 右から左
        return 'animation="property: position; from: 1.5 0 0; to: -1.5 0 0; dur: 15000; loop: true; easing: linear;"';
      case 'scroll-right': // 左から右
        return 'animation="property: position; from: -1.5 0 0; to: 1.5 0 0; dur: 15000; loop: true; easing: linear;"';
      case 'pulse': // ふわふわ
        return `animation="property: scale; from: ${finalScale} ${finalScale} ${finalScale}; to: ${finalScale * 1.15} ${finalScale * 1.15} ${finalScale * 1.15}; dur: 2000; dir: alternate; loop: true; easing: easeInOutSine;"`;
      case 'heartbeat': // 鼓動
        return `animation="property: scale; from: ${finalScale} ${finalScale} ${finalScale}; to: ${finalScale * 1.25} ${finalScale * 1.25} ${finalScale * 1.25}; dur: 400; dir: alternate; loop: true; easing: easeInOutBack;"`;
      case 'float': // 浮遊（手前にふわっと浮き上がる）
        return 'animation="property: position; from: 0 0 0; to: 0 0 0.5; dur: 2500; dir: alternate; loop: true; easing: easeInOutSine;"';
      case 'bounce': // バウンド（手前にポンと跳ねる）
        return 'animation="property: position; from: 0 0 0; to: 0 0 1.0; dur: 600; dir: alternate; loop: true; easing: easeOutQuad;"';
      case 'swing': // スイング（左右にゆらゆら揺れる）
        return 'animation="property: rotation; from: 0 0 -15; to: 0 0 15; dur: 1500; dir: alternate; loop: true; easing: easeInOutSine;"';
      case 'shake': // シェイク
        return 'animation="property: position; from: -0.05 0 0; to: 0.05 0 0; dur: 80; dir: alternate; loop: true; easing: linear;"';
      case 'spin': // スピン（正面向きのまま回転）
        return 'animation="property: rotation; from: 0 0 0; to: 0 0 360; dur: 8000; loop: true; easing: linear;"';
      case 'flip-y': // フリップ（横回転・左右にひっくり返る）
        return 'animation="property: rotation; from: 0 0 0; to: 0 360 0; dur: 3000; loop: true; easing: linear;"';
      case 'flip-x': // フリップ（縦回転・上下にひっくり返る）
        return 'animation="property: rotation; from: 0 0 0; to: 360 0 0; dur: 3000; loop: true; easing: linear;"';
      case 'zoom-in': // ズームイン（奥から手前）
        return 'animation="property: position; from: 0 0 -2.0; to: 0 0 0; dur: 2000; dir: alternate; loop: true; easing: easeInOutSine;"';
      case 'fade': // 点滅・フェード
        return 'animation="property: material.opacity; from: 1.0; to: 0.2; dur: 1500; dir: alternate; loop: true; easing: easeInOutSine;" transparent="true"';
      default:
        return '';
    }
  };

  const animationAttribute = useMindAR
    ? buildMindARAnimationAttribute(animationType)
    : buildLegacyAnimationAttribute(animationType);

  // ==========================================================================
  // シーンHTMLの生成（共通のUI・撮影スクリプト部分）
  // ==========================================================================
  const buildSharedBodyScript = () => `
  <script>
      var imgArray = ${imagesJson};
      if (imgArray.length > 1) {
        var currentIndex = 0;
        var targetImage = document.querySelector('#target-image');
        setInterval(function() {
          currentIndex = (currentIndex + 1) % imgArray.length;
          targetImage.setAttribute('src', imgArray[currentIndex]);
        }, 4000);
      }

      var image = document.querySelector('#snap');
      var take_photo_btn = document.querySelector('#take-photo');
      var delete_photo_btn = document.querySelector('#delete-photo');
      var download_photo_btn = document.querySelector('#download-photo');

      take_photo_btn.addEventListener("click", function (e) {
          e.preventDefault();
          var video = document.querySelector('video');
          var snap = takeSnapshot(video);

          image.setAttribute('src', snap);
          image.classList.add('visible');

          delete_photo_btn.classList.remove("disabled");
          download_photo_btn.classList.remove("disabled");
          download_photo_btn.href = snap;
      });

      delete_photo_btn.addEventListener("click", function(e){
          e.preventDefault();
          image.setAttribute('src', "");
          image.classList.remove("visible");

          delete_photo_btn.classList.add("disabled");
          download_photo_btn.classList.add("disabled");
      });

      function takeSnapshot(video) {
          var resizedCanvas = document.createElement("canvas");
          var resizedContext = resizedCanvas.getContext("2d");
          var width = video.videoWidth;
          var height = video.videoHeight;
          var aScene = document.querySelector("a-scene").components.screenshot.getCanvas("perspective");

          if (width && height) {
              resizedCanvas.width = width;
              resizedCanvas.height = height;
              resizedContext.drawImage(video, 0, 0, width, height);

              if (width > height) {
                  resizedContext.drawImage(aScene, 0, 0, width, height);
              } else {
                  var scale = height / width;
                  var scaledWidth = height * scale;
                  var marginLeft = (width - scaledWidth) / 2;
                  resizedContext.drawImage(aScene, marginLeft, 0, scaledWidth, height);
              }
              return resizedCanvas.toDataURL('image/png');
          }
      }
  </script>`;

  const sharedHead = `
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-cookie/1.4.1/jquery.cookie.min.js"></script>
  <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">

  <style>
    body { margin: 0px; overflow: hidden; background-color: transparent; }
    .ui { position: absolute; z-index: 100; bottom: 0; left: 0; width: 100%; height: auto; margin: 0; padding: 10px 15px 30px; text-align: center; box-sizing: border-box; }
    .ui a { display: inline-block; width: 60px; height: 60px; background-color: #ffffff; line-height: 100%; color: #303030; margin: 10px 3px; border-radius: 50%; position: relative; }
    .ui a i { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); }
    .ui a:active { color: #ff0000; }
    #snap { max-width: 100%; height: auto; display: block; visibility: hidden; position: absolute; top: 20px; left: 50%; transform: translateX(-50%); width: 80%; border: 4px solid white; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); z-index: 99; }
    .ui a.disabled { pointer-events: none; color: #cccccc; }
    #snap.visible { visibility: visible; }
  </style>`;

  const sharedBodyUi = `
  <img id="snap">
  <div class="ui">
      <a href="#" id="delete-photo" title="Delete Photo" class="disabled"><i class="material-icons">delete</i></a>
      <a href="#" id="take-photo" title="Take Photo"><i class="material-icons">photo_camera</i></a>
      <a href="#" id="download-photo" download="DownloadPhoto.png" title="Save Photo" class="disabled" target="_blank"><i class="material-icons">file_download</i></a>
  </div>`;

  let arHtml: string;

  if (useMindAR) {
    // ========================================================================
    // 🆕 MindAR方式: 注文ごと（またはOEM提供先ごと）に異なる比率の画像を
    //    そのままトラッキングマーカーとして使える。MindAR側が対象画像の
    //    アスペクト比に自動で合わせて座標系を正規化してくれるため、
    //    patternRatio のようなコード側の調整は一切不要。
    // ========================================================================
    arHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>${sharedHead}
  <script src="https://aframe.io/releases/1.2.0/aframe.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mind-ar@1.2.2/dist/mindar-image-aframe.prod.js"></script>
</head>

<body>
  <a-scene
    mindar-image="imageTargetSrc: ${mindFileUrl}; autoStart: true;"
    embedded
    color-space="sRGB"
    renderer="colorManagement: true, physicallyCorrectLights"
    vr-mode-ui="enabled: false"
    device-orientation-permission-ui="enabled: false"
  >
    <a-assets>
      <img id="ar-image" crossorigin="anonymous" src="${images[0]}">
    </a-assets>

    <a-camera position="0 0 0" look-controls="enabled: false" cursor="fuse: false" raycaster="far: 10000; objects: .clickable"></a-camera>

    <a-entity mindar-image-target="targetIndex: 0">
      <a-image id="target-image" src="#ar-image" position="0 0 0" scale="${finalScale} ${finalScale} ${finalScale}" rotation="0 0 0" ${animationAttribute}></a-image>
    </a-entity>
  </a-scene>
${sharedBodyUi}
${buildSharedBodyScript()}
</body>
</html>
  `;
  } else {
    // ========================================================================
    // 従来方式（フォールバック）: OEM対応より前の注文や、マーカーが
    // 未登録の注文はこれまで通りAR.jsの共通Hiroパターンマーカーで表示する。
    // このブロックは元のコードから内容を変更していない。
    // ========================================================================
    const pattUrl = `${origin}/markers/pattern-kototama.patt`;

    arHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>${sharedHead}
  <script src="https://aframe.io/releases/1.2.0/aframe.min.js"></script>
  <script src="https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js"></script>
</head>

<body>
  <a-scene embedded arjs="debugUIEnabled:false;trackingMethod:best;patternRatio:0.9;" vr-mode-ui="enabled:false">
    <a-assets>
      <img id="ar-image" crossorigin="anonymous" src="${images[0]}">
    </a-assets>

    <a-marker id="kototama-marker" preset="custom" type="pattern" url="${pattUrl}">
      <a-image id="target-image" src="#ar-image" position="0 0 0" scale="${finalScale} ${finalScale} ${finalScale}" rotation="-90 0 0" ${animationAttribute}></a-image>
    </a-marker>

    <a-entity camera></a-entity>
  </a-scene>
${sharedBodyUi}
${buildSharedBodyScript()}
</body>
</html>
  `;
  }

  return (
    <iframe
      srcDoc={arHtml}
      style={{ width: '100vw', height: '100vh', border: 'none', position: 'fixed', top: 0, left: 0, zIndex: 10 }}
      allow="camera; gyroscope; accelerometer; magnetometer"
      title="AR Viewer"
    />
  );
}

export default function ARPage() {
  return (
    <Suspense fallback={
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827', color: 'white' }}>
        システム準備中...
      </div>
    }>
      <ARViewer />
    </Suspense>
  );
}
