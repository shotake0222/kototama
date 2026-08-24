'use client';
import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import Script from 'next/script'; // 💡 追加：外部スクリプト読み込み用

export default function Dashboard() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<'orders' | 'images' | 'settings'>('orders');
  const [activeImageTab, setActiveImageTab] = useState<'processed' | 'original' | 'templates'>('processed');
  
  const [orders, setOrders] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [clientId, setClientId] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{ type: string, id?: string, oldPath?: string } | null>(null);

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

  const handleUpdateScale = async (orderId: string, currentScale: number) => {
    const newScale = prompt('新しいサイズ倍率を入力してください（例: 1.0, 1.5, 0.5）', currentScale.toString());
    if (newScale && !isNaN(Number(newScale))) {
      const { error } = await supabase.from('orders').update({ object_scale: Number(newScale) }).eq('id', orderId);
      if (error) alert('サイズの更新に失敗しました');
      else { alert('サイズを更新しました！'); fetchData(); }
    }
  };

  const handleUpdateSetting = async (settingKey: string, settingName: string, currentValue: string) => {
    const newValue = prompt(`【${settingName}】の新しい値を入力してください`, currentValue);
    if (newValue !== null && newValue !== currentValue) {
      const { error } = await supabase.from('system_settings').update({ value: newValue }).eq('key', settingKey);
      if (error) alert('設定の更新に失敗しました');
      else { alert('設定を更新しました！'); fetchData(); }
    }
  };

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
        const fileName = prompt('テンプレートファイル名を入力してください（例: T-11）', file.name.split('.')[0]);
        if (!fileName) return;
        newPath = `templates/${fileName}.${fileExt}`;
        await supabase.storage.from('ar_images').upload(newPath, file, { upsert: true });
      } else {
        const prefix = uploadTarget.type === 'processed' ? 'proc_' : 'orig_';
        newPath = `${prefix}${uuidv4()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('ar_images').upload(newPath, file);
        if (uploadError) throw uploadError;

        const updateData = uploadTarget.type === 'processed' ? { processed_image_url: newPath } : { original_image_url: newPath };
        await supabase.from('order_images').update(updateData).eq('id', uploadTarget.id);

        if (uploadTarget.oldPath && !uploadTarget.oldPath.startsWith('templates/')) {
          await supabase.storage.from('ar_images').remove([uploadTarget.oldPath]);
        }
      }
      alert('画像の更新が完了しました！');
      fetchData();
    } catch (err) {
      alert('エラーが発生しました。');
      console.error(err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploadTarget(null);
    }
  };

  const handleDeleteImage = async (type: string, id?: string, path?: string) => {
    if (!confirm('本当にこの画像を削除しますか？ARが表示されなくなる可能性があります。')) return;
    try {
      if (type === 'template' && path) {
        await supabase.storage.from('ar_images').remove([`templates/${path}`]);
      } else if (id && path) {
        const updateData = type === 'processed' ? { processed_image_url: null } : { original_image_url: null };
        await supabase.from('order_images').update(updateData).eq('id', id);
        if (!path.startsWith('templates/')) {
          await supabase.storage.from('ar_images').remove([path]);
        }
      }
      alert('画像を削除しました。');
      fetchData();
    } catch (err) {
      alert('削除に失敗しました。');
    }
  };

  const generatedTag = clientId 
    ? `<div id="ar-order-form-container"></div>\n<script src="https://kototama.vercel.app/embed.js" id="ar-embed-script" data-client-id="${clientId}"></script>`
    : 'クライアントIDを入力すると、ここにタグが表示されます。';

  return (
    <>
      {/* 💡 ここがポイント：Tailwind CSSを強制的に読み込んでデザイン崩れを直します */}
      <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />

      <div className="min-h-screen bg-gray-50 p-8 text-gray-800 font-sans">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-extrabold mb-8 text-gray-900 border-b pb-4">ことたま 管理ダッシュボード</h1>
          
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleFileChange} />

          <div className="flex space-x-2 border-b-2 border-gray-200 mb-8">
            <button onClick={() => setActiveTab('orders')} className={`px-6 py-3 font-bold rounded-t-lg transition ${activeTab === 'orders' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>📦 注文・顧客管理</button>
            <button onClick={() => setActiveTab('images')} className={`px-6 py-3 font-bold rounded-t-lg transition ${activeTab === 'images' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>🖼️ 画像管理</button>
            <button onClick={() => setActiveTab('settings')} className={`px-6 py-3 font-bold rounded-t-lg transition ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>⚙️ システム設定</button>
          </div>

          {activeTab === 'orders' && (
            <div className="space-y-8">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-lg font-bold mb-4 text-blue-900">🔗 クライアント用 埋め込みタグ生成</h2>
                <div className="flex gap-4 mb-4">
                  <input type="text" placeholder="クライアントID（例: comp_a_001）" className="border-2 border-gray-200 p-2 rounded-lg w-64 focus:border-blue-400 outline-none" value={clientId} onChange={(e) => setClientId(e.target.value)} />
                </div>
                <div className="bg-gray-800 text-green-400 p-4 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap shadow-inner">{generatedTag}</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                  <h2 className="font-bold text-gray-700">受注・顧客一覧</h2>
                  <span className="text-sm text-gray-500">全 {orders.length} 件</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm text-left">
                    <thead className="bg-white border-b">
                      <tr>
                        <th className="p-4 font-bold text-gray-600">受注日時 / ID</th>
                        <th className="p-4 font-bold text-gray-600">流入元(ID)</th>
                        <th className="p-4 font-bold text-gray-600">顧客名 / メール</th>
                        <th className="p-4 font-bold text-gray-600">オプション詳細</th>
                        <th className="p-4 font-bold text-gray-600">ARサイズ</th>
                        <th className="p-4 font-bold text-gray-600">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => (
                        <tr key={order.id} className="border-b hover:bg-blue-50 transition">
                          <td className="p-4"><div className="font-bold">{new Date(order.created_at).toLocaleDateString()}</div><div className="text-xs text-gray-400 mt-1 font-mono">{order.hash_id?.substring(0,8)}...</div></td>
                          <td className="p-4"><span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold">{order.client_id || 'direct'}</span></td>
                          <td className="p-4"><div className="font-bold text-gray-800">{order.customer_name}</div><div className="text-gray-500 text-xs mt-1">{order.email}</div></td>
                          <td className="p-4"><div className="text-gray-600 text-xs whitespace-pre-wrap bg-gray-50 p-2 rounded border">{order.option_details || 'なし'}</div><div className="font-bold text-red-600 mt-2">合計: ¥{order.total_price?.toLocaleString() || 0}</div></td>
                          <td className="p-4"><div className="flex items-center gap-2"><span className="font-mono font-bold text-gray-700 w-8">x{order.object_scale || 1.0}</span><button onClick={() => handleUpdateScale(order.id, order.object_scale || 1.0)} className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded-full transition">変更</button></div></td>
                          <td className="p-4"><a href={`/ar/${order.hash_id}`} target="_blank" className="inline-block bg-blue-500 hover:bg-blue-600 text-white font-bold px-4 py-2 rounded-lg text-xs shadow transition">AR確認</a></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'images' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex bg-gray-50 border-b">
                <button onClick={() => setActiveImageTab('processed')} className={`px-6 py-3 font-bold text-sm transition ${activeImageTab === 'processed' ? 'border-b-4 border-blue-500 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}>処理済み画像</button>
                <button onClick={() => setActiveImageTab('original')} className={`px-6 py-3 font-bold text-sm transition ${activeImageTab === 'original' ? 'border-b-4 border-blue-500 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}>オリジナル画像</button>
                <button onClick={() => setActiveImageTab('templates')} className={`px-6 py-3 font-bold text-sm transition ${activeImageTab === 'templates' ? 'border-b-4 border-blue-500 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}>テンプレート画像</button>
              </div>
              <div className="p-6">
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 text-sm text-yellow-800">
                  💡 手作業で背景を透過・綺麗に切り抜いた画像をアップロードする場合は、対象の「変更」ボタンから差し替えてください。
                </div>
                {activeImageTab !== 'templates' && (
                  <table className="min-w-full text-sm text-left">
                    <thead className="bg-gray-100 border-b">
                      <tr><th className="p-3 font-bold text-gray-600">プレビュー</th><th className="p-3 font-bold text-gray-600">顧客名 / 注文日</th><th className="p-3 font-bold text-gray-600">現在のパス (URL)</th><th className="p-3 font-bold text-gray-600 text-right">操作</th></tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => {
                        const imgData = order.order_images?.[0];
                        if (!imgData) return null;
                        const path = activeImageTab === 'processed' ? imgData.processed_image_url : imgData.original_image_url;
                        if (!path) return null;
                        return (
                          <tr key={order.id} className="border-b hover:bg-gray-50">
                            <td className="p-3 w-32"><img src={getImageUrl(path)} alt="preview" className="w-24 h-24 object-contain bg-gray-200 rounded border" /></td>
                            <td className="p-3"><div className="font-bold">{order.customer_name} 様</div><div className="text-gray-500 text-xs mt-1">{new Date(order.created_at).toLocaleDateString()}</div></td>
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
                    <table className="min-w-full text-sm text-left"><thead className="bg-gray-100 border-b"><tr><th className="p-3 font-bold text-gray-600 w-32">プレビュー</th><th className="p-3 font-bold text-gray-600">ファイル名 (ID)</th><th className="p-3 font-bold text-gray-600">更新日時</th><th className="p-3 font-bold text-gray-600 text-right">操作</th></tr></thead>
                      <tbody>
                        {templates.map((file) => (
                          <tr key={file.id} className="border-b hover:bg-gray-50">
                            <td className="p-3"><img src={getImageUrl(`templates/${file.name}`)} alt="preview" className="w-24 h-24 object-contain bg-gray-200 rounded border" /></td>
                            <td className="p-3 font-bold text-gray-700">{file.name}</td>
                            <td className="p-3 text-gray-500 text-xs">{new Date(file.updated_at).toLocaleString()}</td>
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
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 bg-rose-50 border-b"><h2 className="font-bold text-rose-900 text-lg">システム定数・各種設定</h2></div>
              <table className="min-w-full text-sm text-left">
                <thead className="bg-white border-b"><tr><th className="p-4 font-bold text-gray-600 w-1/4">キー名（変更不可）</th><th className="p-4 font-bold text-gray-600 w-1/3">設定項目名</th><th className="p-4 font-bold text-gray-600">現在の値</th><th className="p-4 font-bold text-gray-600 text-right">操作</th></tr></thead>
                <tbody>
                  {settings.map((setting) => (
                    <tr key={setting.key} className="border-b hover:bg-gray-50 transition">
                      <td className="p-4 font-mono text-xs text-gray-400">{setting.key}</td>
                      <td className="p-4 font-bold text-gray-700">{setting.name}</td>
                      <td className="p-4"><div className="bg-gray-100 px-3 py-2 rounded text-gray-800 font-mono inline-block">{setting.value}</div></td>
                      <td className="p-4 text-right"><button onClick={() => handleUpdateSetting(setting.key, setting.name, setting.value)} className="bg-gray-800 hover:bg-gray-900 text-white font-bold px-4 py-2 rounded-lg text-xs shadow transition">編集</button></td>
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