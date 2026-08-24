'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { v4 as uuidv4 } from 'uuid';

type SettingsMap = { [key: string]: string };

export default function OrderForm() {
  const supabase = createClient();
  const [settings, setSettings] = useState<SettingsMap>({});
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  
  // オプション選択状態
  const [hasCharm, setHasCharm] = useState(false);
  const [hasKeyRing, setHasKeyRing] = useState(false);
  
  const [status, setStatus] = useState<'loading' | 'idle' | 'submitting' | 'success'>('loading');
  const [hashUrl, setHashUrl] = useState('');
  const [totalPrice, setTotalPrice] = useState(0);

  // 設定値の読み込み
  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('system_settings').select('key, value');
      if (data) {
        const map: SettingsMap = {};
        data.forEach(item => { map[item.key] = item.value; });
        setSettings(map);
      }
      setStatus('idle');
    };
    fetchSettings();
  }, [supabase]);

  // 合計金額の計算
  useEffect(() => {
    if (Object.keys(settings).length === 0) return;
    const basePrice = parseInt(settings['PRICE_TEMPLATE'] || '0', 10);
    const charmPrice = hasCharm ? parseInt(settings['PRICE_CHARM'] || '0', 10) : 0;
    const keyRingPrice = hasKeyRing ? parseInt(settings['PRICE_KEY_RING'] || '0', 10) : 0;
    const postage = parseInt(settings['PRICE_POSTAGE'] || '0', 10);
    const taxRate = parseFloat(settings['PRICE_TAX'] || '0');

    const subtotal = basePrice + charmPrice + keyRingPrice;
    const tax = Math.floor(subtotal * taxRate);
    setTotalPrice(subtotal + tax + postage);
  }, [settings, hasCharm, hasKeyRing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return alert('画像をアップロードしてください');
    setStatus('submitting');

    try {
      const hashId = uuidv4().replace(/-/g, '').substring(0, 16);
      const fileExt = file.name.split('.').pop();
      const fileName = `${hashId}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage.from('ar_images').upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert([{ hash_id: hashId, customer_name: name, email: email, total_price: totalPrice }])
        .select().single();
      if (orderError) throw orderError;

      const { error: imageError } = await supabase
        .from('order_images')
        .insert([{ order_id: orderData.id, image_url: fileName }]);
      if (imageError) throw imageError;

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setHashUrl(`${origin}/ar/${hashId}`);
      setStatus('success');
    } catch (error) {
      console.error(error);
      alert('エラーが発生しました。');
      setStatus('idle');
    }
  };

  if (status === 'loading') return <div className="p-8 text-center">読み込み中...</div>;

  if (status === 'success') {
    return (
      <div className="p-8 max-w-lg mx-auto text-center bg-white rounded shadow-sm">
        <h2 className="text-2xl font-bold mb-4">ご注文ありがとうございます！</h2>
        <p className="mb-4">ご請求金額: <strong>{totalPrice.toLocaleString()} 円</strong></p>
        <p className="mb-4 text-sm text-gray-600">以下の専用ARリンクが生成されました。</p>
        <a href={hashUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all p-4 block bg-gray-50 rounded">
          {hashUrl}
        </a>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto bg-white rounded shadow-sm">
      <h2 className="text-xl font-bold mb-4">AR作成 ご注文フォーム</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">お名前</label>
          <input required type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full border p-2 rounded" />
        </div>
        <div>
          <label className="block text-sm font-medium">メールアドレス</label>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border p-2 rounded" />
        </div>
        <div>
          <label className="block text-sm font-medium">AR用画像のアップロード</label>
          <input required type="file" accept="image/png, image/jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full border p-2 rounded" />
        </div>
        
        {/* オプション選択 */}
        <div className="bg-gray-50 p-4 rounded space-y-2 border">
          <p className="font-medium text-sm">オプション選択</p>
          <label className="flex items-center space-x-2">
            <input type="checkbox" checked={hasCharm} onChange={(e) => setHasCharm(e.target.checked)} />
            <span>リボンチャームを追加 (+{settings['PRICE_CHARM']}円)</span>
          </label>
          <label className="flex items-center space-x-2">
            <input type="checkbox" checked={hasKeyRing} onChange={(e) => setHasKeyRing(e.target.checked)} />
            <span>キーホルダーを追加 (+{settings['PRICE_KEY_RING']}円)</span>
          </label>
        </div>

        {/* 金額表示 */}
        <div className="text-right text-lg font-bold border-t pt-4">
          合計金額 (税込・送料込): {totalPrice.toLocaleString()} 円
        </div>

        <button type="submit" disabled={status === 'submitting'} className="w-full bg-blue-600 text-white p-3 rounded font-bold disabled:opacity-50 transition-opacity">
          {status === 'submitting' ? '送信中...' : '注文を確定する'}
        </button>
      </form>
    </div>
  );
}