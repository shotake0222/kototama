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
  template_id: string | null;
  order_images: { id: string, image_url: string }[];
};

type Template = { id: string; name: string };

export default function DashboardPage() {
  const supabase = createClient();
  const [orders, setOrders] = useState<Order[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 編集モーダル用の状態
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    // 受注データの取得
    const { data: orderData } = await supabase
      .from('orders')
      .select(`
        id, hash_id, customer_name, email, total_price, status, created_at, template_id,
        order_images ( id, image_url )
      `)
      .order('created_at', { ascending: false });
    if (orderData) setOrders(orderData);

    // テンプレート一覧の取得（セレクトボックス用）
    const { data: tplData } = await supabase.from('templates').select('id, name');
    if (tplData) setTemplates(tplData);

    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [supabase]);

  // 編集内容の保存
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;
    setIsUpdating(true);

    try {
      // 1. テンプレートIDの更新
      const tplId = selectedTemplate === '' ? null : selectedTemplate;
      await supabase.from('orders').update({ template_id: tplId }).eq('id', editingOrder.id);

      // 2. 新しい画像が選択されていれば差し替え
      if (newFile && editingOrder.order_images.length > 0) {
        const fileExt = newFile.name.split('.').pop();
        const fileName = `${editingOrder.hash_id}_updated_${Date.now()}.${fileExt}`;
        
        // 新しい画像をアップロード
        const { error: uploadError } = await supabase.storage.from('ar_images').upload(fileName, newFile);
        if (uploadError) throw uploadError;

        // order_images のレコードを新しいファイル名に更新
        const { error: updateImgError } = await supabase
          .from('order_images')
          .update({ image_url: fileName })
          .eq('id', editingOrder.order_images[0].id);
        if (updateImgError) throw updateImgError;
      }

      alert('更新しました');
      setEditingOrder(null);
      setNewFile(null);
      fetchData(); // リストを再取得
    } catch (err) {
      console.error(err);
      alert('エラーが発生しました');
    }
    setIsUpdating(false);
  };

  const openEdit = (order: Order) => {
    setEditingOrder(order);
    setSelectedTemplate(order.template_id || '');
    setNewFile(null);
  };

  if (isLoading) return <div className="p-8">読み込み中...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">受注管理ダッシュボード</h1>
      
      <div className="bg-white shadow rounded-lg overflow-x-auto relative">
        <table className="min-w-full text-left whitespace-nowrap">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 font-medium text-gray-500 text-sm">受注日時</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-sm">顧客名</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-sm">元画像</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-sm">AR用URL</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-sm">操作</th>
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
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {imageUrl ? (
                      <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        画像確認
                      </a>
                    ) : 'なし'}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <a href={arUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      ARを開く
                    </a>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <button onClick={() => openEdit(order)} className="bg-gray-100 text-gray-700 px-3 py-1 rounded hover:bg-gray-200">
                      編集 (画像・オブジェクト差替)
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 編集モーダル */}
      {editingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{editingOrder.customer_name} 様の受注編集</h2>
            <form onSubmit={handleUpdate} className="space-y-4">
              
              <div>
                <label className="block text-sm font-medium mb-1">ARテンプレートの割り当て</label>
                <select 
                  value={selectedTemplate} 
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full border p-2 rounded"
                >
                  <option value="">(テンプレートなし / アップロード画像のみ)</option>
                  {templates.map(tpl => (
                    <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">※ここでテンプレートを指定すると、AR画面でそのオブジェクトが表示されます。</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">画像の差し替え（任意）</label>
                <input 
                  type="file" 
                  accept="image/png, image/jpeg" 
                  onChange={(e) => setNewFile(e.target.files?.[0] || null)} 
                  className="w-full border p-2 rounded" 
                />
                <p className="text-xs text-gray-500 mt-1">※選択した場合のみ、顧客がアップロードした画像が上書きされます。</p>
              </div>

              <div className="flex justify-end space-x-2 mt-6">
                <button type="button" onClick={() => setEditingOrder(null)} className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">
                  キャンセル
                </button>
                <button type="submit" disabled={isUpdating} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
                  {isUpdating ? '更新中...' : '保存する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}