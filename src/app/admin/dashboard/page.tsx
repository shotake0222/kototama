'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

type Order = {
  id: string;
  hash_id: string;
  customer_name: string;
  email: string;
  total_price: number;
  status: string;
  created_at: string;
  order_images: { image_url: string }[];
};

export default function DashboardPage() {
  const supabase = createClient();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, hash_id, customer_name, email, total_price, status, created_at,
          order_images ( image_url )
        `)
        .order('created_at', { ascending: false });
        
      if (data) setOrders(data);
      setIsLoading(false);
    };
    fetchOrders();
  }, [supabase]);

  if (isLoading) return <div className="p-8">読み込み中...</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">受注管理ダッシュボード</h1>
      <div className="bg-white shadow rounded-lg overflow-x-auto">
        <table className="min-w-full text-left whitespace-nowrap">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 font-medium text-gray-500 text-sm">受注日時</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-sm">顧客名</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-sm">金額</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-sm">ステータス</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-sm">元画像</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-sm">AR確認用URL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {orders.map((order) => {
              const origin = typeof window !== 'undefined' ? window.location.origin : '';
              const arUrl = `${origin}/ar/${order.hash_id}`;
              const imageUrl = order.order_images[0] 
                ? supabase.storage.from('ar_images').getPublicUrl(order.order_images[0].image_url).data.publicUrl
                : null;

              return (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {new Date(order.created_at).toLocaleString('ja-JP')}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{order.customer_name}</div>
                    <div className="text-sm text-gray-500">{order.email}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">¥{order.total_price.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {imageUrl ? (
                      <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        画像を開く
                      </a>
                    ) : 'なし'}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <a href={arUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      ARを開く
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}