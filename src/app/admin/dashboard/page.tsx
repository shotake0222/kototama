'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function Dashboard() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<'orders' | 'images' | 'settings'>('orders');
  
  const [orders, setOrders] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const [clientId, setClientId] = useState('');

  // データの取得
  const fetchData = async () => {
    // 注文データの取得（顧客・画像情報含む）
    const { data: ordersData } = await supabase
      .from('orders')
      .select('*, order_images(*)')
      .order('created_at', { ascending: false });
    if (ordersData) setOrders(ordersData);

    // システム設定データの取得
    const { data: settingsData } = await supabase
      .from('system_settings')
      .select('*')
      .order('key', { ascending: true });
    if (settingsData) setSettings(settingsData);
  };

  useEffect(() => {
    fetchData();
  }, [supabase]);

  // 【注文管理】サイズ（倍率）の更新処理
  const handleUpdateScale = async (orderId: string, currentScale: number) => {
    const newScale = prompt('新しいサイズ倍率を入力してください（例: 1.0, 1.5, 0.5）', currentScale.toString());
    if (newScale && !isNaN(Number(newScale))) {
      const { error } = await supabase.from('orders').update({ object_scale: Number(newScale) }).eq('id', orderId);
      if (error) alert('サイズの更新に失敗しました');
      else {
        alert('サイズを更新しました！');
        fetchData();
      }
    }
  };

  // 【システム設定】設定値の更新処理
  const handleUpdateSetting = async (settingKey: string, settingName: string, currentValue: string) => {
    const newValue = prompt(`【${settingName}】の新しい値を入力してください`, currentValue);
    if (newValue !== null && newValue !== currentValue) {
      const { error } = await supabase.from('system_settings').update({ value: newValue }).eq('key', settingKey);
      if (error) alert('設定の更新に失敗しました');
      else {
        alert('設定を更新しました！ウィジェットやメールに即座に反映されます。');
        fetchData();
      }
    }
  };

  // 生成されるタグの文字列
  const generatedTag = clientId 
    ? `<div id="ar-order-form-container"></div>\n<script src="https://kototama.vercel.app/embed.js" id="ar-embed-script" data-client-id="${clientId}"></script>`
    : 'クライアントIDを入力すると、ここにタグが表示されます。';

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-800">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-extrabold mb-8 text-gray-900">ことたま 管理ダッシュボード</h1>
        
        {/* タブナビゲーション */}
        <div className="flex space-x-2 border-b-2 border-gray-200 mb-8">
          <button 
            onClick={() => setActiveTab('orders')}
            className={`px-6 py-3 font-bold rounded-t-lg transition ${activeTab === 'orders' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
          >
            📦 注文・顧客管理
          </button>
          <button 
            onClick={() => setActiveTab('images')}
            className={`px-6 py-3 font-bold rounded-t-lg transition ${activeTab === 'images' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
          >
            🖼️ 画像管理
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`px-6 py-3 font-bold rounded-t-lg transition ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
          >
            ⚙️ システム設定
          </button>
        </div>

        {/* =========================================
            タブ: 注文・顧客管理
        ========================================= */}
        {activeTab === 'orders' && (
          <div className="space-y-8 animate-fade-in">
            {/* 埋め込みタグ生成ツール */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold mb-4 text-blue-900">🔗 クライアント用 埋め込みタグ生成</h2>
              <div className="flex gap-4 mb-4">
                <input 
                  type="text" 
                  placeholder="クライアントID（例: comp_a_001）" 
                  className="border-2 border-gray-200 p-2 rounded-lg w-64 focus:border-blue-400 outline-none"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                />
              </div>
              <div className="bg-gray-800 text-green-400 p-4 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap shadow-inner">
                {generatedTag}
              </div>
            </div>

            {/* 受注一覧テーブル */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                <h2 className="font-bold text-gray-700">受注一覧（顧客情報含む）</h2>
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
                        <td className="p-4">
                          <div className="font-bold">{new Date(order.created_at).toLocaleDateString()}</div>
                          <div className="text-xs text-gray-400 mt-1 font-mono">{order.hash_id?.substring(0,8)}...</div>
                        </td>
                        <td className="p-4">
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold">
                            {order.client_id || 'direct'}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="font-bold text-gray-800">{order.customer_name}</div>
                          <div className="text-gray-500 text-xs mt-1">{order.email}</div>
                        </td>
                        <td className="p-4">
                          <div className="text-gray-600 text-xs whitespace-pre-wrap bg-gray-50 p-2 rounded border">
                            {order.option_details || 'なし'}
                          </div>
                          <div className="font-bold text-red-600 mt-2">合計: ¥{order.total_price?.toLocaleString() || 0}</div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-gray-700 w-8">x{order.object_scale || 1.0}</span>
                            <button 
                              onClick={() => handleUpdateScale(order.id, order.object_scale || 1.0)}
                              className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded-full transition"
                            >
                              変更
                            </button>
                          </div>
                        </td>
                        <td className="p-4">
                          <a href={`/ar/${order.hash_id}`} target="_blank" className="inline-block bg-blue-500 hover:bg-blue-600 text-white font-bold px-4 py-2 rounded-lg text-xs shadow transition">
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
            タブ: 画像管理
        ========================================= */}
        {activeTab === 'images' && (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 text-center text-gray-500 animate-fade-in">
            <div className="text-4xl mb-4">🖼️</div>
            <h2 className="text-xl font-bold mb-2">画像管理エリア</h2>
            <p className="text-sm">
              オリジナル画像、処理済み画像、テンプレート画像の一覧・手動アップロード機能は現在準備中です。<br />
              （Supabaseのダッシュボード「Storage」タブから直接管理可能です）
            </p>
          </div>
        )}

        {/* =========================================
            タブ: システム設定（金額・税・送料・口座）
        ========================================= */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
            <div className="p-6 bg-rose-50 border-b flex items-center justify-between">
              <div>
                <h2 className="font-bold text-rose-900 text-lg">システム定数・各種設定</h2>
                <p className="text-sm text-rose-700 mt-1">ここで変更した値は、販売サイトのフォーム金額計算や、通知メール内の口座情報に即座に反映されます。</p>
              </div>
            </div>
            <table className="min-w-full text-sm text-left">
              <thead className="bg-white border-b">
                <tr>
                  <th className="p-4 font-bold text-gray-600 w-1/4">キー名（変更不可）</th>
                  <th className="p-4 font-bold text-gray-600 w-1/3">設定項目名</th>
                  <th className="p-4 font-bold text-gray-600">現在の値</th>
                  <th className="p-4 font-bold text-gray-600 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {settings.map((setting) => (
                  <tr key={setting.key} className="border-b hover:bg-gray-50 transition">
                    <td className="p-4 font-mono text-xs text-gray-400">{setting.key}</td>
                    <td className="p-4 font-bold text-gray-700">{setting.name}</td>
                    <td className="p-4">
                      <div className="bg-gray-100 px-3 py-2 rounded text-gray-800 font-mono inline-block">
                        {setting.value}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => handleUpdateSetting(setting.key, setting.name, setting.value)}
                        className="bg-gray-800 hover:bg-gray-900 text-white font-bold px-4 py-2 rounded-lg text-xs transition shadow"
                      >
                        編集
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}