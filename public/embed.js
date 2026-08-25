(async function() {
  const container = document.getElementById('ar-order-form-container');
  if (!container) return;
  const scriptTag = document.getElementById('ar-embed-script');
  const clientId = scriptTag ? scriptTag.getAttribute('data-client-id') : 'direct';

  // 💡 DBから設定を取得（PRODUCT_ から始まるキーを動的に商品として抽出）
  let s = { PRICE_TEMPLATE: 500, PRICE_MIND_AR: 3000, PRICE_TAX: 0.1, PRICE_POSTAGE: 380, PRICE_KEY_RING: 1500, PRICE_CHARM: 2800 };
  let customProducts = [];
  
  try {
    // 💡 修正: 正しいサブドメインに書き換え
    const res = await fetch('https://app.kototama-ar.com/api/settings');
    if (res.ok) {
      const dbSettings = await res.json();
      for (const key in dbSettings) {
        if (key.startsWith('PRODUCT_')) {
          // 例: PRODUCT_ACRYLIC = "アクリルスタンド,4500" のようにカンマ区切りで取得
          const parts = String(dbSettings[key]).split(',');
          if (parts.length >= 2) {
            customProducts.push({ name: parts[0].trim(), price: Number(parts[1].trim()), key: key });
          }
        } else {
          s[key] = Number(dbSettings[key]) || dbSettings[key];
        }
      }
    }
  } catch (e) { console.warn('設定の取得に失敗しました。デフォルト値を使用します。'); }

  // カスタム商品が1つも登録されていない場合は、デフォルトの2つを表示
  let products = customProducts.length > 0 ? customProducts : [
    { name: 'キーホルダー', price: s.PRICE_KEY_RING, key: 'PRODUCT_KEY_RING' },
    { name: 'リボンチャーム', price: s.PRICE_CHARM, key: 'PRODUCT_CHARM' }
  ];

  // 💡 商品のラジオボタンを動的に生成
  let productRadiosHtml = '';
  products.forEach((p, idx) => {
    const checked = idx === 0 ? 'checked' : '';
    productRadiosHtml += `<label class="kt-radio-label"><input type="radio" name="itemType" value="${p.name}" data-price="${p.price}" ${checked}> ${p.name} (${p.price.toLocaleString()}円)</label>`;
  });

  const cropperCss = document.createElement('link');
  cropperCss.rel = 'stylesheet'; cropperCss.href = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.css';
  document.head.appendChild(cropperCss);
  
  const cropperJs = document.createElement('script');
  cropperJs.src = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.js';
  document.head.appendChild(cropperJs);

  const mindarJs = document.createElement('script');
  mindarJs.src = 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.2/dist/mindar-image.prod.js';
  document.head.appendChild(mindarJs);

  const style = document.createElement('style');
  style.innerHTML = `
    .kt-form-container { width: 100%; max-width: 680px; margin: 0 auto; font-family: 'Zen Maru Gothic', sans-serif, system-ui; background: #ffffff; border-radius: 20px; box-shadow: 0 10px 40px -10px rgba(244,63,94,0.1); color: #374151; overflow: hidden; }
    .kt-section-title { font-size: 1.15rem; font-weight: 800; color: #881337; margin: 0; padding: 16px 24px; background: #fff1f2; border-left: 6px solid #f43f5e; display: flex; align-items: center; gap: 8px; }
    .kt-form-body { padding: 24px 32px; } .kt-form-group { margin-bottom: 24px; }
    .kt-label { display: block; font-weight: 700; font-size: 0.9rem; margin-bottom: 8px; color: #4b5563; }
    .kt-req, .kt-opt, .kt-new { color: white; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; margin-left: 8px; vertical-align: middle; }
    .kt-req { background: #e11d48; } .kt-opt { background: #9ca3af; } .kt-new { background: #10b981; }
    .kt-input, .kt-select, .kt-textarea { width: 100%; padding: 14px 16px; border: 2px solid #f3f4f6; border-radius: 10px; font-size: 1rem; box-sizing: border-box; background: #f9fafb; font-family: inherit; }
    .kt-input:focus, .kt-select:focus, .kt-textarea:focus { outline: none; border-color: #fb7185; background: #fff; box-shadow: 0 0 0 4px rgba(251,113,133,0.1); }
    .kt-flex-row { display: flex; gap: 16px; flex-wrap: wrap; } .kt-flex-col { flex: 1; min-width: 120px; }
    .kt-radio-group { display: flex; flex-wrap: wrap; gap: 12px; padding: 8px 0; }
    .kt-radio-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.95rem; font-weight: 500; background: #fdf2f8; padding: 10px 16px; border-radius: 8px; border: 2px solid transparent; flex: 1; min-width: 200px; line-height: 1.4; }
    .kt-radio-label:has(input:checked) { background: #fff1f2; border-color: #f43f5e; color: #be123c; font-weight: 700; }
    .kt-btn-search { padding: 14px 20px; background: #ffe4e6; color: #e11d48; border: none; border-radius: 10px; font-weight: bold; cursor: pointer; }
    .kt-price-box { background: #fff1f2; padding: 20px; border-radius: 12px; margin-bottom: 24px; border: 2px solid #fecdd3; }
    .kt-price-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.95rem; color: #4b5563; }
    .kt-price-row-total { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; border-top: 2px dashed #fda4af; padding-top: 12px; }
    .kt-price-val { font-weight: 700; color: #111827; } .kt-total-val { color: #e11d48; font-size: 1.8rem; font-weight: 900; }
    .kt-submit-btn { width: 100%; padding: 20px; background: linear-gradient(135deg, #f43f5e, #e11d48); color: #fff; border: none; border-radius: 50px; font-size: 1.2rem; font-weight: 800; cursor: pointer; transition: background 0.3s; }
    .kt-submit-btn:disabled { background: #9ca3af; cursor: not-allowed; }
    .kt-result { text-align: center; padding: 40px 20px; display: none; }
    .kt-file-area { background: #fff; border: 2px dashed #fda4af; padding: 16px; border-radius: 10px; text-align: center; }
    .kt-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(17, 24, 39, 0.85); z-index: 999999; display: none; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
    .kt-modal-content { background: #fff; width: 95%; max-width: 600px; border-radius: 20px; padding: 24px; }
    .kt-crop-container { width: 100%; height: 50vh; max-height: 450px; background: #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 20px; }
    .kt-modal-actions { display: flex; justify-content: flex-end; gap: 12px; }
    .kt-btn-cancel { padding: 12px 24px; background: #f3f4f6; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; }
    .kt-btn-confirm { padding: 12px 24px; background: #f43f5e; color: #fff; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; }
    @media (max-width: 600px) { .kt-form-body { padding: 16px; } }
  `;
  document.head.appendChild(style);

  container.innerHTML = `
    <div class="kt-form-container">
      <form id="ar-embed-form">
        <h3 class="kt-section-title">👤 お客様情報</h3>
        <div class="kt-form-body">
          <div class="kt-form-group"><label class="kt-label">氏名 <span class="kt-req">必須</span></label><input type="text" id="kt-name" class="kt-input" required /></div>
          <div class="kt-flex-row">
            <div class="kt-form-group kt-flex-col"><label class="kt-label">性別 <span class="kt-opt">任意</span></label><select id="kt-gender" class="kt-select"><option value="未選択">選択してください</option><option value="男性">男性</option><option value="女性">女性</option><option value="その他">その他</option></select></div>
            <div class="kt-form-group kt-flex-col"><label class="kt-label">年齢 <span class="kt-opt">任意</span></label><input type="number" id="kt-age" class="kt-input" min="0" max="150" /></div>
          </div>
          <div class="kt-form-group"><label class="kt-label">メールアドレス <span class="kt-req">必須</span></label><input type="email" id="kt-email" class="kt-input" required /></div>
        </div>

        <h3 class="kt-section-title">🏠 お届け先</h3>
        <div class="kt-form-body">
          <div class="kt-form-group"><label class="kt-label">郵便番号 <span class="kt-req">必須</span></label><div class="kt-flex-row" style="flex-wrap: nowrap;"><input type="text" id="kt-zip" class="kt-input" maxlength="7" style="max-width: 200px;" required /><button type="button" id="kt-zip-btn" class="kt-btn-search">住所検索</button></div></div>
          <div class="kt-form-group"><label class="kt-label">都道府県 <span class="kt-req">必須</span></label><input type="text" id="kt-pref" class="kt-input" required /></div>
          <div class="kt-form-group"><label class="kt-label">市区町村 <span class="kt-req">必須</span></label><input type="text" id="kt-city" class="kt-input" required /></div>
          <div class="kt-form-group"><label class="kt-label">建物名・号室 <span class="kt-opt">任意</span></label><input type="text" id="kt-building" class="kt-input" /></div>
        </div>

        <h3 class="kt-section-title">🎁 ご注文内容</h3>
        <div class="kt-form-body">
          <div class="kt-form-group">
            <label class="kt-label">商品の種類 <span class="kt-req">必須</span></label>
            <div class="kt-radio-group">
              ${productRadiosHtml}
            </div>
          </div>
          <div class="kt-form-group">
            <label class="kt-label">画像の選択方法 <span class="kt-req">必須</span></label>
            <div class="kt-radio-group">
              <label class="kt-radio-label"><input type="radio" name="imageType" value="アップロード" checked> 画像をアップロード</label>
              <label class="kt-radio-label"><input type="radio" name="imageType" value="テンプレート"> テンプレートから選ぶ (+${s.PRICE_TEMPLATE.toLocaleString()}円)</label>
            </div>
          </div>
          
          <div class="kt-form-group" id="kt-file-group">
            <label class="kt-label">画像 / 動画 <span class="kt-req">必須</span></label>
            <div class="kt-file-area">
              <input type="file" id="kt-file" class="kt-input" accept="image/*,video/mp4,video/webm" style="border: none; background: transparent; padding: 0;" required />
              <div id="kt-file-status" style="margin-top:12px; color:#be123c; font-weight:bold; display:none;"></div>
            </div>
          </div>
          <div class="kt-form-group" id="kt-template-group" style="display: none;">
            <label class="kt-label">ご希望のテンプレート番号 <span class="kt-req">必須</span></label>
            <input type="text" id="kt-template-id" class="kt-input" placeholder="例：T-01" />
          </div>

          <div class="kt-form-group" id="kt-ar-mode-group">
            <label class="kt-label">ARの再生モード <span class="kt-new">オススメ</span></label>
            <div class="kt-radio-group">
              <label class="kt-radio-label">
                <input type="radio" name="arMode" value="hiro" checked> 
                通常マーカー読込（無料）<br><span style="font-size:0.8rem; font-weight:normal; display:block; margin-top:4px;">※画面上にマーカーを映して再生します。</span>
              </label>
              <label class="kt-radio-label">
                <input type="radio" name="arMode" value="mindar"> 
                イメージトラッキング (+${s.PRICE_MIND_AR.toLocaleString()}円)<br><span style="font-size:0.8rem; font-weight:normal; display:block; margin-top:4px;">※商品そのもの（写真）をカメラで認識して再生します。</span>
              </label>
            </div>
          </div>

          <div class="kt-form-group"><label class="kt-label">備考 <span class="kt-opt">任意</span></label><textarea id="kt-memo" class="kt-textarea" rows="3"></textarea></div>

          <div class="kt-price-box">
            <div class="kt-price-row"><span>基本料金:</span><span class="kt-price-val" id="disp-base-price">0円</span></div>
            <div class="kt-price-row"><span>オプション料金:</span><span class="kt-price-val" id="disp-option-price">0円</span></div>
            <div class="kt-price-row"><span>送料:</span><span class="kt-price-val">${s.PRICE_POSTAGE.toLocaleString()}円</span></div>
            <div class="kt-price-row"><span>消費税 (${s.PRICE_TAX * 100}%):</span><span class="kt-price-val" id="disp-tax">0円</span></div>
            <div class="kt-price-row-total"><span style="color: #be123c; font-weight: 800;">税込合計:</span><span class="kt-total-val" id="disp-total">0円</span></div>
          </div>
          <button type="submit" id="kt-submit-btn" class="kt-submit-btn">この内容で登録する</button>
        </div>
      </form>
      <div id="kt-result-message" class="kt-result">
        <div style="font-size: 4rem; margin-bottom: 16px;">🎉</div>
        <h3 style="color: #be123c; font-size: 1.5rem; font-weight: 800; margin-bottom: 16px;">ご注文ありがとうございます！</h3>
        <p style="color: #4b5563;">ご入力いただいたメールアドレス宛に、お振込先などのご案内を送信いたしました。</p>
      </div>
    </div>
    
    <div id="kt-crop-modal" class="kt-modal-overlay">
      <div class="kt-modal-content">
        <h3 style="margin-top:0; color:#881337;">✂️ 画像のトリミング</h3>
        <div class="kt-crop-container"><img id="kt-crop-image" src="" style="max-width: 100%; display: block;" /></div>
        <div class="kt-modal-actions"><button type="button" id="kt-btn-crop-cancel" class="kt-btn-cancel">キャンセル</button><button type="button" id="kt-btn-crop-confirm" class="kt-btn-confirm">確定</button></div>
      </div>
    </div>
  `;

  let cropperInstance = null, croppedBlob = null, originalFile = null;
  const fileInput = document.getElementById('kt-file'), cropModal = document.getElementById('kt-crop-modal'), cropImage = document.getElementById('kt-crop-image');

  fileInput.addEventListener('change', (e) => {
    originalFile = e.target.files[0];
    if (!originalFile) return;
    if (originalFile.type.startsWith('video/')) {
      alert('動画は現在準備中です。画像をご選択ください。'); fileInput.value = ''; return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      cropImage.src = event.target.result; cropModal.style.display = 'flex';
      if (cropperInstance) cropperInstance.destroy();
      cropperInstance = new window.Cropper(cropImage, { viewMode: 1, autoCropArea: 0.9, background: false });
    };
    reader.readAsDataURL(originalFile);
  });

  document.getElementById('kt-btn-crop-confirm').addEventListener('click', () => {
    cropperInstance.getCroppedCanvas({ maxWidth: 1200, maxHeight: 1200 }).toBlob((blob) => {
      croppedBlob = blob; cropModal.style.display = 'none';
      document.getElementById('kt-file-status').style.display = 'block';
      document.getElementById('kt-file-status').textContent = '✅ トリミング完了';
    }, 'image/jpeg', 0.85);
  });
  
  document.getElementById('kt-btn-crop-cancel').addEventListener('click', () => {
    cropModal.style.display = 'none'; croppedBlob = null;
    document.getElementById('kt-file-status').style.display = 'block';
    document.getElementById('kt-file-status').textContent = '※ 元画像を使用します';
  });

  const updateFormState = () => {
    // 💡 選択された商品の data-price 属性から動的に金額を取得
    const selectedItem = document.querySelector('input[name="itemType"]:checked');
    const imageType = document.querySelector('input[name="imageType"]:checked').value;
    const arMode = document.querySelector('input[name="arMode"]:checked').value;
    
    const arModeGroup = document.getElementById('kt-ar-mode-group');
    if (imageType === 'テンプレート') {
      document.getElementById('kt-file-group').style.display = 'none'; fileInput.removeAttribute('required');
      document.getElementById('kt-template-group').style.display = 'block'; document.getElementById('kt-template-id').setAttribute('required', 'true');
      
      arModeGroup.style.display = 'none';
      document.querySelector('input[name="arMode"][value="hiro"]').checked = true; 
    } else {
      document.getElementById('kt-file-group').style.display = 'block'; fileInput.setAttribute('required', 'true');
      document.getElementById('kt-template-group').style.display = 'none'; document.getElementById('kt-template-id').removeAttribute('required');
      
      arModeGroup.style.display = 'block'; 
    }

    const currentArMode = document.querySelector('input[name="arMode"]:checked').value;
    
    // 💡 動的計算
    const basePrice = selectedItem ? Number(selectedItem.dataset.price) : 0;
    const optTemplatePrice = imageType === 'テンプレート' ? s.PRICE_TEMPLATE : 0;
    const optMindArPrice = currentArMode === 'mindar' ? s.PRICE_MIND_AR : 0;
    const totalOptionPrice = optTemplatePrice + optMindArPrice;

    const subTotal = basePrice + totalOptionPrice + s.PRICE_POSTAGE;
    const tax = Math.floor(subTotal * s.PRICE_TAX);
    const total = subTotal + tax;

    document.getElementById('disp-base-price').textContent = basePrice.toLocaleString() + '円';
    document.getElementById('disp-option-price').textContent = totalOptionPrice.toLocaleString() + '円';
    document.getElementById('disp-tax').textContent = tax.toLocaleString() + '円';
    document.getElementById('disp-total').textContent = total.toLocaleString() + '円';
    window.currentTotalPrice = total;
  };
  document.querySelectorAll('input[type="radio"]').forEach(r => r.addEventListener('change', updateFormState));
  updateFormState();

  document.getElementById('kt-zip-btn').addEventListener('click', async () => {
    const zip = document.getElementById('kt-zip').value.replace('-', '');
    if (zip.length !== 7) return alert('7桁の郵便番号を入力してください。');
    const data = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zip}`).then(r => r.json());
    if (data.results) {
      document.getElementById('kt-pref').value = data.results[0].address1;
      document.getElementById('kt-city').value = data.results[0].address2 + data.results[0].address3;
    }
  });

  const compileImageToMind = async (fileOrBlob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const img = new Image();
        img.onload = async () => {
          try {
            if (!window.MINDAR || !window.MINDAR.IMAGE) return reject(new Error('MindAR compiler not loaded'));
            const compiler = new window.MINDAR.IMAGE.Compiler();
            await compiler.compileImageTargets([img], (progress) => { console.log('MindAR Compiling Progress:', progress.toFixed(2)); });
            const exportedBuffer = await compiler.exportData();
            const blob = new Blob([exportedBuffer], { type: 'application/octet-stream' });
            resolve(blob);
          } catch (err) { reject(err); }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(fileOrBlob);
    });
  };

  document.getElementById('ar-embed-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('kt-submit-btn');
    btn.disabled = true; 

    const itemType = document.querySelector('input[name="itemType"]:checked').value;
    const imageType = document.querySelector('input[name="imageType"]:checked').value;
    const arMode = document.querySelector('input[name="arMode"]:checked').value;
    
    const optionDetails = `【種類】${itemType}\n【画像】${imageType}\n【AR再生】${arMode === 'mindar' ? 'イメージトラッキング (+3000円)' : '通常マーカー読込'}\n【性別】${document.getElementById('kt-gender').value}\n【年齢】${document.getElementById('kt-age').value}歳\n【住所】〒${document.getElementById('kt-zip').value} ${document.getElementById('kt-pref').value}${document.getElementById('kt-city').value} ${document.getElementById('kt-building').value}\n【備考】${document.getElementById('kt-memo').value}`;

    const formData = new FormData();
    formData.append('customerName', document.getElementById('kt-name').value);
    formData.append('email', document.getElementById('kt-email').value);
    formData.append('clientId', clientId);
    formData.append('optionDetails', optionDetails);
    formData.append('totalPrice', window.currentTotalPrice);
    
    if (imageType === 'テンプレート') {
      formData.append('templateId', document.getElementById('kt-template-id').value);
      btn.textContent = '送信中...';
    } else {
      const targetBlob = croppedBlob || originalFile;
      if (arMode === 'mindar') {
        btn.textContent = 'ARデータ生成中... (数秒かかります)';
        try {
          const mindBlob = await compileImageToMind(targetBlob);
          formData.append('mindFile', new File([mindBlob], 'target.mind', { type: 'application/octet-stream' }));
        } catch (err) { console.warn('トラッキングデータの生成エラー', err); }
      }
      btn.textContent = '送信中...';
      formData.append('originalFile', originalFile);
      if (croppedBlob) formData.append('processedFile', new File([croppedBlob], `proc_${originalFile.name}`, { type: 'image/jpeg' }));
    }

    try {
      // 💡 修正: 正しいサブドメインに書き換え
      const res = await fetch('https://app.kototama-ar.com/api/embed-order', { method: 'POST', body: formData });
      if ((await res.json()).success) {
        document.getElementById('ar-embed-form').style.display = 'none';
        document.getElementById('kt-result-message').style.display = 'block';
      }
    } catch (err) { alert('通信エラーが発生しました'); } 
    finally { btn.disabled = false; btn.textContent = 'この内容で登録する'; }
  });
})();