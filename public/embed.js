(function() {
  const container = document.getElementById('ar-order-form-container');
  if (!container) return;
  const scriptTag = document.getElementById('ar-embed-script');
  const clientId = scriptTag ? scriptTag.getAttribute('data-client-id') : 'direct';

  // 1. トリミング用ライブラリ(Cropper.js)を動的に読み込む
  const cropperCss = document.createElement('link');
  cropperCss.rel = 'stylesheet';
  cropperCss.href = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.css';
  document.head.appendChild(cropperCss);

  const cropperJs = document.createElement('script');
  cropperJs.src = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.js';
  document.head.appendChild(cropperJs);

  // 2. フォーム用CSS
  const style = document.createElement('style');
  style.innerHTML = `
    .kt-form-container { width: 100%; max-width: 680px; margin: 0 auto; font-family: 'Zen Maru Gothic', sans-serif, system-ui; background: #ffffff; border-radius: 20px; box-shadow: 0 10px 40px -10px rgba(244,63,94,0.1); color: #374151; overflow: hidden; }
    .kt-section-title { font-size: 1.15rem; font-weight: 800; color: #881337; margin: 0; padding: 16px 24px; background: #fff1f2; border-left: 6px solid #f43f5e; display: flex; align-items: center; gap: 8px; }
    .kt-form-body { padding: 24px 32px; }
    .kt-form-group { margin-bottom: 24px; }
    .kt-label { display: block; font-weight: 700; font-size: 0.9rem; margin-bottom: 8px; color: #4b5563; }
    .kt-req { background: #e11d48; color: white; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; margin-left: 8px; vertical-align: middle; }
    .kt-opt { background: #9ca3af; color: white; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; margin-left: 8px; vertical-align: middle; }
    .kt-input, .kt-select, .kt-textarea { width: 100%; padding: 14px 16px; border: 2px solid #f3f4f6; border-radius: 10px; font-size: 1rem; transition: all 0.2s; box-sizing: border-box; background: #f9fafb; font-family: inherit; color: #111827; }
    .kt-input:focus, .kt-select:focus, .kt-textarea:focus { outline: none; border-color: #fb7185; background: #fff; box-shadow: 0 0 0 4px rgba(251,113,133,0.1); }
    .kt-flex-row { display: flex; gap: 16px; flex-wrap: wrap; }
    .kt-flex-col { flex: 1; min-width: 120px; }
    .kt-radio-group { display: flex; flex-wrap: wrap; gap: 12px; padding: 8px 0; }
    .kt-radio-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.95rem; font-weight: 500; background: #fdf2f8; padding: 10px 16px; border-radius: 8px; border: 2px solid transparent; transition: 0.2s; flex: 1; min-width: 200px; }
    .kt-radio-label:has(input:checked) { background: #fff1f2; border-color: #f43f5e; color: #be123c; font-weight: 700; }
    .kt-radio-label input[type="radio"] { accent-color: #f43f5e; width: 18px; height: 18px; cursor: pointer; }
    .kt-btn-search { white-space: nowrap; padding: 14px 20px; background: #ffe4e6; color: #e11d48; border: none; border-radius: 10px; font-weight: bold; cursor: pointer; transition: 0.2s; font-family: inherit; font-size: 0.9rem; }
    .kt-btn-search:hover { background: #fecdd3; transform: translateY(-1px); }
    
    .kt-price-box { background: #fff1f2; padding: 20px; border-radius: 12px; margin-bottom: 24px; border: 2px solid #fecdd3; }
    .kt-price-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.95rem; color: #4b5563; }
    .kt-price-row-total { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; border-top: 2px dashed #fda4af; padding-top: 12px; }
    .kt-price-val { font-weight: 700; color: #111827; }
    .kt-total-val { color: #e11d48; font-size: 1.8rem; font-weight: 900; }
    
    .kt-submit-btn { width: 100%; padding: 20px; background: linear-gradient(135deg, #f43f5e, #e11d48); color: #fff; border: none; border-radius: 50px; font-size: 1.2rem; font-weight: 800; cursor: pointer; transition: 0.3s; box-shadow: 0 8px 20px rgba(225,29,72,0.25); font-family: inherit; letter-spacing: 2px; }
    .kt-submit-btn:hover { background: linear-gradient(135deg, #e11d48, #be123c); transform: translateY(-3px); box-shadow: 0 12px 24px rgba(225,29,72,0.3); }
    .kt-submit-btn:disabled { background: #d1d5db; cursor: not-allowed; transform: none; box-shadow: none; }
    .kt-result { text-align: center; padding: 40px 20px; display: none; }
    
    .kt-file-area { background: #fff; border: 2px dashed #fda4af; padding: 16px; border-radius: 10px; text-align: center; }
    .kt-file-status { margin-top: 12px; font-size: 0.9rem; font-weight: 700; color: #be123c; display: none; background: #fff1f2; padding: 8px; border-radius: 6px; }
    
    /* トリミング用モーダルUI */
    .kt-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(17, 24, 39, 0.85); z-index: 999999; display: none; align-items: center; justify-content: center; backdrop-filter: blur(4px); font-family: 'Zen Maru Gothic', sans-serif; }
    .kt-modal-content { background: #fff; width: 95%; max-width: 600px; border-radius: 20px; padding: 24px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
    .kt-modal-title { font-size: 1.25rem; font-weight: 800; color: #881337; margin-top: 0; margin-bottom: 16px; }
    .kt-crop-container { width: 100%; height: 50vh; max-height: 450px; background: #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 20px; }
    .kt-modal-actions { display: flex; justify-content: flex-end; gap: 12px; }
    .kt-btn-cancel { padding: 12px 24px; background: #f3f4f6; color: #4b5563; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; transition: 0.2s; }
    .kt-btn-cancel:hover { background: #e5e7eb; }
    .kt-btn-confirm { padding: 12px 24px; background: #f43f5e; color: #fff; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 12px rgba(244,63,94,0.3); }
    .kt-btn-confirm:hover { background: #e11d48; }

    @media (max-width: 600px) { .kt-form-body { padding: 16px; } .kt-modal-content { padding: 16px; } }
  `;
  document.head.appendChild(style);

  const prefs = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];

  // 3. フォームUIの生成
  container.innerHTML = `
    <div class="kt-form-container">
      <form id="ar-embed-form">
        <h3 class="kt-section-title">👤 お客様情報</h3>
        <div class="kt-form-body">
          <div class="kt-form-group">
            <label class="kt-label">氏名 <span class="kt-req">必須</span></label>
            <input type="text" id="kt-name" class="kt-input" placeholder="例：山田 太郎" required />
          </div>
          <div class="kt-flex-row">
            <div class="kt-form-group kt-flex-col">
              <label class="kt-label">性別 <span class="kt-opt">任意</span></label>
              <select id="kt-gender" class="kt-select">
                <option value="未選択">選択してください</option>
                <option value="男性">男性</option>
                <option value="女性">女性</option>
                <option value="その他">その他</option>
              </select>
            </div>
            <div class="kt-form-group kt-flex-col">
              <label class="kt-label">年齢 <span class="kt-opt">任意</span></label>
              <input type="number" id="kt-age" class="kt-input" placeholder="例：25" min="0" max="150" />
            </div>
          </div>
          <div class="kt-form-group">
            <label class="kt-label">メールアドレス <span class="kt-req">必須</span></label>
            <input type="email" id="kt-email" class="kt-input" placeholder="example@mail.com" required />
          </div>
        </div>

        <h3 class="kt-section-title">🏠 お届け先</h3>
        <div class="kt-form-body">
          <div class="kt-form-group">
            <label class="kt-label">郵便番号 <span class="kt-req">必須</span></label>
            <div class="kt-flex-row" style="flex-wrap: nowrap;">
              <input type="text" id="kt-zip" class="kt-input" placeholder="1234567 (ハイフンなし)" maxlength="7" style="max-width: 200px;" required />
              <button type="button" id="kt-zip-btn" class="kt-btn-search">住所検索</button>
            </div>
          </div>
          <div class="kt-form-group">
            <label class="kt-label">都道府県 <span class="kt-req">必須</span></label>
            <select id="kt-pref" class="kt-select" required>
              <option value="">選択してください</option>
              ${prefs.map(p => `<option value="${p}">${p}</option>`).join('')}
            </select>
          </div>
          <div class="kt-form-group">
            <label class="kt-label">市区町村 <span class="kt-req">必須</span></label>
            <input type="text" id="kt-city" class="kt-input" placeholder="例：渋谷区神南" required />
          </div>
          <div class="kt-form-group">
            <label class="kt-label">建物名・号室 <span class="kt-opt">任意</span></label>
            <input type="text" id="kt-building" class="kt-input" placeholder="例：マンション101" />
          </div>
        </div>

        <h3 class="kt-section-title">🎁 ご注文内容</h3>
        <div class="kt-form-body">
          <div class="kt-form-group">
            <label class="kt-label">キーホルダーの種類 <span class="kt-req">必須</span></label>
            <div class="kt-radio-group">
              <label class="kt-radio-label"><input type="radio" name="itemType" value="ブルー" checked> ブルー (3,000円)</label>
              <label class="kt-radio-label"><input type="radio" name="itemType" value="ピンク"> ピンク (3,800円)</label>
              <label class="kt-radio-label"><input type="radio" name="itemType" value="イエロー"> イエロー (3,800円)</label>
            </div>
          </div>
          <div class="kt-form-group">
            <label class="kt-label">メッセージ表示パターン <span class="kt-req">必須</span></label>
            <div class="kt-radio-group">
              <label class="kt-radio-label"><input type="radio" name="msgPattern" value="一言メッセージ" checked> 一言メッセージ</label>
              <label class="kt-radio-label"><input type="radio" name="msgPattern" value="長文メッセージ"> 長文メッセージ</label>
            </div>
          </div>
          <div class="kt-form-group">
            <label class="kt-label">画像の選択方法 <span class="kt-req">必須</span></label>
            <div class="kt-radio-group">
              <label class="kt-radio-label"><input type="radio" name="imageType" value="自分の画像をアップロードする" checked> 画像をアップロード</label>
              <label class="kt-radio-label"><input type="radio" name="imageType" value="テンプレートから画像を選ぶ"> テンプレートから選ぶ (+1,000円)</label>
            </div>
            <div style="margin-top: 10px; text-align: right;">
              <a href="templates.html" target="_blank" style="color: #f43f5e; font-size: 0.9rem; font-weight: bold; text-decoration: underline;">👉 テンプレート一覧を見る</a>
            </div>
          </div>

          <div class="kt-form-group" id="kt-file-group">
            <label class="kt-label">画像 / 動画 <span class="kt-req">必須</span></label>
            <div class="kt-file-area">
              <input type="file" id="kt-file" class="kt-input" accept="image/*,video/mp4,video/webm" style="border: none; background: transparent; padding: 0;" required />
              <div id="kt-file-status" class="kt-file-status"></div>
            </div>
          </div>

          <div class="kt-form-group" id="kt-template-group" style="display: none;">
            <label class="kt-label">ご希望のテンプレート番号 <span class="kt-req">必須</span></label>
            <input type="text" id="kt-template-id" class="kt-input" placeholder="例：T-01" style="border-color: #fb7185; background: #fff1f2;" />
          </div>

          <div class="kt-form-group">
            <label class="kt-label">その他ご希望 <span class="kt-opt">任意</span></label>
            <textarea id="kt-memo" class="kt-textarea" rows="3" placeholder="ご要望などがあればご記入ください"></textarea>
          </div>

          <div class="kt-price-box">
            <div class="kt-price-row"><span>基本料金:</span><span class="kt-price-val" id="disp-base-price">3,000円</span></div>
            <div class="kt-price-row"><span>オプション料金:</span><span class="kt-price-val" id="disp-option-price">0円</span></div>
            <div class="kt-price-row"><span>消費税 (10%):</span><span class="kt-price-val" id="disp-tax">300円</span></div>
            <div class="kt-price-row-total">
              <span style="color: #be123c; font-weight: 800;">税込合計:</span>
              <span class="kt-total-val" id="disp-total">3,300円</span>
            </div>
          </div>
          <button type="submit" id="kt-submit-btn" class="kt-submit-btn">この内容で登録する</button>
        </div>
      </form>
      
      <!-- ARリンクを削除し、サンクスメッセージのみに変更 -->
      <div id="kt-result-message" class="kt-result">
        <div style="font-size: 4rem; margin-bottom: 16px;">🎉</div>
        <h3 style="color: #be123c; font-size: 1.5rem; font-weight: 800; margin-bottom: 16px;">ご注文ありがとうございます！</h3>
        <p style="color: #4b5563; margin-bottom: 24px; line-height: 1.6;">
          ご入力いただいたメールアドレス宛に、<br>お振込先などのご案内を送信いたしました。<br>
          お手元に届くまで楽しみにお待ちください！
        </p>
      </div>
    </div>

    <!-- トリミング用オーバーレイモーダル -->
    <div id="kt-crop-modal" class="kt-modal-overlay">
      <div class="kt-modal-content">
        <h3 class="kt-modal-title">✂️ 画像のトリミング</h3>
        <p style="font-size: 0.85rem; color: #4b5563; margin-bottom: 16px;">不要な背景を切り取って、ARで表示したい部分だけを残してください。</p>
        <div class="kt-crop-container">
          <img id="kt-crop-image" src="" alt="トリミング対象" style="max-width: 100%; display: block;" />
        </div>
        <div class="kt-modal-actions">
          <button type="button" id="kt-btn-crop-cancel" class="kt-btn-cancel">キャンセル</button>
          <button type="button" id="kt-btn-crop-confirm" class="kt-btn-confirm">切り抜きを確定する</button>
        </div>
      </div>
    </div>
  `;

  // 4. トリミング & 動画ブロックロジック
  let cropperInstance = null;
  let croppedBlob = null;
  let originalFileName = "";

  const fileInput = document.getElementById('kt-file');
  const cropModal = document.getElementById('kt-crop-modal');
  const cropImage = document.getElementById('kt-crop-image');
  const fileStatus = document.getElementById('kt-file-status');

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 【追加】動画ファイルが選択されたらアラートを出してブロックする（機能は残す）
    if (file.type.startsWith('video/')) {
      alert('申し訳ありません。現在、動画ファイルのアップロードは準備中となっております。\n画像ファイル（.jpg, .pngなど）をご選択ください。');
      fileInput.value = ''; // ファイル選択をクリア
      fileStatus.style.display = 'none';
      return;
    }

    // 画像の場合のみトリミング画面を表示
    if (file.type.startsWith('image/')) {
      originalFileName = file.name;
      const reader = new FileReader();
      reader.onload = (event) => {
        cropImage.src = event.target.result;
        cropModal.style.display = 'flex';
        
        if (cropperInstance) cropperInstance.destroy();
        cropperInstance = new window.Cropper(cropImage, {
          viewMode: 1,
          autoCropArea: 0.9,
          background: false,
        });
      };
      reader.readAsDataURL(file);
    }
  });

  document.getElementById('kt-btn-crop-confirm').addEventListener('click', () => {
    if (!cropperInstance) return;
    cropperInstance.getCroppedCanvas({ maxWidth: 1200, maxHeight: 1200 }).toBlob((blob) => {
      croppedBlob = blob;
      cropModal.style.display = 'none';
      fileStatus.style.display = 'block';
      fileStatus.textContent = '✅ トリミングが完了しました (' + originalFileName + ')';
    }, 'image/jpeg', 0.85);
  });

  document.getElementById('kt-btn-crop-cancel').addEventListener('click', () => {
    cropModal.style.display = 'none';
    croppedBlob = null; 
    fileStatus.style.display = 'block';
    fileStatus.textContent = '※ トリミングせずに元の画像を使用します';
  });

  // 5. 金額計算・UI切り替えロジック
  const updateFormState = () => {
    const itemType = document.querySelector('input[name="itemType"]:checked').value;
    const imageType = document.querySelector('input[name="imageType"]:checked').value;
    
    if(imageType === 'テンプレートから画像を選ぶ') {
      document.getElementById('kt-file-group').style.display = 'none';
      fileInput.removeAttribute('required');
      document.getElementById('kt-template-group').style.display = 'block';
      document.getElementById('kt-template-id').setAttribute('required', 'true');
    } else {
      document.getElementById('kt-file-group').style.display = 'block';
      fileInput.setAttribute('required', 'true');
      document.getElementById('kt-template-group').style.display = 'none';
      document.getElementById('kt-template-id').removeAttribute('required');
    }

    const basePrice = itemType === 'ブルー' ? 3000 : 3800;
    const optionPrice = imageType === 'テンプレートから画像を選ぶ' ? 1000 : 0;
    const tax = Math.floor((basePrice + optionPrice) * 0.1);
    const total = basePrice + optionPrice + tax;

    document.getElementById('disp-base-price').textContent = basePrice.toLocaleString() + '円';
    document.getElementById('disp-option-price').textContent = optionPrice.toLocaleString() + '円';
    document.getElementById('disp-tax').textContent = tax.toLocaleString() + '円';
    document.getElementById('disp-total').textContent = total.toLocaleString() + '円';
    window.currentTotalPrice = total;
  };

  document.querySelectorAll('input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', updateFormState);
  });
  updateFormState();

  // 6. 住所自動入力
  document.getElementById('kt-zip-btn').addEventListener('click', async () => {
    const zip = document.getElementById('kt-zip').value.replace('-', '');
    if (!zip || zip.length !== 7) return alert('7桁の郵便番号をハイフンなしで入力してください。');
    try {
      const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zip}`);
      const data = await res.json();
      if (data.results) {
        document.getElementById('kt-pref').value = data.results[0].address1;
        document.getElementById('kt-city').value = data.results[0].address2 + data.results[0].address3;
      } else { alert('住所が見つかりませんでした。'); }
    } catch (e) { alert('住所検索に失敗しました。'); }
  });

  // 7. 送信処理
  const form = document.getElementById('ar-embed-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('kt-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '送信中...';

    const itemType = document.querySelector('input[name="itemType"]:checked').value;
    const msgPattern = document.querySelector('input[name="msgPattern"]:checked').value;
    const imageType = document.querySelector('input[name="imageType"]:checked').value;
    
    const templateText = imageType === 'テンプレートから画像を選ぶ' 
      ? `【希望テンプレート】${document.getElementById('kt-template-id').value}` 
      : '';

    const fullOrderDetails = `
【種類】リボンチャーム (${itemType}) / ${msgPattern}
【画像】${imageType}
${templateText}
【性別】${document.getElementById('kt-gender').value}
【年齢】${document.getElementById('kt-age').value}歳
【住所】〒${document.getElementById('kt-zip').value} ${document.getElementById('kt-pref').value}${document.getElementById('kt-city').value} ${document.getElementById('kt-building').value}
【備考】${document.getElementById('kt-memo').value}
    `.trim();

    let fileToSend;
    if (imageType === 'テンプレートから画像を選ぶ') {
      fileToSend = new File(["template_selected"], "template.txt", { type: "text/plain" });
    } else {
      if (croppedBlob) {
        fileToSend = new File([croppedBlob], originalFileName || "cropped.jpg", { type: "image/jpeg" });
      } else {
        fileToSend = fileInput.files[0];
      }
    }

   // ～～～ 既存のコード ～～～
    const formData = new FormData();
    formData.append('customerName', document.getElementById('kt-name').value);
    formData.append('email', document.getElementById('kt-email').value);
    formData.append('file', fileToSend);
    formData.append('clientId', clientId);
    formData.append('optionDetails', fullOrderDetails);
    formData.append('totalPrice', window.currentTotalPrice || '0'); 

    // 【ここから下を追加！】 テンプレート番号を独立してAPIへ送る
    if (imageType === 'テンプレートから画像を選ぶ') {
      formData.append('templateId', document.getElementById('kt-template-id').value);
    }
    // 【ここまで追加】

    try {
      const response = await fetch('https://kototama.vercel.app/api/embed-order', {
    // ～～～ 以下既存コードのまま ～～～
    try {
      const response = await fetch('https://kototama.vercel.app/api/embed-order', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      
      // ARリンクの表示処理を削除し、サンクス画面への切り替えのみを実行
      if (data.success) {
        form.style.display = 'none';
        document.getElementById('kt-result-message').style.display = 'block';
      } else { alert('エラーが発生しました: ' + data.error); }
      
    } catch (err) { alert('通信エラーが発生しました。'); } 
    finally { submitBtn.disabled = false; submitBtn.textContent = '登録する'; }
  });
})();