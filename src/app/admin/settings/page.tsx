'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function SettingsPage() {
  const supabase = createClient();
  const [options, setOptions] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const fetchOptions = async () => {
    const { data } = await supabase
      .from('form_options')
      .select('*')
      .order('display_order', { ascending: true });
    if (data) setOptions(data);
  };

  useEffect(() => {
    fetchOptions();
  }, [supabase]);

  // 新規オプション追加
  const handleAddOption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;

    const { error } = await supabase.from('form_options').insert({
      name: newName,
      price: Number(newPrice) || 0,
      display_order: options.length + 1,
    });

    if (error) {
      alert('追加に失敗しました');
    } else {
      setNewName('');
      setNewPrice('');
      fetchOptions();
    }
  };

  // 削除処理
  const handleDeleteOption = async (id: string) => {
    if (!confirm('このオプションを削除しますか？')) return;
    await supabase.from('form_options').delete().eq('id', id);
    fetchOptions();
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">システム設定・フォームオプション管理</h1>

      {/* オプション追加フォーム */}
      <div className="bg-white p-6 rounded-lg shadow mb-8">
        <h2 className="text-lg font-bold mb-4">➕ 新規オプション項目の追加</h2>
        <form onSubmit={handleAddOption} className="flex gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">オプション名</label>
            <input
              type="text"
              placeholder="例: ARカード印刷"
              className="border p-2 rounded w-64 text-sm"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">追加価格（円）</label>
            <input
              type="number"
              placeholder="1000"
              className="border p-2 rounded w-32 text-sm"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-blue-900 text-white px-4 py-2 rounded text-sm font-bold hover:bg-blue-800">
            追加する
          </button>
        </form>
      </div>

      {/* オプション一覧 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="p-4 font-semibold text-gray-700">オプション名</th>
              <th className="p-4 font-semibold text-gray-700">追加価格</th>
              <th className="p-4 font-semibold text-gray-700">操作</th>
            </tr>
          </thead>
          <tbody>
            {options.map((opt) => (
              <tr key={opt.id} className="border-b hover:bg-gray-50">
                <td className="p-4 font-bold">{opt.name}</td>
                <td className="p-4">＋¥{opt.price.toLocaleString()}</td>
                <td className="p-4">
                  <button
                    onClick={() => handleDeleteOption(opt.id)}
                    className="text-xs bg-red-100 text-red-600 hover:bg-red-200 px-2 py-1 rounded font-bold"
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}