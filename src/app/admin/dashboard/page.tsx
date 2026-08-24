'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function Dashboard() {
  const supabase = createClient();
  const [orders, setOrders] = useState<any[]>([]);
  const [clientId, setClientId] = useState('');

  // 注文データの取得
  const fetchOrders = async () => {
    // 💡 修正箇所：order_images(image_url) を order_images(*) に変更し、新しいカラム構造に対応
    const { data } = await supabase
      .from('orders')
      .select('*, order_images(*)')
      .order('created_at', { ascending: false });
    if (data) setOrders(data);
  };

  useEffect(() => {
    fetchOrders();
  }, [supabase]);

  // サイズ（倍率）の更新処理
  const handleUpdateScale = async (orderId: string, currentScale: number) => {
    const newScale = prompt('新しいサイズ倍率を入力してください（例: 1.0, 1.5, 0.5）', currentScale.toString());
    if (newScale && !isNaN(Number(newScale))) {
      const { error } = await supabase
        .from('orders')
        .update({ object_scale: Number(newScale) })
        .eq('id', orderId);
      
      if (error) {
        alert('サイズの更新に失敗しました');
      } else {
        alert('サイズを更新しました！');
        fetchOrders(); // 一覧を再取得して表示を更新
      }
    }
  };

  // 生成されるタグの文字列
  const generatedTag = clientId 
    ? `<div id="ar-order-form-container"></div>\n<script src="https://kototama.vercel.app/embed.js" id="ar-embed-script" data-client-id="${clientId}"></script>`
    : 'クライアントIDを入力すると、ここにタグが表示されます。';

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">受注管理ダッシュボード</h1>
      
      {/* 埋め込みタグ生成ツール */}
      <div className="bg-white p-6 rounded-lg shadow mb-8">
        <h2 className="text-lg font-bold mb-4">🔗 クライアント用 埋め込みタグ生成</h2>
        <div className="flex gap-4 mb-4">
          <input 
            type="text" 
            placeholder="クライアントID（例: comp_a_001）" 
            className="border p-2 rounded w-64"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </div>
        <div className="bg-gray-800 text-gray-100 p-4 rounded text-sm font-mono overflow-x-auto whitespace-pre-wrap">
          {generatedTag}
        </div>
        <p className="text-xs text-gray-500 mt-2">※ 上記のタグをクライアントに渡し、WebサイトのHTMLに貼り付けてもらってください。</p>
      </div>

      {/* 受注一覧テーブル */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="p-4 font-semibold text-gray-700">受注日時</th>
              <th className="p-4 font-semibold text-gray-700">流入元(ID)</th>
              <th className="p-4 font-semibold text-gray-700">顧客名 / メール</th>
              <th className="p-4 font-semibold text-gray-700">オプション / 金額</th>
              <th className="p-4 font-semibold text-gray-700">ARサイズ</th>
              <th className="p-4 font-semibold text-gray-700">AR確認URL</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b hover:bg-gray-50">
                <td className="p-4">{new Date(order.created_at).toLocaleDateString()}</td>
                <td className="p-4">
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold">
                    {order.client_id || 'direct'}
                  </span>
                </td>
                <td className="p-4">
                  <div className="font-bold">{order.customer_name}</div>
                  <div className="text-gray-500 text-xs">{order.email}</div>
                </td>
                <td className="p-4">
                  <div className="text-gray-700 whitespace-pre-wrap">{order.option_details || 'なし'}</div>
                  <div className="font-bold mt-2">¥{order.total_price?.toLocaleString() || 0}</div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-gray-700">x{order.object_scale || 1.0}</span>
                    <button 
                      onClick={() => handleUpdateScale(order.id, order.object_scale || 1.0)}
                      className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded transition"
                    >
                      変更
                    </button>
                  </div>
                </td>
                <td className="p-4">
                  <a href={`/ar/${order.hash_id}`} target="_blank" className="text-blue-600 hover:underline">
                    ARを開く
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}