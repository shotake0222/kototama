'use client';
import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import Script from 'next/script';

// 💡 アニメーションの定義リスト
const ANIMATION_TYPES = [
  { key: 'none', label: 'なし' },
  { key: 'scroll', label: 'スクロール(下から上)' },
  { key: 'scroll-down', label: 'スクロール(上から下)' },
  { key: 'scroll-left', label: 'スクロール(右から左)' },
  { key: 'scroll-right', label: 'スクロール(左から右)' },
  { key: 'pulse', label: 'ふわふわ' },
  { key: 'spin', label: '回転' },
  { key: 'bounce', label: 'バウンド' }
];

export default function Dashboard() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<'orders' | 'images' | 'settings' | 'bulk' | 'emails'>('orders');
  const [activeImageTab, setActiveImageTab] = useState<'processed' | 'original' | 'targets' | 'templates'>('processed');
  
  const [orders, setOrders] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [clientId, setClientId] = useState('');
  
  const [showEmbedModal, setShowEmbedModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{ type: string, id?: string, oldPath?: string } | null>(null);

  const [csvData, setCsvData] = useState<any[]>([]);
  const [bulkImages, setBulkImages] = useState<File[]>([]);
  const [isUploadingBulk, setIsUploadingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [csvEncoding, setCsvEncoding] = useState<'UTF-8' | 'Shift_JIS'>('UTF-8');
  const [isCompiling, setIsCompiling] = useState(false);

  const [emailTemplates, setEmailTemplates] = useState<any[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody, setMailBody] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [mailTemplateName, setMailTemplateName] = useState('');

  const fetchData = async () => {
    const { data: ordersData } = await supabase.from('orders').select('*, order_images(*)').order('created_at', { ascending: false });
    if (ordersData) setOrders(ordersData);
    
    const { data: settingsData } = await supabase.from('system_settings').select('*').order('key', { ascending: true });
    if (settingsData) {
      setSettings(settingsData);
      const templatesData = settingsData.filter(s => s.key.startsWith('MAIL_TEMPLATE_'));
      setEmailTemplates(templatesData);
    }
    
    const { data: storageData } = await supabase.storage.from('ar_images').list('templates', { limit: 100 });
    if (storageData) setTemplates(storageData.filter(f => f.name !== '.emptyFolderPlaceholder'));
  };

  useEffect(() => { fetchData(); }, [supabase]);

  const getImageUrl = (path: string) => {
    if (!path) return '';
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ar_images/${path}`;
  };

  const compileImageToMind = async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const img = new Image();
        img.onload = async () => {
          try {
            // @ts-ignore
            const compiler = new window.MINDAR.IMAGE.Compiler();
            await compiler.compileImageTargets([img], (progress: number) => { console.log('MindAR Compiling Progress:', progress.toFixed(2)); });
            const exportedBuffer = await compiler.exportData();
            const blob = new Blob([exportedBuffer], { type: 'application/octet-stream' });
            resolve(blob);
          } catch (err) { reject(err); }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDeleteOrder = async (orderId: string, customerName: string) => {
    if (!confirm(`本当に ${customerName} 様の注文データを完全に削除しますか？\n※この操作は取り消せません。`)) return;
    try {
      await supabase.from('order_images').delete().eq('order_id', orderId);
      await supabase.from('orders').delete().eq('id', orderId);
      fetchData();
      alert('削除しました。');
    } catch (err) {
      console.error(err);
      alert('削除に失敗しました。');
    }
  };

  const handleUpdateNfcUid = async (orderId: string, currentUid: string | null) => {
    const newUid = prompt('この注文に紐付けるNFCタグのUID（シリアルナンバー）を入力・スキャンしてください。', currentUid || '');
    if (newUid !== null && newUid !== currentUid) {
      await supabase.from('orders').update({ nfc_uid: newUid.trim() }).eq('id', orderId);
      fetchData();
    }
  };

  const handleUpdateScale = async (orderId: string, currentScale: number) => {
    const newScale = prompt('新しいサイズ倍率を入力してください（例: 1.0, 1.5, 0.5）', currentScale.toString());
    if (newScale && !isNaN(Number(newScale))) {
      await supabase.from('orders').update({ object_scale: Number(newScale) }).eq('id', orderId);
      fetchData();
    }
  };

  // 💡 アニメーションの更新機能
  const handleUpdateAnimation = async (orderId: string, currentType: string) => {
    const currentLabel = ANIMATION_TYPES.find(t => t.key === (currentType || 'none'))?.label;
    const menu = ANIMATION_TYPES.map((t, idx) => `${idx + 1}: ${t.label}`).join('\n');
    
    const input = prompt(`現在のアニメーション: ${currentLabel}\n\n変更する場合は以下の番号を入力してください:\n${menu}`, '');
    if (!input) return;
    
    const selectedIdx = parseInt(input) - 1;
    if (selectedIdx >= 0 && selectedIdx < ANIMATION_TYPES.length) {
      const newType = ANIMATION_TYPES[selectedIdx].key;
      try {
        await supabase.from('orders').update({ animation_type: newType }).eq('id', orderId);
        fetchData();
        alert(`アニメーションを「${ANIMATION_TYPES[selectedIdx].label}」に変更しました。`);
      } catch (err) {
        alert('変更に失敗しました。');
      }
    } else {
      alert('無効な番号です。');
    }
  };

  const handleUpdateSetting = async (settingKey: string, settingName: string, currentValue: string) => {
    const newValue = prompt(`【${settingName}】の新しい値を入力してください`, currentValue);
    if (newValue !== null && newValue !== currentValue) {
      await supabase.from('system_settings').update({ value: newValue }).eq('key', settingKey);
      fetchData();
    }
  };

  const handleAddSetting = async () => {
    const key = prompt('システムキー名を入力してください\n※商品を追加する場合は PRODUCT_ACRYLIC のように PRODUCT_ から始めてください');
    if (!key) return;
    const name = prompt('設定項目名を入力してください');
    if (!name) return;
    const value = prompt('設定値を入力してください\n※商品を追加する場合は「商品名,価格」の形式で入力してください\n例: アクリルスタンド,4500');
    if (!value) return;
    await supabase.from('system_settings').insert({ key, name, value });
    fetchData();
  };

  const handleDeleteSetting = async (settingKey: string, settingName: string) => {
    if (!confirm(`本当に「${settingName}」を削除しますか？`)) return;
    await supabase.from('system_settings').delete().eq('key', settingKey);
    fetchData();
  };

  const triggerFileInput = (type: string, id?: string, oldPath?: string) => {
    setUploadTarget({ type, id, oldPath });
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;

    try {
      const fileExt = file.name.split('.').pop();
      let newPath = '';

      if (uploadTarget.type === 'targets') {
        setIsCompiling(true);
        const baseName = `target_${uuidv4().substring(0,8)}`;
        const imgPath = `targets/${baseName}.${fileExt}`;
        const mindPath = `minds/${baseName}.mind`;
        const mindBlob = await compileImageToMind(file);

        await supabase.storage.from('ar_images').upload(imgPath, file);
        await supabase.storage.from('ar_images').upload(mindPath, mindBlob);
        await supabase.from('orders').update({ target_image_url: imgPath, mind_file_url: mindPath, ar_mode: 'mindar' }).eq('id', uploadTarget.id);
        setIsCompiling(false);
      } else {
        if (uploadTarget.type === 'template') {
          const fileName = prompt('テンプレートファイル名を入力（例: T-11）', file.name.split('.')[0]);
          if (!fileName) return;
          newPath = `templates/${fileName}.${fileExt}`;
          await supabase.storage.from('ar_images').upload(newPath, file, { upsert: true });
        } else {
          const prefix = uploadTarget.type === 'processed' ? 'proc_' : 'orig_';
          newPath = `${prefix}${uuidv4()}.${fileExt}`;
          await supabase.storage.from('ar_images').upload(newPath, file);
          const updateData = uploadTarget.type === 'processed' ? { processed_image_url: newPath } : { original_image_url: newPath };
          await supabase.from('order_images').update(updateData).eq('id', uploadTarget.id);
        }
      }
      
      if (uploadTarget.oldPath && !uploadTarget.oldPath.startsWith('templates/')) {
        await supabase.storage.from('ar_images').remove([uploadTarget.oldPath]);
      }
      fetchData();
      alert('オブジェクト（画像）の差し替えが完了しました！');
    } catch (err) { 
      setIsCompiling(false); 
      alert('画像のアップロードに失敗しました。');
    } finally { 
      if (fileInputRef.current) fileInputRef.current.value = ''; 
      setUploadTarget(null); 
    }
  };

  const handleDeleteImage = async (type: string, id?: string, path?: string) => {
    if (!confirm('本当にこの画像を削除しますか？')) return;
    try {
      if (type === 'template' && path) { await supabase.storage.from('ar_images').remove([`templates/${path}`]);
      } else if (id && path) {
        const updateData = type === 'processed' ? { processed_image_url: null } : { original_image_url: null };
        await supabase.from('order_images').update(updateData).eq('id', id);
        if (!path.startsWith('templates/')) await supabase.storage.from('ar_images').remove([path]);
      }
      fetchData();
    } catch (err) { alert('削除に失敗しました。'); }
  };

  const handleDownloadSampleCsv = () => {
    const csvContent = "氏名,メールアドレス,クライアントID,NFC_UID,種類,テンプレートID,画像ファイル名,アニメーション,性別,年齢,郵便番号,住所,備考\n" +
                       "テスト 太郎,test@example.com,bulk_001,NFC-001,キーホルダー,,test_image1.jpg,none,男性,30,1000001,東京都千代田区,1枚アップロード\n" +
                       "テスト 花子,test2@example.com,bulk_001,NFC-002,キーホルダー,T-01,,,女性,25,1000001,東京都千代田区,テンプレート使用\n" +
                       "テスト 次郎,test3@example.com,bulk_001,NFC-003,リボンチャーム,,test_image2.jpg|test_image3.jpg,scroll,男性,40,1000001,東京都千代田区,アルバム＋スクロール";
    
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "ことたま_一括登録サンプル.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.readAsText(file, csvEncoding);
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim());
      const parsed = lines.slice(1).map(line => {
        let values = []; let inQuotes = false; let currentValue = '';
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') inQuotes = !inQuotes;
          else if (char === ',' && !inQuotes) { values.push(currentValue); currentValue = ''; }
          else currentValue += char;
        }
        values.push(currentValue);
        const obj: any = {};
        headers.forEach((h, i) => { obj[h] = values[i] ? values[i].trim().replace(/^"|"$/g, '') : ''; });
        return obj;
      });
      setCsvData(parsed);
    };
  };

  const handleBulkImagesUpload = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) setBulkImages(Array.from(e.target.files)); };

  const executeBulkUpload = async () => {
    if (!confirm(`合計 ${csvData.length} 件のデータを作成します。よろしいですか？`)) return;
    setIsUploadingBulk(true); setBulkProgress({ current: 0, total: csvData.length });
    const getSettingNum = (key: string, def: number) => { const found = settings.find(s => s.key === key); return found && !isNaN(Number(found.value)) ? Number(found.value) : def; };
    const PRICE_TAX = getSettingNum('PRICE_TAX', 0.1);
    const PRICE_POSTAGE = getSettingNum('PRICE_POSTAGE', 380);
    const PRICE_ALBUM = getSettingNum('PRICE_ALBUM', 2500);
    const PRICE_ANIMATION = getSettingNum('PRICE_ANIMATION', 1000);

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const targetFileNames = row['画像ファイル名'] ? row['画像ファイル名'].split(/[|]/).map((n: string) => n.trim()) : [];
      const templateId = row['テンプレートID'];
      const itemType = row['種類'] || 'キーホルダー';
      const nfcUid = row['NFC_UID'];
      const animationType = row['アニメーション'] || 'none';
      
      const uploadFiles = targetFileNames.map((name: string) => bulkImages.find(f => f.name === name)).filter(Boolean);

      let subTotal = 1500 + PRICE_POSTAGE; 
      if (uploadFiles.length > 1) subTotal += PRICE_ALBUM; 
      if (animationType !== 'none') subTotal += PRICE_ANIMATION; 

      const total = subTotal + Math.floor(subTotal * PRICE_TAX);
      const optionDetails = `【種類】${itemType}\n【画像】${templateId ? 'テンプレート' : 'アップロード'}\n【アニメーション】${animationType}\n【性別】${row['性別'] || ''}\n【年齢】${row['年齢'] || ''}\n【住所】〒${row['郵便番号'] || ''} ${row['住所'] || ''}\n【備考】${row['備考'] || ''}`;

      try {
        const hashId = uuidv4().replace(/-/g, '').substring(0, 16);
        const { data: order, error: orderError } = await supabase.from('orders').insert({
          customer_name: row['氏名'] || '名称未設定', 
          email: row['メールアドレス'] || 'no-email@example.com',
          hash_id: hashId, 
          nfc_uid: nfcUid || null, 
          total_price: total, 
          status: 'pending', 
          client_id: row['クライアントID'] || 'bulk_upload', 
          option_details: optionDetails.trim(),
          animation_type: animationType 
        }).select().single();

        if (orderError) throw orderError;

        if (templateId) {
          let formattedId = templateId.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s: string) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).toUpperCase().trim();
          formattedId = formattedId.replace(/ー|−|_/g, '-');
          if (!formattedId.includes('-')) formattedId = formattedId.replace('T', 'T-');
          const processedFileName = `templates/${formattedId}.jpg`;
          await supabase.from('order_images').insert({ order_id: order.id, original_image_url: null, processed_image_url: processedFileName });
        } else if (uploadFiles.length > 0) {
          for (const file of uploadFiles as File[]) {
            const fileExt = file.name.split('.').pop();
            const processedFileName = `proc_bulk_${uuidv4()}.${fileExt}`;
            await supabase.storage.from('ar_images').upload(processedFileName, file);
            await supabase.from('order_images').insert({ order_id: order.id, original_image_url: null, processed_image_url: processedFileName });
          }
        }
      } catch (err) { console.error(`Row ${i + 1} Error:`, err); }
      setBulkProgress({ current: i + 1, total: csvData.length });
    }
    setIsUploadingBulk(false); alert('一括処理が完了しました！'); setCsvData([]); setBulkImages([]); fetchData();
  };

  const handleSaveMailTemplate = async () => {
    if (!mailTemplateName || !mailSubject || !mailBody) return alert('テンプレート名、件名、本文をすべて入力してください。');
    const key = `MAIL_TEMPLATE_${Date.now()}`;
    const value = JSON.stringify({ subject: mailSubject, body: mailBody });
    await supabase.from('system_settings').insert({ key, name: mailTemplateName, value });
    alert('テンプレートを保存しました。');
    fetchData();
    setMailTemplateName('');
  };

  const handleApplyTemplate = (key: string) => {
    const tmpl = emailTemplates.find(t => t.key === key);
    if (tmpl) {
      try {
        const parsed = JSON.parse(tmpl.value);
        setMailSubject(parsed.subject);
        setMailBody(parsed.body);
      } catch (e) {
        setMailBody(tmpl.value);
      }
    }
  };

  const handleExecuteMailDelivery = async () => {
    if (selectedOrderIds.length === 0) return alert('配信先のユーザーを選択してください。');
    if (!mailSubject || !mailBody) return alert('件名と本文を入力してください。');
    
    const confirmMsg = scheduledTime 
      ? `${selectedOrderIds.length}件のユーザーに\n【${scheduledTime.replace('T', ' ')}】に配信予約しますか？`
      : `${selectedOrderIds.length}件のユーザーに\n【今すぐ】メールを配信しますか？`;
      
    if (!confirm(confirmMsg)) return;

    try {
      alert('配信リクエストが正常に処理されました！\n（※実際のメール送信にはバックエンドAPIの設定が必要です）');
      setSelectedOrderIds([]);
      setMailSubject('');
      setMailBody('');
      setScheduledTime('');
    } catch (err) {
      alert('エラーが発生しました。');
    }
  };

  const handleSelectAllOrders = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedOrderIds(orders.map(o => o.id));
    else setSelectedOrderIds([]);
  };

  const handleSelectOrder = (orderId: string) => {
    if (selectedOrderIds.includes(orderId)) setSelectedOrderIds(selectedOrderIds.filter(id => id !== orderId));
    else setSelectedOrderIds([...selectedOrderIds, orderId]);
  };

  const generatedTag = clientId 
    ? `<div id="ar-order-form-container"></div>\n<script src="https://app.kototama-ar.com/embed.js" id="ar-embed-script" data-client-id="${clientId}"></script>`
    : '※クライアントIDを入力すると、ここにタグが表示されます。';

  return (
    <>
      <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/mind-ar@1.2.2/dist/mindar-image.prod.js" strategy="lazyOnload" />

      {/* 埋め込みサンプル用モーダル */}
      {showEmbedModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 animate-fade-in">
            <h3 className="text-xl font-bold mb-4 border-b pb-2 text-blue-900">🌐 ホームページへの埋め込みサンプル</h3>
            <p className="text-sm text-gray-600 mb-4">以下のHTMLコードをコピーして、あなたのホームページやLP内の「表示させたい場所」に貼り付けてください。</p>
            <div className="relative">
              <pre className="bg-gray-800 text-green-400 p-4 rounded-lg text-sm font-mono overflow-x-auto border border-gray-900">
{`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>ことたま 注文ページ</title>
</head>
<body style="background-color: #f3f4f6; padding: 20px;">

  <h1 style="text-align: center;">ご注文はこちらから</h1>
  
  <!-- ↓↓↓ ここからコピーして貼り付け ↓↓↓ -->
  ${generatedTag}
  <!-- ↑↑↑ ここまで ↑↑↑ -->

</body>
</html>`}
              </pre>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(generatedTag);
                  alert('埋め込みタグをコピーしました！');
                }}
                className="absolute top-2 right-2 bg-blue-500 hover:bg-blue-600 text-white font-bold px-4 py-2 rounded text-xs transition shadow"
              >
                タグだけをコピー
              </button>
            </div>
            <div className="mt-6 text-right">
              <button onClick={() => setShowEmbedModal(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2 rounded-lg font-bold transition">閉じる</button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-gray-50 p-8 text-gray-800 font-sans pb-24">
        {isCompiling && (
          <div className="fixed inset-0 bg-black/60 z-50 flex flex-col items-center justify-center text-white">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-green-500 mb-4"></div>
            <p className="text-xl font-bold">画像をAIで解析中...</p>
          </div>
        )}

        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-extrabold mb-8 text-gray-900 border-b pb-4">ことたま 管理ダッシュボード</h1>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleFileChange} />

          <div className="flex space-x-2 border-b-2 border-gray-200 mb-8 overflow-x-auto">
            <button onClick={() => setActiveTab('orders')} className={`px-6 py-3 font-bold rounded-t-lg transition whitespace-nowrap ${activeTab === 'orders' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>📦 注文管理</button>
            <button onClick={() => setActiveTab('images')} className={`px-6 py-3 font-bold rounded-t-lg transition whitespace-nowrap ${activeTab === 'images' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>🖼️ 画像・マーカー管理</button>
            <button onClick={() => setActiveTab('settings')} className={`px-6 py-3 font-bold rounded-t-lg transition whitespace-nowrap ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>⚙️ システム設定</button>
            <button onClick={() => setActiveTab('bulk')} className={`px-6 py-3 font-bold rounded-t-lg transition whitespace-nowrap ${activeTab === 'bulk' ? 'bg-green-600 text-white shadow-lg transform -translate-y-1' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>📁 一括発注処理</button>
            <button onClick={() => setActiveTab('emails')} className={`px-6 py-3 font-bold rounded-t-lg transition whitespace-nowrap ${activeTab === 'emails' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>📧 メール配信</button>
          </div>

          {/* 注文管理 */}
          {activeTab === 'orders' && (
            <div className="space-y-8 animate-fade-in">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4 border-b pb-4">
                  <h2 className="text-lg font-bold text-blue-900">🔗 クライアント用 埋め込みタグ生成</h2>
                  <button onClick={() => setShowEmbedModal(true)} className="text-sm bg-blue-50 text-blue-600 border border-blue-200 px-4 py-2 rounded-lg font-bold hover:bg-blue-100 transition shadow-sm">
                    💡 埋め込みサンプルを確認
                  </button>
                </div>
                <div className="flex gap-4 mb-4">
                  <input type="text" placeholder="クライアントID" className="border-2 border-gray-200 p-2 rounded-lg w-64 focus:border-blue-400 outline-none" value={clientId} onChange={(e) => setClientId(e.target.value)} />
                </div>
                <div className="bg-gray-800 text-green-400 p-4 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap shadow-inner">{generatedTag}</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 bg-gray-50 border-b flex justify-between items-center"><h2 className="font-bold text-gray-700">受注・顧客一覧</h2><span className="text-sm text-gray-500">全 {orders.length} 件</span></div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm text-left">
                    <thead className="bg-white border-b">
                      <tr>
                        <th className="p-4 font-bold text-gray-600">受注日時 / ID</th>
                        <th className="p-4 font-bold text-gray-600">顧客名 / メール</th>
                        <th className="p-4 font-bold text-gray-600 text-center">表示オブジェクト</th>
                        <th className="p-4 font-bold text-gray-600">オプション詳細</th>
                        {/* 💡 ヘッダーを変更 */}
                        <th className="p-4 font-bold text-gray-600">NFC / AR設定</th>
                        <th className="p-4 font-bold text-gray-600">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => {
                        const imgData = order.order_images?.[0];
                        const imgPath = imgData ? (imgData.processed_image_url || imgData.original_image_url) : null;
                        const currentAnimLabel = ANIMATION_TYPES.find(t => t.key === (order.animation_type || 'none'))?.label;
                        
                        return (
                        <tr key={order.id} className="border-b hover:bg-blue-50 transition">
                          <td className="p-4"><div className="font-bold">{new Date(order.created_at).toLocaleDateString()}</div><div className="text-xs text-gray-400 mt-1 font-mono">{order.hash_id?.substring(0,8)}...</div></td>
                          <td className="p-4"><div className="font-bold text-gray-800">{order.customer_name}</div><div className="text-gray-500 text-xs mt-1">{order.email}</div></td>
                          
                          <td className="p-4 text-center">
                            {imgPath ? (
                              <div className="flex flex-col items-center gap-2">
                                <img src={getImageUrl(imgPath)} alt="ARオブジェクト" className="w-16 h-16 object-contain bg-gray-100 rounded border border-gray-200" />
                                <button 
                                  onClick={() => triggerFileInput(imgData.processed_image_url ? 'processed' : 'original', imgData.id, imgPath)} 
                                  className="text-xs font-bold bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-3 py-1 rounded-full transition shadow-sm"
                                >
                                  🔄 差し替え
                                </button>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">未設定</span>
                            )}
                          </td>
                          
                          <td className="p-4"><div className="text-gray-600 text-xs whitespace-pre-wrap bg-gray-50 p-2 rounded border max-w-xs overflow-auto max-h-24">{order.option_details || 'なし'}</div><div className="font-bold text-red-600 mt-2">合計: ¥{order.total_price?.toLocaleString() || 0}</div></td>
                          
                          {/* 💡 AR設定とアニメーション設定の表示 */}
                          <td className="p-4">
                            <div className="flex flex-col gap-2 items-start">
                              <div className="flex items-center gap-2">
                                {order.nfc_uid ? <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-mono font-bold border border-green-200">{order.nfc_uid}</span> : <span className="text-gray-400 text-xs">未登録</span>}
                                <button onClick={() => handleUpdateNfcUid(order.id, order.nfc_uid)} className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded transition">更新</button>
                              </div>
                              <div className="flex gap-1 mt-1">
                                {order.ar_mode === 'mindar' ? <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded font-bold text-xs inline-block">MindAR</span> : <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-bold text-xs inline-block">Hiroマーカー</span>}
                                <span className={`px-2 py-1 rounded font-bold text-xs inline-block ${order.animation_type && order.animation_type !== 'none' ? 'bg-pink-100 text-pink-800' : 'bg-gray-100 text-gray-500'}`}>
                                  {currentAnimLabel}
                                </span>
                              </div>
                            </div>
                          </td>
                          
                          {/* 💡 操作欄に「アニメ変更」を追加 */}
                          <td className="p-4 whitespace-nowrap">
                            <div className="flex flex-col gap-2">
                              <div className="flex gap-2">
                                <a href={`/ar?uid=${order.nfc_uid || order.hash_id}`} target="_blank" className="bg-blue-500 hover:bg-blue-600 text-white font-bold px-3 py-2 rounded-lg text-xs shadow transition">AR確認</a>
                                <button onClick={() => handleDeleteOrder(order.id, order.customer_name)} className="bg-red-100 hover:bg-red-200 text-red-700 font-bold px-3 py-2 rounded-lg text-xs shadow-sm transition">削除</button>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => handleUpdateScale(order.id, order.object_scale || 1.0)} className="flex-1 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-2 rounded-lg transition shadow-sm text-center">x{order.object_scale || 1.0}変更</button>
                                <button onClick={() => handleUpdateAnimation(order.id, order.animation_type || 'none')} className="flex-1 text-xs bg-pink-50 hover:bg-pink-100 border border-pink-200 text-pink-700 px-2 py-2 rounded-lg transition shadow-sm text-center">🎬 アニメ変更</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 画像・マーカー管理 */}
          {activeTab === 'images' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
              <div className="flex bg-gray-50 border-b overflow-x-auto">
                <button onClick={() => setActiveImageTab('processed')} className={`px-6 py-3 font-bold text-sm whitespace-nowrap transition ${activeImageTab === 'processed' ? 'border-b-4 border-blue-500 text-blue-700 bg-white' : 'text-gray-500 hover:bg-gray-100'}`}>浮かび上がる画像</button>
                <button onClick={() => setActiveImageTab('original')} className={`px-6 py-3 font-bold text-sm whitespace-nowrap transition ${activeImageTab === 'original' ? 'border-b-4 border-blue-500 text-blue-700 bg-white' : 'text-gray-500 hover:bg-gray-100'}`}>オリジナル画像</button>
                <button onClick={() => setActiveImageTab('targets')} className={`px-6 py-3 font-bold text-sm whitespace-nowrap transition ${activeImageTab === 'targets' ? 'border-b-4 border-green-500 text-green-700 bg-white' : 'text-gray-500 hover:bg-gray-100'}`}>🎯 MindARターゲット</button>
                <button onClick={() => setActiveImageTab('templates')} className={`px-6 py-3 font-bold text-sm whitespace-nowrap transition ${activeImageTab === 'templates' ? 'border-b-4 border-blue-500 text-blue-700 bg-white' : 'text-gray-500 hover:bg-gray-100'}`}>テンプレート一覧</button>
              </div>
              <div className="p-6">
                {activeImageTab === 'targets' && (
                  <>
                    <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-6 text-sm text-green-800">💡 <b>イメージトラッキング（MindAR）用のターゲット画像</b><br/>画像をアップロードすると、ブラウザが自動的にAR用のトラッキングデータ（.mind）を生成します。</div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm text-left"><thead className="bg-gray-100 border-b"><tr><th className="p-3">画像プレビュー</th><th className="p-3">顧客名</th><th className="p-3">.mind ファイル</th><th className="p-3 text-right">操作</th></tr></thead>
                        <tbody>
                          {orders.map((order) => (
                            <tr key={order.id} className="border-b hover:bg-gray-50">
                              <td className="p-3 w-32">{order.target_image_url ? <img src={getImageUrl(order.target_image_url)} alt="target" className="w-24 h-24 object-cover rounded border" /> : <div className="w-24 h-24 bg-gray-100 flex items-center justify-center text-xs text-gray-400">未設定</div>}</td>
                              <td className="p-3 font-bold">{order.customer_name} 様</td>
                              <td className="p-3 font-mono text-xs text-gray-500">{order.mind_file_url ? '✅ 生成済み' : '未生成'}</td>
                              <td className="p-3 text-right space-x-2"><button onClick={() => triggerFileInput('targets', order.id, order.target_image_url)} className="bg-green-100 text-green-700 font-bold px-3 py-2 rounded text-xs hover:bg-green-200">{order.target_image_url ? '変更して再生成' : 'ターゲット登録'}</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {(activeImageTab === 'processed' || activeImageTab === 'original') && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left"><thead className="bg-gray-100 border-b"><tr><th className="p-3 font-bold text-gray-600">プレビュー</th><th className="p-3 font-bold text-gray-600">顧客名</th><th className="p-3 font-bold text-gray-600">現在のパス (URL)</th><th className="p-3 font-bold text-gray-600 text-right">操作</th></tr></thead>
                      <tbody>
                        {orders.map((order) => {
                          const imgData = order.order_images?.[0];
                          if (!imgData) return null;
                          const path = activeImageTab === 'processed' ? imgData.processed_image_url : imgData.original_image_url;
                          if (!path) return null;
                          return (
                            <tr key={order.id} className="border-b hover:bg-gray-50">
                              <td className="p-3 w-32"><img src={getImageUrl(path)} alt="preview" className="w-24 h-24 object-contain bg-gray-200 rounded border" /></td>
                              <td className="p-3"><div className="font-bold">{order.customer_name} 様</div></td>
                              <td className="p-3 font-mono text-xs text-gray-500 break-all">{path}</td>
                              <td className="p-3 text-right space-x-2"><button onClick={() => triggerFileInput(activeImageTab, imgData.id, path)} className="bg-blue-100 text-blue-700 hover:bg-blue-200 font-bold px-3 py-2 rounded text-xs transition">変更</button><button onClick={() => handleDeleteImage(activeImageTab, imgData.id, path)} className="bg-red-50 text-red-600 hover:bg-red-100 font-bold px-3 py-2 rounded text-xs transition">削除</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {activeImageTab === 'templates' && (
                  <div>
                    <div className="mb-4 text-right"><button onClick={() => triggerFileInput('template')} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded shadow transition">＋ 新規テンプレート追加</button></div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm text-left"><thead className="bg-gray-100 border-b"><tr><th className="p-3 font-bold text-gray-600 w-32">プレビュー</th><th className="p-3 font-bold text-gray-600">ファイル名 (ID)</th><th className="p-3 font-bold text-gray-600 text-right">操作</th></tr></thead>
                        <tbody>
                          {templates.map((file) => (
                            <tr key={file.id} className="border-b hover:bg-gray-50">
                              <td className="p-3"><img src={getImageUrl(`templates/${file.name}`)} alt="preview" className="w-24 h-24 object-contain bg-gray-200 rounded border" /></td>
                              <td className="p-3 font-bold text-gray-700">{file.name}</td>
                              <td className="p-3 text-right space-x-2"><button onClick={() => triggerFileInput('template')} className="bg-blue-100 text-blue-700 hover:bg-blue-200 font-bold px-3 py-2 rounded text-xs transition">上書き</button><button onClick={() => handleDeleteImage('template', undefined, file.name)} className="bg-red-50 text-red-600 hover:bg-red-100 font-bold px-3 py-2 rounded text-xs transition">削除</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* システム設定 */}
          {activeTab === 'settings' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
              <div className="p-6 bg-rose-50 border-b flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h2 className="font-bold text-rose-900 text-lg">システム定数・各種設定</h2>
                  <p className="text-sm text-rose-700 mt-1">ここで変更・追加した値は、システム全体で利用可能な変数として即座に反映されます。</p>
                </div>
                <button onClick={handleAddSetting} className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-5 py-2 rounded-lg shadow-sm transition whitespace-nowrap">＋ 新規設定を追加</button>
              </div>
              
              <div className="p-6 bg-white border-b border-gray-100">
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded text-sm text-blue-800">
                  <h4 className="font-bold mb-1">🛒 フォームに新しい商品（ラジオボタン）を追加するには？</h4>
                  <p>「＋ 新規設定を追加」ボタンを押し、キー名を <code className="bg-white px-1 text-blue-900 rounded border">PRODUCT_</code> から始まる名前にして、値を <code className="bg-white px-1 text-blue-900 rounded border">商品名,価格</code> の形式で登録してください。世界中のフォームに即座に新しい選択肢が追加されます。<br/>
                  （例）キー名：<code>PRODUCT_ACRYLIC</code> ／ 設定値：<code>アクリルスタンド,4500</code></p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-left">
                  <thead className="bg-white border-b"><tr><th className="p-4 font-bold text-gray-600 w-1/4">キー名（システム変数）</th><th className="p-4 font-bold text-gray-600 w-1/3">設定項目名</th><th className="p-4 font-bold text-gray-600">現在の値</th><th className="p-4 font-bold text-gray-600 text-right">操作</th></tr></thead>
                  <tbody>
                    {settings.map((setting) => (
                      <tr key={setting.key} className="border-b hover:bg-gray-50 transition">
                        <td className="p-4 font-mono text-xs text-gray-500 bg-gray-50">{setting.key}</td>
                        <td className="p-4 font-bold text-gray-700">{setting.name}</td>
                        <td className="p-4"><div className="bg-white border px-3 py-2 rounded text-gray-800 font-mono inline-block break-all">{setting.value}</div></td>
                        <td className="p-4 text-right space-x-2"><button onClick={() => handleUpdateSetting(setting.key, setting.name, setting.value)} className="bg-gray-800 hover:bg-gray-900 text-white font-bold px-3 py-2 rounded text-xs shadow transition">編集</button><button onClick={() => handleDeleteSetting(setting.key, setting.name)} className="bg-red-50 text-red-600 hover:bg-red-100 font-bold px-3 py-2 rounded text-xs transition">削除</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 一括発注処理 */}
          {activeTab === 'bulk' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-green-800">CSVと画像フォルダによる一括登録</h2>
                  <button onClick={handleDownloadSampleCsv} className="bg-white border-2 border-green-500 text-green-600 font-bold px-4 py-2 rounded-lg shadow-sm hover:bg-green-50 transition">📥 サンプルCSVをダウンロード</button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  <div className="bg-green-50 p-6 rounded-lg border border-green-100">
                    <h3 className="font-bold text-green-900 mb-2">Step 1: CSVファイルの読み込み</h3>
                    <div className="mb-3 text-sm">
                      <label className="mr-4"><input type="radio" name="enc" checked={csvEncoding === 'UTF-8'} onChange={() => setCsvEncoding('UTF-8')} /> UTF-8（標準）</label>
                      <label><input type="radio" name="enc" checked={csvEncoding === 'Shift_JIS'} onChange={() => setCsvEncoding('Shift_JIS')} /> Shift-JIS</label>
                    </div>
                    <input type="file" accept=".csv" onChange={handleCsvUpload} className="w-full bg-white border p-2 rounded" />
                  </div>
                  <div className="bg-green-50 p-6 rounded-lg border border-green-100">
                    <h3 className="font-bold text-green-900 mb-2">Step 2: 画像ファイル群の読み込み</h3>
                    <p className="text-xs text-green-700 mb-2">※アルバムの場合は対象画像をすべて選択してください。</p>
                    <input type="file" multiple accept="image/*" onChange={handleBulkImagesUpload} className="w-full bg-white border p-2 rounded" />
                  </div>
                </div>
                {csvData.length > 0 && (
                  <div className="mt-8 border-t pt-8">
                    <h3 className="font-bold text-lg mb-4">マッチングプレビュー（全 {csvData.length} 件）</h3>
                    <div className="max-h-64 overflow-y-auto mb-6 bg-gray-50 border rounded">
                      <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="p-3 border-b">氏名</th>
                            <th className="p-3 border-b">画像ファイル名</th>
                            <th className="p-3 border-b">演出</th>
                            <th className="p-3 border-b text-center">ステータス</th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvData.map((row, idx) => {
                            const targetNames = row['画像ファイル名'] ? row['画像ファイル名'].split(/[|]/).map((n: string) => n.trim()) : [];
                            const isTemplate = !!row['テンプレートID'];
                            const animation = row['アニメーション'];
                            
                            let foundFilesCount = 0;
                            if (targetNames.length > 0) {
                              targetNames.forEach((name: string) => {
                                if (bulkImages.some(f => f.name === name)) foundFilesCount++;
                              });
                            }
                            
                            let statusHtml = <span className="text-gray-400">-</span>;
                            if (isTemplate) {
                              statusHtml = <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold">テンプレート</span>;
                            } else if (targetNames.length > 0) {
                              if (foundFilesCount === targetNames.length) {
                                statusHtml = <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold">✅ 一致 ({foundFilesCount}枚)</span>;
                              } else {
                                statusHtml = <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-bold">❌ 画像不足 ({foundFilesCount}/{targetNames.length})</span>;
                              }
                            }
                            return (
                              <tr key={idx} className="border-b">
                                <td className="p-2">{row['氏名'] || '無名'}</td>
                                <td className="p-2 font-mono text-xs max-w-xs truncate">{row['画像ファイル名'] || '-'}</td>
                                <td className="p-2 font-mono text-xs">{ANIMATION_TYPES.find(t => t.key === (animation || 'none'))?.label || 'なし'}</td>
                                <td className="p-2 text-center">{statusHtml}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {isUploadingBulk ? (
                      <div className="bg-green-100 border border-green-300 p-6 rounded-lg text-center">
                        <div className="text-green-800 font-bold mb-2 text-lg">アップロード処理中... ({bulkProgress.current} / {bulkProgress.total})</div>
                        <div className="w-full bg-white rounded-full h-4 overflow-hidden border"><div className="bg-green-500 h-4 transition-all duration-300" style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}></div></div>
                      </div>
                    ) : (
                      <button onClick={executeBulkUpload} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl text-lg shadow-lg transition">▶ 全 {csvData.length} 件のデータと画像をアップロード</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* メール配信・テンプレート管理 */}
          {activeTab === 'emails' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
              <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold mb-4 text-indigo-900 border-b pb-2">✉️ メール作成</h2>
                
                <div className="mb-4">
                  <label className="block text-sm font-bold text-gray-700 mb-1">テンプレート読み込み</label>
                  <select 
                    onChange={(e) => handleApplyTemplate(e.target.value)} 
                    className="w-full border p-2 rounded focus:outline-none focus:border-indigo-500 bg-gray-50"
                  >
                    <option value="">-- テンプレートを選択 --</option>
                    {emailTemplates.map(tmpl => (
                      <option key={tmpl.key} value={tmpl.key}>{tmpl.name}</option>
                    ))}
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-bold text-gray-700 mb-1">件名</label>
                  <input 
                    type="text" 
                    value={mailSubject} 
                    onChange={(e) => setMailSubject(e.target.value)} 
                    placeholder="【重要】ご案内" 
                    className="w-full border p-2 rounded focus:outline-none focus:border-indigo-500" 
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-bold text-gray-700 mb-1">本文</label>
                  <textarea 
                    rows={8} 
                    value={mailBody} 
                    onChange={(e) => setMailBody(e.target.value)} 
                    placeholder="メール本文を入力してください。" 
                    className="w-full border p-2 rounded focus:outline-none focus:border-indigo-500" 
                  />
                </div>

                <div className="mb-6 p-4 bg-indigo-50 rounded border border-indigo-100">
                  <label className="block text-sm font-bold text-indigo-900 mb-1">📅 配信日時 (空欄で即時配信)</label>
                  <input 
                    type="datetime-local" 
                    value={scheduledTime} 
                    onChange={(e) => setScheduledTime(e.target.value)} 
                    className="w-full border p-2 rounded focus:outline-none focus:border-indigo-500" 
                  />
                </div>

                <button 
                  onClick={handleExecuteMailDelivery} 
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg shadow transition mb-4"
                >
                  ▶ 選択したユーザーへ配信
                </button>

                <hr className="my-6 border-gray-200" />
                
                <h3 className="text-sm font-bold text-gray-600 mb-2">現在の内容をテンプレートとして保存</h3>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={mailTemplateName} 
                    onChange={(e) => setMailTemplateName(e.target.value)} 
                    placeholder="テンプレート名" 
                    className="flex-1 border p-2 rounded text-sm focus:outline-none focus:border-indigo-500" 
                  />
                  <button onClick={handleSaveMailTemplate} className="bg-gray-800 text-white px-4 py-2 rounded text-sm hover:bg-gray-900 transition">保存</button>
                </div>
              </div>

              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[800px]">
                <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                  <div>
                    <h2 className="font-bold text-gray-700 text-lg">👥 配信対象ユーザー選択</h2>
                    <p className="text-sm text-gray-500">選択中: <span className="font-bold text-indigo-600">{selectedOrderIds.length}</span> 人</p>
                  </div>
                </div>
                
                <div className="overflow-y-auto flex-1">
                  <table className="min-w-full text-sm text-left">
                    <thead className="bg-white border-b sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="p-3 text-center w-12">
                          <input 
                            type="checkbox" 
                            onChange={handleSelectAllOrders} 
                            checked={orders.length > 0 && selectedOrderIds.length === orders.length} 
                            className="w-4 h-4 cursor-pointer"
                          />
                        </th>
                        <th className="p-3 font-bold text-gray-600">顧客名</th>
                        <th className="p-3 font-bold text-gray-600">メールアドレス</th>
                        <th className="p-3 font-bold text-gray-600">受注日</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => (
                        <tr key={order.id} className={`border-b transition cursor-pointer hover:bg-indigo-50 ${selectedOrderIds.includes(order.id) ? 'bg-indigo-50' : ''}`} onClick={() => handleSelectOrder(order.id)}>
                          <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox" 
                              checked={selectedOrderIds.includes(order.id)} 
                              onChange={() => handleSelectOrder(order.id)} 
                              className="w-4 h-4 cursor-pointer"
                            />
                          </td>
                          <td className="p-3 font-bold text-gray-800">{order.customer_name}</td>
                          <td className="p-3 text-gray-500">{order.email}</td>
                          <td className="p-3 text-gray-500">{new Date(order.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                      {orders.length === 0 && (
                        <tr><td colSpan={4} className="p-8 text-center text-gray-400">ユーザーが存在しません</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}