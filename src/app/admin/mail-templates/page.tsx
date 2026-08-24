'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

type MailTemplate = {
  id: string;
  trigger_type: string;
  subject: string;
  body_content: string;
};

export default function MailTemplatesPage() {
  const supabase = createClient();
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchTemplates = async () => {
      const { data } = await supabase.from('mail_templates').select('*').order('trigger_type');
      if (data) setTemplates(data);
      setIsLoading(false);
    };
    fetchTemplates();
  }, [supabase]);

  const handleChange = (id: string, field: keyof MailTemplate, value: string) => {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const handleSave = async (template: MailTemplate) => {
    setIsSaving(true);
    const { error } = await supabase
      .from('mail_templates')
      .update({ subject: template.subject, body_content: template.body_content })
      .eq('id', template.id);
    
    if (error) alert('保存に失敗しました');
    else alert('保存しました');
    setIsSaving(false);
  };

  if (isLoading) return <div className="p-8">読み込み中...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">メールテンプレート管理</h1>
      <p className="mb-6 text-sm text-gray-600">
        ※ <code>{`{{CUSTOMER_NAME}}`}</code> や <code>{`{{TOTAL_PRICE}}`}</code>、システム設定のキー（例: <code>{`{{BANK_NAME}}`}</code>）を記述すると、送信時に自動で値が置換されます。
      </p>

      <div className="space-y-8">
        {templates.map((tpl) => (
          <div key={tpl.id} className="bg-white shadow p-6 rounded-lg">
            <div className="mb-4">
              <span className="bg-gray-200 text-gray-800 text-xs px-2 py-1 rounded font-bold">
                トリガー: {tpl.trigger_type}
              </span>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">件名</label>
              <input
                type="text"
                value={tpl.subject}
                onChange={(e) => handleChange(tpl.id, 'subject', e.target.value)}
                className="w-full border p-2 rounded focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">本文</label>
              <textarea
                rows={10}
                value={tpl.body_content}
                onChange={(e) => handleChange(tpl.id, 'body_content', e.target.value)}
                className="w-full border p-2 rounded focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="text-right">
              <button
                onClick={() => handleSave(tpl)}
                disabled={isSaving}
                className="bg-blue-600 text-white px-6 py-2 rounded font-medium disabled:opacity-50"
              >
                このテンプレートを保存
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}