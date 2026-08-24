'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

type Setting = { key: string; name: string; value: string };

export default function SettingsPage() {
  const supabase = createClient();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data, error } = await supabase.from('system_settings').select('*').order('key');
      if (data) setSettings(data);
      setIsLoading(false);
    };
    fetchSettings();
  }, [supabase]);

  const handleValueChange = (key: string, newValue: string) => {
    setSettings(prev => prev.map(s => s.key === key ? { ...s, value: newValue } : s));
  };

  const handleSave = async () => {
    setIsSaving(true);
    // Supabaseの upsert を使って一括更新する
    const { error } = await supabase.from('system_settings').upsert(settings);
    if (error) {
      alert('保存に失敗しました');
    } else {
      alert('設定を保存しました');
    }
    setIsSaving(false);
  };

  if (isLoading) return <div className="p-8">読み込み中...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">システム設定管理</h1>
        <button onClick={handleSave} disabled={isSaving} className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50">
          {isSaving ? '保存中...' : '一括保存'}
        </button>
      </div>
      
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full text-left">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 font-medium text-gray-500">項目名 (キー)</th>
              <th className="px-6 py-3 font-medium text-gray-500">設定値</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {settings.map((setting) => (
              <tr key={setting.key}>
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900">{setting.name}</div>
                  <div className="text-sm text-gray-500">{setting.key}</div>
                </td>
                <td className="px-6 py-4">
                  <input
                    type="text"
                    value={setting.value}
                    onChange={(e) => handleValueChange(setting.key, e.target.value)}
                    className="w-full border-gray-300 border p-2 rounded focus:ring-blue-500 focus:border-blue-500"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}