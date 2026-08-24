(function() {
  const container = document.getElementById('ar-order-form-container');
  if (!container) return;

  const scriptTag = document.getElementById('ar-embed-script');
  const clientId = scriptTag ? scriptTag.getAttribute('data-client-id') : 'direct';

  const style = document.createElement('style');
  style.innerHTML = `
    .ar-form-wrapper { font-family: sans-serif; max-width: 400px; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
    .ar-form-group { margin-bottom: 16px; }
    .ar-form-label { display: block; margin-bottom: 6px; font-weight: bold; font-size: 14px; color: #374151; }
    .ar-form-input, .ar-form-select { padding: 10px; border: 1px solid #d1d5db; border-radius: 4px; width: 100%; box-sizing: border-box; font-size: 14px; }
    .ar-form-btn { background: #1e3a8a; color: white; border: none; padding: 12px; border-radius: 4px; cursor: pointer; width: 100%; font-weight: bold; font-size: 16px; transition: background 0.2s; }
    .ar-form-btn:hover { background: #1e40af; }
    .ar-form-btn:disabled { background: #9ca3af; }
    .ar-form-result { margin-top: 15px; padding: 15px; background: #dcfce7; border: 1px solid #bbf7d0; border-radius: 4px; color: #166534; display: none; }
    .ar-price-display { font-size: 18px; font-weight: bold; color: #111827; text-align: right; margin-bottom: 16px; }
  `;
  document.head.appendChild(style);

  // 初期枠組みの生成
  container.innerHTML = `
    <div class="ar-form-wrapper">
      <form id="ar-embed-form">
        <div class="ar-form-group">
          <label class="ar-form-label">お名前</label>
          <input type="text" id="ar-name" class="ar-form-input" required placeholder="例：山田 太郎" />
        </div>
        <div class="ar-form-group">
          <label class="ar-form-label">メールアドレス</label>
          <input type="email" id="ar-email" class="ar-form-input" required placeholder="example@example.com" />
        </div>
        <div class="ar-form-group">
          <label class="ar-form-label">表示する画像・動画</label>
          <input type="file" id="ar-file" class="ar-form-input" accept="image/*,video/mp4,video/webm" required />
        </div>
        <div class="ar-form-group">
          <label class="ar-form-label">オプション選択</label>
          <select id="ar-option" class="ar-form-select">
            <option value="0|読み込み中...">読み込み中...</option>
          </select>
        </div>
        <div class="ar-price-display">合計: <span id="ar-total-price">0</span>円</div>
        <button type="submit" id="ar-submit-btn" class="ar-form-btn">ARを発注する</button>
      </form>
      <div id="ar-result-message" class="ar-form-result">
        ご注文ありがとうございます！<br>
        <a href="#" id="ar-result-link" target="_blank" style="color: #166534; font-weight: bold; word-break: break-all;"></a>
      </div>
    </div>
  `;

  const optionSelect = document.getElementById('ar-option');
  const priceDisplay = document.getElementById('ar-total-price');

  // DBから動的にオプション一覧を取得してドロップダウンを構築
  fetch('https://kototama.vercel.app/api/options')
    .then(res => res.json())
    .then(data => {
      if (data.options && data.options.length > 0) {
        optionSelect.innerHTML = data.options.map(opt => 
          `<option value="${opt.price}|${opt.name}">${opt.name} (${opt.price > 0 ? '+' + Number(opt.price).toLocaleString() + '円' : '無料'})</option>`
        ).join('');
        priceDisplay.textContent = Number(data.options[0].price).toLocaleString();
      }
    })
    .catch(() => {
      optionSelect.innerHTML = '<option value="0|オプションなし">オプションなし (無料)</option>';
    });

  optionSelect.addEventListener('change', (e) => {
    const price = e.target.value.split('|')[0];
    priceDisplay.textContent = parseInt(price).toLocaleString();
  });

  const form = document.getElementById('ar-embed-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('ar-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '送信中...';

    const optionValue = optionSelect.value.split('|');
    const totalPrice = optionValue[0];
    const optionName = optionValue[1];

    const formData = new FormData();
    formData.append('customerName', document.getElementById('ar-name').value);
    formData.append('email', document.getElementById('ar-email').value);
    formData.append('file', document.getElementById('ar-file').files[0]);
    formData.append('clientId', clientId);
    formData.append('optionDetails', optionName);
    formData.append('totalPrice', totalPrice);

    try {
      const response = await fetch('https://kototama.vercel.app/api/embed-order', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (data.success) {
        form.style.display = 'none';
        document.getElementById('ar-result-message').style.display = 'block';
        document.getElementById('ar-result-link').href = data.arUrl;
        document.getElementById('ar-result-link').textContent = data.arUrl;
      } else {
        alert('エラー: ' + data.error);
      }
    } catch (err) {
      alert('通信エラーが発生しました。');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'ARを発注する';
    }
  });
})();