(function() {
  // 外部サイトの div#petal-ar-form に iframe を展開する
  const container = document.getElementById('petal-ar-form');
  if (!container) return;

  // このJSがホストされているドメインを動的に取得してiframeのURLにする
  const scriptTag = document.currentScript;
  const scriptUrl = new URL(scriptTag.src);
  const hostUrl = scriptUrl.origin;

  const iframe = document.createElement('iframe');
  // 複数サイトからのアクセス元（origin）をクエリで渡して判別可能にする
  iframe.src = `${hostUrl}/order?origin=${encodeURIComponent(window.location.origin)}`;
  iframe.style.width = '100%';
  iframe.style.height = '800px';
  iframe.style.border = 'none';
  iframe.style.overflow = 'hidden';
  
  container.appendChild(iframe);
})();