'use client';
import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import Script from 'next/script';

export default function Dashboard() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<'orders' | 'images' | 'settings' | 'bulk'>('orders');
  const [activeImageTab, setActiveImageTab] = useState<'processed' | 'original' | 'templates'>('processed');
  
  const [orders, setOrders] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [clientId, setClientId] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{ type: string, id?: string, oldPath?: string } | null>(null);

  const [csvData, setCsvData] = useState<any[]>([]);
  const [bulkImages, setBulkImages] = useState<File[]>([]);
  const [isUploadingBulk, setIsUploadingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [csvEncoding, setCsvEncoding] = useState<'UTF-8' | 'Shift_JIS'>('UTF-8');

  const fetchData = async () => {
    const { data: ordersData } = await supabase.from('orders').select('*, order_images(*)').order('created_at', { ascending: false });
    if (ordersData) setOrders(ordersData);

    const { data: settingsData } = await supabase.from('system_settings').select('*').order('key', { ascending: true });
    if (settingsData) setSettings(settingsData);

    const { data: storageData } = await supabase.storage.from('ar_images').list('templates', { limit: 100 });
    if (storageData) setTemplates(storageData.filter(f => f.name !== '.emptyFolderPlaceholder'));
  };

  useEffect(() => {
    fetchData();
  }, [supabase]);

  const getImageUrl = (path: string) => {
    if (!path) return '';
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ar_images/${path}`;
  };

  // ==========================================
  // 【新機能】NFC UIDの更新
  // ==========================================
  const handleUpdateNfcUid = async (orderId: string, currentUid: string | null) => {
    const newUid = prompt('この注文に紐付けるNFCタグのUID（シリアルナンバー）を入力・スキャンしてください。', currentUid || '');
    if (newUid !== null && newUid !== currentUid) {
      const { error } = await supabase.from('orders').update({ nfc_uid: newUid.trim() }).eq('id', orderId);
      if (error) alert('NFC UIDの登録に失敗しました。');
      else { alert('NFCタグを紐付けました！'); fetchData(); }
    }
  };

  // ==========================================
  // その他の更新機能
  // ==========================================
  const handleUpdateScale = async (orderId: string, currentScale: number) => {
    const newScale = prompt('新しいサイズ倍率を入力してください', currentScale.toString());
    if (newScale && !isNaN(Number(newScale))) {
      const { error } = await supabase.from('orders').update({ object_scale: Number(newScale) }).eq('id', orderId);
      if (!error) { alert('サイズを更新しました！'); fetchData(); }
    }
  };

  const handleUpdateSetting = async (settingKey: string, settingName: string, currentValue: string) => {
    const newValue = prompt(`【${settingName}】の新しい値を入力してください`, currentValue);
    if (newValue !== null && newValue !== currentValue) {
      const { error } = await supabase.from('system_settings').update({ value: newValue }).eq('key', settingKey);
      if (!error) { alert('設定を更新しました！'); fetchData(); }
    }
  };

  const handleAddSetting = async () => {
    const key = prompt('システムキー名を入力してください（例: PRICE_NEW_ITEM）');
    if (!key) return;
    const name = prompt('設定項目名を入力してください');
    if (!name) return;
    const value = prompt('設定値を入力してください');
    if (!value) return;
    const { error } = await supabase.from('system_settings').insert({ key, name, value });
    if (!error) { alert('新しい設定を追加しました！'); fetchData(); }
  };

  const handleDeleteSetting = async (settingKey: string, settingName: string) => {
    if (!confirm(`本当に「${settingName}」を削除しますか？`)) return;
    const { error } = await supabase.from('system_settings').delete().eq('key', settingKey);
    if (!error) { alert('削除しました。'); fetchData(); }
  };

  // ==========================================
  // 画像管理ロジック
  // ==========================================
  const triggerFileInput = (type: string, id?: string, oldPath?: string) => {
    setUploadTarget({ type, id, oldPath });
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;
    alert('画像のアップロードを開始します...');
    try {
      const fileExt = file.name.split('.').pop();
      let newPath = '';
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
        if (uploadTarget.oldPath && !uploadTarget.oldPath.startsWith('templates/')) {
          await supabase.storage.from('ar_images').remove([uploadTarget.oldPath]);
        }
      }
      alert('画像の更新が完了しました！'); fetchData();
    } catch (err) { alert('エラーが発生しました。'); }
    finally { if (fileInputRef.current) fileInputRef.current.value = ''; setUploadTarget(null); }
  };

  const handleDeleteImage = async (type: string, id?: string, path?: string) => {
    if (!confirm('本当にこの画像を削除しますか？')) return;
    try {
      if (type === 'template' && path) await supabase.storage.from('ar_images').remove([`templates/${path}`]);
      else if (id && path) {
        const updateData = type === 'processed' ? { processed_image_url: null } : { original_image_url: null };
        await supabase.from('order_images').update(updateData).eq('id', id);
        if (!path.startsWith('templates/')) await supabase.storage.from('ar_images').remove([path]);
      }
      alert('画像を削除しました。'); fetchData();
    } catch (err) { alert('削除に失敗しました。'); }
  };

  // ==========================================
  // 一括発注（バルク）ロジック
  // ==========================================
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
        let values = [];
        let inQuotes = false;
        let currentValue = '';
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

  const handleBulkImagesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setBulkImages(Array.from(e.target.files));
  };

  const executeBulkUpload = async () => {
    if (!confirm(`合計 ${csvData.length} 件のデータを作成します。よろしいですか？`)) return;
    setIsUploadingBulk(true);
    setBulkProgress({ current: 0, total: csvData.length });

    const getSettingNum = (key: string, def: number) => {
      const found = settings.find(s => s.key === key);
      return found && !isNaN(Number(found.value)) ? Number(found.value) : def;
    };
    const PRICE_KEY_RING = getSettingNum('PRICE_KEY_RING', 1500);
    const PRICE_CHARM = getSettingNum('PRICE_CHARM', 2800);
    const PRICE_TEMPLATE = getSettingNum('PRICE_TEMPLATE', 500);
    const PRICE_TAX = getSettingNum('PRICE_TAX', 0.1);
    const PRICE_POSTAGE = getSettingNum('PRICE_POSTAGE', 380);

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const targetFileName = row['画像ファイル名'];
      const templateId = row['テンプレートID'];
      const itemType = row['種類'] || 'キーホルダー';
      const nfcUid = row['NFC_UID']; // CSVからUIDを取り込む
      
      let uploadFile = null;
      if (targetFileName) uploadFile = bulkImages.find(f => f.name === targetFileName);

      const basePrice = itemType === 'キーホルダー' ? PRICE_KEY_RING : PRICE_CHARM;
      const optionPrice = templateId ? PRICE_TEMPLATE : 0;
      const subTotal = basePrice + optionPrice + PRICE_POSTAGE;
      const total = subTotal + Math.floor(subTotal * PRICE_TAX);
      const optionDetails = `【種類】${itemType}\n【画像】${templateId ? 'テンプレート' : 'アップロード'}\n${templateId ? `【希望テンプレート】${templateId}\n` : ''}【性別】${row['性別'] || ''}\n【年齢】${row['年齢'] || ''}\n【住所】〒${row['郵便番号'] || ''} ${row['住所'] || ''}\n【備考】${row['備考'] || ''}`;

      try {
        let processedFileName = '';
        if (templateId) {
          let formattedId = templateId.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s: string) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).toUpperCase().trim();
          formattedId = formattedId.replace(/ー|−|_/g, '-');
          if (!formattedId.includes('-')) formattedId = formattedId.replace('T', 'T-');
          processedFileName = `templates/${formattedId}.jpg`;
        } else if (uploadFile) {
          const fileExt = uploadFile.name.split('.').pop();
          processedFileName = `proc_bulk_${uuidv4()}.${fileExt}`;
          await supabase.storage.from('ar_images').upload(processedFileName, uploadFile);
        }

        const hashId = uuidv4().replace(/-/g, '').substring(0, 16);
        const { data: order, error: orderError } = await supabase.from('orders').insert({
          customer_name: row['氏名'] || '名称未設定',
          email: row['メールアドレス'] || 'no-email@example.com',
          hash_id: hashId,
          nfc_uid: nfcUid || null, // NFC_UIDの登録
          total_price: total,
          status: 'pending',
          client_id: row['クライアントID'] || 'bulk_upload',
          option_details: optionDetails.trim()
        }).select().single();

        if (orderError) throw orderError;

        if (processedFileName) {
          await supabase.from('order_images').insert({
            order_id: order.id,
            original_image_url: null,
            processed_image_url: processedFileName,
          });
        }
      } catch (err) { console.error(`Row ${i + 1} Error:`, err); }
      setBulkProgress({ current: i + 1, total: csvData.length });
    }
    setIsUploadingBulk(false);
    alert('一括処理が完了しました！');
    setCsvData([]); setBulkImages([]); fetchData();
  };

  const generatedTag = clientId ? `<div id="ar-order-form-container"></div>\n<script src="https://kototama.vercel.app/embed.js" id="ar-embed-script" data-client-id="${clientId}"></script>` : 'クライアントIDを入力すると、ここにタグが表示されます。';

  return (
    <>
      <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
      <div className="min-h-screen bg-gray-50 p-8 text-gray-800 font-sans pb-24">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-extrabold mb-8 text-gray-900 border-b pb-4">ことたま 管理ダッシュボード</h1>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleFileChange} />

          <div className="flex space-x-2 border-b-2 border-gray-200 mb-8 overflow-x-auto">
            <button onClick={() => setActiveTab('orders')} className={`px-6 py-3 font-bold rounded-t-lg transition whitespace-nowrap ${activeTab === 'orders' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>📦 注文管理</button>
            <button onClick={() => setActiveTab('images')} className={`px-6 py-3 font-bold rounded-t-lg transition whitespace-nowrap ${activeTab === 'images' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>🖼️ 画像管理</button>
            <button onClick={() => setActiveTab('settings')} className={`px-6 py-3 font-bold rounded-t-lg transition whitespace-nowrap ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>⚙️ システム設定</button>
            <button onClick={() => setActiveTab('bulk')} className={`px-6 py-3 font-bold rounded-t-lg transition whitespace-nowrap ${activeTab === 'bulk' ? 'bg-green-600 text-white shadow-lg transform -translate-y-1' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>📁 一括発注処理</button>
          </div>

          {/* =========================================
              タブ: 注文・顧客管理
          ========================================= */}
          {activeTab === 'orders' && (
            <div className="space-y-8 animate-fade-in">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-lg font-bold mb-4 text-blue-900">🔗 クライアント用 埋め込みタグ生成</h2>
                <div className="flex gap-4 mb-4"><input type="text" placeholder="クライアントID" className="border-2 border-gray-200 p-2 rounded-lg w-64 focus:border-blue-400 outline-none" value={clientId} onChange={(e) => setClientId(e.target.value)} /></div>
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
                        <th className="p-4 font-bold text-gray-600">オプション詳細</th>
                        <th className="p-4 font-bold text-gray-600">ARサイズ</th>
                        {/* 💡 変更: NFCタグ管理列を追加 */}
                        <th className="p-4 font-bold text-gray-600">NFC UID (ミラーリング)</th>
                        <th className="p-4 font-bold text-gray-600">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => (
                        <tr key={order.id} className="border-b hover:bg-blue-50 transition">
                          <td className="p-4"><div className="font-bold">{new Date(order.created_at).toLocaleDateString()}</div><div className="text-xs text-gray-400 mt-1 font-mono">{order.hash_id?.substring(0,8)}...</div></td>
                          <td className="p-4"><div className="font-bold text-gray-800">{order.customer_name}</div><div className="text-gray-500 text-xs mt-1">{order.email}</div></td>
                          <td className="p-4"><div className="text-gray-600 text-xs whitespace-pre-wrap bg-gray-50 p-2 rounded border max-w-xs overflow-auto max-h-24">{order.option_details || 'なし'}</div><div className="font-bold text-red-600 mt-2">合計: ¥{order.total_price?.toLocaleString() || 0}</div></td>
                          <td className="p-4"><div className="flex items-center gap-2"><span className="font-mono font-bold text-gray-700 w-8">x{order.object_scale || 1.0}</span><button onClick={() => handleUpdateScale(order.id, order.object_scale || 1.0)} className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded-full transition">変更</button></div></td>
                          {/* 💡 変更: NFC UID の表示と更新ボタン */}
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              {order.nfc_uid ? (
                                <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-mono font-bold border border-green-200">
                                  {order.nfc_uid}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-xs">未登録</span>
                              )}
                              <button onClick={() => handleUpdateNfcUid(order.id, order.nfc_uid)} className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded transition">
                                登録/変更
                              </button>
                            </div>
                          </td>
                          <td className="p-4 whitespace-nowrap">
                            <a href={`/ar?uid=${order.nfc_uid || order.hash_id}`} target="_blank" className="inline-block bg-blue-500 hover:bg-blue-600 text-white font-bold px-3 py-2 rounded-lg text-xs shadow transition">
                              AR確認
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* =========================================
              タブ: 一括発注処理（バルク）
          ========================================= */}
          {activeTab === 'bulk' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-2xl font-bold mb-4 text-green-800">CSVと画像フォルダによる一括登録</h2>
                <p className="text-gray-600 mb-6">
                  CSVファイルと画像ファイル群をブラウザ上で自動マッチングさせ、一括アップロードします。<br/>
                  ※ CSVに「NFC_UID」という列を作っておくことで、NFCタグの紐付けも一括で完了できます。
                </p>

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
                    <input type="file" multiple accept="image/*" onChange={handleBulkImagesUpload} className="w-full bg-white border p-2 rounded" />
                  </div>
                </div>

                {csvData.length > 0 && (
                  <div className="mt-8 border-t pt-8">
                    <h3 className="font-bold text-lg mb-4">マッチングプレビュー（全 {csvData.length} 件）</h3>
                    <div className="max-h-64 overflow-y-auto mb-6 bg-gray-50 border rounded">
                      <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr><th className="p-3 border-b">氏名</th><th className="p-3 border-b">NFC_UID</th><th className="p-3 border-b">画像ファイル名</th><th className="p-3 border-b text-center">ステータス</th></tr>
                        </thead>
                        <tbody>
                          {csvData.map((row, idx) => {
                            const targetName = row['画像ファイル名'];
                            const isTemplate = !!row['テンプレートID'];
                            const foundFile = targetName ? bulkImages.some(f => f.name === targetName) : false;
                            
                            let statusHtml = <span className="text-gray-400">-</span>;
                            if (isTemplate) statusHtml = <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold">テンプレート</span>;
                            else if (targetName && foundFile) statusHtml = <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold">✅ 一致</span>;
                            else if (targetName && !foundFile) statusHtml = <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-bold">❌ 画像不足</span>;

                            return (
                              <tr key={idx} className="border-b">
                                <td className="p-2">{row['氏名'] || '無名'}</td>
                                <td className="p-2 font-mono text-xs">{row['NFC_UID'] || '-'}</td>
                                <td className="p-2 font-mono text-xs">{targetName}</td>
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
                        <div className="w-full bg-white rounded-full h-4 overflow-hidden border">
                          <div className="bg-green-500 h-4 transition-all duration-300" style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}></div>
                        </div>
                      </div>
                    ) : (
                      <button onClick={executeBulkUpload} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl text-lg shadow-lg transition">
                        ▶ 全 {csvData.length} 件のデータと画像をアップロード
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 画像管理・システム設定は省略（そのまま保持） */}
          {activeTab === 'images' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
              <div className="flex bg-gray-50 border-b">
                <button onClick={() => setActiveImageTab('processed')} className={`px-6 py-3 font-bold text-sm transition ${activeImageTab === 'processed' ? 'border-b-4 border-blue-500 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}>処理済み画像</button>
                <button onClick={() => setActiveImageTab('original')} className={`px-6 py-3 font-bold text-sm transition ${activeImageTab === 'original' ? 'border-b-4 border-blue-500 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}>オリジナル画像</button>
                <button onClick={() => setActiveImageTab('templates')} className={`px-6 py-3 font-bold text-sm transition ${activeImageTab === 'templates' ? 'border-b-4 border-blue-500 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}>テンプレート画像</button>
              </div>
              <div className="p-6">
                {activeImageTab !== 'templates' && (
                  <table className="min-w-full text-sm text-left">
                    <thead className="bg-gray-100 border-b"><tr><th className="p-3 font-bold text-gray-600">プレビュー</th><th className="p-3 font-bold text-gray-600">顧客名</th><th className="p-3 font-bold text-gray-600">現在のパス (URL)</th><th className="p-3 font-bold text-gray-600 text-right">操作</th></tr></thead>
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
                )}
                {activeImageTab === 'templates' && (
                  <div>
                    <div className="mb-4 text-right"><button onClick={() => triggerFileInput('template')} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded shadow transition">＋ 新規テンプレート追加</button></div>
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
                )}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
              <div className="p-6 bg-rose-50 border-b flex items-center justify-between">
                <div><h2 className="font-bold text-rose-900 text-lg">システム定数・各種設定</h2></div>
                <button onClick={handleAddSetting} className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-5 py-2 rounded-lg shadow-sm transition whitespace-nowrap">＋ 新規設定を追加</button>
              </div>
              <table className="min-w-full text-sm text-left">
                <thead className="bg-white border-b"><tr><th className="p-4 font-bold text-gray-600">キー名（システム変数）</th><th className="p-4 font-bold text-gray-600">設定項目名</th><th className="p-4 font-bold text-gray-600">現在の値</th><th className="p-4 font-bold text-gray-600 text-right">操作</th></tr></thead>
                <tbody>
                  {settings.map((setting) => (
                    <tr key={setting.key} className="border-b hover:bg-gray-50 transition">
                      <td className="p-4 font-mono text-xs text-gray-500 bg-gray-50">{setting.key}</td>
                      <td className="p-4 font-bold text-gray-700">{setting.name}</td>
                      <td className="p-4"><div className="bg-white border px-3 py-2 rounded text-gray-800 font-mono inline-block">{setting.value}</div></td>
                      <td className="p-4 text-right space-x-2"><button onClick={() => handleUpdateSetting(setting.key, setting.name, setting.value)} className="bg-gray-800 hover:bg-gray-900 text-white font-bold px-3 py-2 rounded text-xs shadow transition">編集</button><button onClick={() => handleDeleteSetting(setting.key, setting.name)} className="bg-red-50 text-red-600 hover:bg-red-100 font-bold px-3 py-2 rounded text-xs transition">削除</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}