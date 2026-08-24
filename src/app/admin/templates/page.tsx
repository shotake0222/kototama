'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

type Template = {
  id: string;
  name: string;
  object_url: string;
  description: string;
};

export default function TemplatesPage() {
  const supabase = createClient();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // テンプレート一覧取得
  const fetchTemplates = async () => {
    const { data } = await supabase.from('templates').select('*').order('created_at', { ascending: false });
    if (data) setTemplates(data);
  };

  useEffect(() => {
    fetchTemplates();
  }, [supabase]);

  // 新規追加処理
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name) return alert('ファイルとテンプレート名は必須です');
    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage.from('templates').upload(fileName, file);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from('templates')
        .insert([{ name, description, object_url: fileName }]);
      if (insertError) throw insertError;

      alert('追加しました');
      setName('');
      setDescription('');
      setFile(null);
      fetchTemplates();
    } catch (err) {
      console.error(err);
      alert('エラーが発生しました');
    }
    setIsUploading(false);
  };

  // 削除処理
  const handleDelete = async (id: string, fileName: string) => {
    if (!confirm('本当に削除しますか？')) return;
    
    // DBとStorageから削除
    await supabase.from('templates').delete().eq('id', id);
    await supabase.storage.from('templates').remove([fileName]);
    fetchTemplates();
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">ARテンプレート管理</h1>

      {/* 新規登録フォーム */}
      <div className="bg-white shadow p-6 rounded-lg mb-8">
        <h2 className="text-lg font-semibold mb-4">新規テンプレート追加</h2>
        <form onSubmit={handleUpload} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">テンプレート名</label>
            <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">オブジェクトファイル (glb, gltf, png等)</label>
            <input required type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="w-full border p-2 rounded" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">説明・メモ</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="w-full border p-2 rounded" />
          </div>
          <div className="md:col-span-2">
            <button type="submit" disabled={isUploading} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
              {isUploading ? 'アップロード中...' : '追加する'}
            </button>
          </div>
        </form>
      </div>

      {/* 登録済み一覧 */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-sm font-medium text-gray-500">テンプレート名</th>
              <th className="px-6 py-3 text-sm font-medium text-gray-500">ファイルパス</th>
              <th className="px-6 py-3 text-sm font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {templates.map(tpl => (
              <tr key={tpl.id}>
                <td className="px-6 py-4">
                  <div className="font-medium">{tpl.name}</div>
                  <div className="text-xs text-gray-500">{tpl.description}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 break-all">{tpl.object_url}</td>
                <td className="px-6 py-4">
                  <button onClick={() => handleDelete(tpl.id, tpl.object_url)} className="text-red-600 hover:underline text-sm font-medium">
                    削除
                  </button>
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr><td colSpan={3} className="px-6 py-4 text-center text-gray-500">登録データがありません</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}