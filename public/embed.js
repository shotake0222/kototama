(function() {
  const container = document.getElementById('ar-order-form-container');
  if (!container) return;

  const scriptTag = document.getElementById('ar-embed-script');
  const clientId = scriptTag ? scriptTag.getAttribute('data-client-id') : 'direct';

  // 1. ECサイト品質の美しいフォーム用CSS
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
    .kt-radio-group { display: flex; flex-wrap: wrap; gap: 16px; padding: 8px 0; }
    .kt-radio-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.95rem; font-weight: 500; background: #fdf2f8; padding: 10px 16px; border-radius: 8px; border: 2px solid transparent; transition: 0.2s; }
    .kt-radio-label:has(input:checked) { background: #fff1f2; border-color: #f43f5e; color: #be123c; font-weight: 700; }
    .kt-radio-label input[type="radio"] { accent-color: #f43f5e; width: 18px; height: 18px; cursor: pointer; }
    .kt-btn-search { white-space: nowrap; padding: 14px 20px; background: #ffe4e6; color: #e11d48; border: none; border-radius: 10px; font-weight: bold; cursor: pointer; transition: 0.2s; font-family: inherit; font-size: 0.9rem; }
    .kt-btn-search:hover { background: #fecdd3; transform: translateY(-1px); }
    .kt-submit-btn { width: 100%; padding: 20px; background: linear-gradient(135deg, #f43f5e, #e11d48); color: #fff; border: none; border-radius: 50px; font-size: 1.2rem; font-weight: 800; cursor: pointer; transition: 0.3s; margin-top: 12px; box-shadow: 0 8px 20px rgba(225,29,72,0.25); font-family: inherit; letter-spacing: 2px; }
    .kt-submit-btn:hover { background: linear-gradient(135deg, #e11d48, #be123c); transform: translateY(-3px); box-shadow: 0 12px 24px rgba(225,29,72,0.3); }
    .kt-submit-btn:disabled { background: #d1d5db; cursor: not-allowed; transform: none; box-shadow: none; }
    .kt-result { text-align: center; padding: 40px 20px; display: none; }
    .kt-file-area { background: #fff; border: 2px dashed #fda4af; padding: 16px; border-radius: 10px; text-align: center; }
    @media (max-width: 600px) { .kt-form-body { padding: 16px; } .kt-radio-label { width: 100%; } }
  `;
  document.head.appendChild(style);

  // 47都道府県リスト
  const prefs = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];

  // 2. フォームUIの生成
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
            <label class="kt-label">キーホルダータイプ <span class="kt-req">必須</span></label>
            <div class="kt-radio-group">
              <label class="kt-radio-label"><input type="radio" name="itemType" value="キーホルダー" checked> キーホルダー</label>
              <label class="kt-radio-label"><input type="radio" name="itemType" value="リボンチャーム"> リボンチャーム</label>
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
              <label class="kt-radio-label"><input type="radio" name="imageType" value="自分の画像をアップロードする" checked> 自分の画像をアップロード</label>
              <label class="kt-radio-label"><input type="radio" name="imageType" value="テンプレートから画像を選ぶ"> テンプレートから選ぶ</label>
            </div>
          </div>

          <div class="kt-form-group">
            <label class="kt-label">画像 <span class="kt-req">必須</span></label>
            <div class="kt-file-area">
              <input type="file" id="kt-file" class="kt-input" accept="image/*,video/mp4,video/webm" style="border: none; background: transparent; padding: 0;" required />
            </div>
          </div>

          <div class="kt-form-group">
            <label class="kt-label">その他ご希望 <span class="kt-opt">任意</span></label>
            <textarea id="kt-memo" class="kt-textarea" rows="3" placeholder="ご要望などがあればご記入ください"></textarea>
          </div>

          <button type="submit" id="kt-submit-btn" class="kt-submit-btn">登録する</button>
        </div>
      </form>

      <!-- 完了画面 -->
      <div id="kt-result-message" class="kt-result">
        <div style="font-size: 4rem; margin-bottom: 16px;">🎉</div>
        <h3 style="color: #be123c; font-size: 1.5rem; font-weight: 800; margin-bottom: 16px;">ご登録ありがとうございます！</h3>
        <p style="color: #4b5563; margin-bottom: 24px; line-height: 1.6;">
          ご入力いただいたメールアドレス宛に、<br>お振込先情報を送信いたしました。<br>
          以下のURLからARをご確認いただけます。
        </p>
        <a href="#" id="kt-result-link" target="_blank" style="color: #f43f5e; font-weight: bold; word-break: break-all; background: #fff1f2; padding: 16px; border-radius: 12px; display: inline-block; border: 2px dashed #fecdd3; font-size: 1.1rem;"></a>
      </div>
    </div>
  `;

  // 3. 住所自動入力（郵便番号API）の処理
  document.getElementById('kt-zip-btn').addEventListener('click', async () => {
    const zip = document.getElementById('kt-zip').value.replace('-', '');
    if (!zip || zip.length !== 7) return alert('7桁の郵便番号をハイフンなしで入力してください。');
    
    try {
      const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zip}`);
      const data = await res.json();
      if (data.results) {
        document.getElementById('kt-pref').value = data.results[0].address1;
        document.getElementById('kt-city').value = data.results[0].address2 + data.results[0].address3;
      } else {
        alert('住所が見つかりませんでした。');
      }
    } catch (e) {
      alert('住所検索に失敗しました。手動でご入力ください。');
    }
  });

  // 4. フォーム送信処理
  const form = document.getElementById('ar-embed-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('kt-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '送信中...';

    // ラジオボタンの選択値を取得
    const itemType = document.querySelector('input[name="itemType"]:checked').value;
    const msgPattern = document.querySelector('input[name="msgPattern"]:checked').value;
    const imageType = document.querySelector('input[name="imageType"]:checked').value;

    // ※管理画面で詳細を確認できるように、詳細情報を1つの文字列に結合して送信します
    const fullOrderDetails = `
【種類】${itemType} / ${msgPattern}
【画像】${imageType}
【性別】${document.getElementById('kt-gender').value}
【年齢】${document.getElementById('kt-age').value}歳
【住所】〒${document.getElementById('kt-zip').value} ${document.getElementById('kt-pref').value}${document.getElementById('kt-city').value} ${document.getElementById('kt-building').value}
【備考】${document.getElementById('kt-memo').value}
    `.trim();

    const formData = new FormData();
    formData.append('customerName', document.getElementById('kt-name').value);
    formData.append('email', document.getElementById('kt-email').value);
    formData.append('file', document.getElementById('kt-file').files[0]);
    formData.append('clientId', clientId);
    formData.append('optionDetails', fullOrderDetails); // 結合した詳細情報をオプション欄に格納
    formData.append('totalPrice', '0'); // ※価格計算ロジックが必要な場合はここを拡張

    try {
      const response = await fetch('https://kototama.vercel.app/api/embed-order', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      
      if (data.success) {
        form.style.display = 'none';
        document.getElementById('kt-result-message').style.display = 'block';
        document.getElementById('kt-result-link').href = data.arUrl;
        document.getElementById('kt-result-link').textContent = data.arUrl;
      } else {
        alert('エラーが発生しました: ' + data.error);
      }
    } catch (err) {
      alert('通信エラーが発生しました。');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '登録する';
    }
  });
})();