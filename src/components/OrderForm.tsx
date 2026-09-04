'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import Script from 'next/script';

type SettingsMap = { [key: string]: string };

type ClientRow = {
  id: string;
  client_id: string;
  name: string;
  contact_email: string | null;
  status: string;
  welcome_message: string | null;
  logo_url: string | null;
};

type ClientFormConfig = {
  client_id: string;
  show_charm_option: boolean;
  show_key_ring_option: boolean;
  require_phone: boolean;
  allow_own_marker_upload: boolean;
  use_default_marker: boolean;
  default_marker_target_url: string | null;
  default_marker_mind_url: string | null;
  default_animation_type: string;
  custom_note: string | null;
};

// OEM提供先が未指定（自社サイト直販）の場合や、まだ client_form_config が
// 作成されていない場合に使うデフォルト値。元の OrderForm の挙動と同一です。
const DEFAULT_FORM_CONFIG: ClientFormConfig = {
  client_id: '',
  show_charm_option: true,
  show_key_ring_option: true,
  require_phone: false,
  allow_own_marker_upload: true,
  use_default_marker: false,
  default_marker_target_url: null,
  default_marker_mind_url: null,
  default_animation_type: 'none',
  custom_note: null,
};

// ==========================================================================
// OrderForm 本体
// clientId は props で渡すか、URL クエリ ?client=xxx から自動取得します。
// 埋め込みタグ（管理画面「OEM提供先管理」タブで発行）が
// data-client-id="xxx" を持つ想定で、埋め込みスクリプト側で
// このページを ?client=xxx 付きの iframe 等として読み込む構成を想定しています。
// ==========================================================================
function OrderFormInner({ clientId: clientIdProp }: { clientId?: string }) {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const clientId = clientIdProp || searchParams.get('client') || null;

  const [settings, setSettings] = useState<SettingsMap>({});
  const [client, setClient] = useState<ClientRow | null>(null);
  const [formConfig, setFormConfig] = useState<ClientFormConfig>(DEFAULT_FORM_CONFIG);

  const [file, setFile] = useState<File | null>(null);
  const [trackingFile, setTrackingFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // オプション選択状態
  const [hasCharm, setHasCharm] = useState(false);
  const [hasKeyRing, setHasKeyRing] = useState(false);

  const [status, setStatus] = useState<'loading' | 'idle' | 'submitting' | 'success' | 'unavailable'>('loading');
  const [hashUrl, setHashUrl] = useState('');
  const [totalPrice, setTotalPrice] = useState(0);

  // 設定値の読み込み（グローバル設定 + OEM提供先の上書き設定）
  useEffect(() => {
    let active = true;

    const fetchSettings = async () => {
      const { data: globalData } = await supabase.from('system_settings').select('key, value');
      const map: SettingsMap = {};
      (globalData || []).forEach((item: any) => { map[item.key] = item.value; });

      let resolvedClient: ClientRow | null = null;
      let cfg: ClientFormConfig = DEFAULT_FORM_CONFIG;

      if (clientId) {
        const { data: clientRow } = await supabase
          .from('clients')
          .select('*')
          .eq('client_id', clientId)
          .maybeSingle();
        resolvedClient = (clientRow as ClientRow) || null;

        if (resolvedClient) {
          // クライアント専用の料金・設定の上書きをマージ（同名キーはこちらが優先）
          const { data: overrides } = await supabase
            .from('client_settings')
            .select('key, value')
            .eq('client_id', clientId);
          (overrides || []).forEach((item: any) => { map[item.key] = item.value; });

          const { data: cfgRow } = await supabase
            .from('client_form_config')
            .select('*')
            .eq('client_id', clientId)
            .maybeSingle();
          if (cfgRow) cfg = cfgRow as ClientFormConfig;
        }
      }

      if (!active) return;
      setSettings(map);
      setClient(resolvedClient);
      setFormConfig(cfg);

      // clientId が指定されているのに提供先が見つからない／停止中の場合はフォームを表示しない
      if (clientId && (!resolvedClient || resolvedClient.status !== 'active')) {
        setStatus('unavailable');
      } else {
        setStatus('idle');
      }
    };

    fetchSettings();
    return () => { active = false; };
  }, [supabase, clientId]);

  // 合計金額の計算（グローバル設定はクライアント別の上書きで既にマージ済み）
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

  // ユーザー自身がARトラッキング画像をアップロードした場合、ブラウザ上でMindAR用に
  // コンパイルします（管理画面 Dashboard.tsx の compileImageToMind と同じロジック）。
  const compileImageToMind = async (imgFile: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const img = new Image();
        img.onload = async () => {
          try {
            // @ts-ignore
            const compiler = new window.MINDAR.IMAGE.Compiler();
            await compiler.compileImageTargets([img], () => {});
            const exportedBuffer = await compiler.exportData();
            resolve(new Blob([exportedBuffer], { type: 'application/octet-stream' }));
          } catch (err) { reject(err); }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(imgFile);
    });
  };

  // 🔒 セキュリティ修正（Phase 0）: 以前はここでブラウザから直接
  // Supabase（orders / order_images / storage）に書き込んでおり、金額も
  // ブラウザが計算した totalPrice をそのまま保存していたため、原理上は
  // 誰でも任意の金額・任意のOEM提供先IDで注文を作成できてしまう状態だった。
  // 画面の見た目・操作感は変えずに、新設した /api/order（サーバー側で
  // 金額とデータを検証してからDBに書き込む）にPOSTする形に差し替えている。
  // MindAR用の .mind ファイル生成だけはブラウザのCanvas/Image APIが必要なため
  // 引き続きクライアント側で行い、生成済みファイルをアップロードで送る。
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'unavailable') return;
    if (!file) return alert('画像をアップロードしてください');
    if (formConfig.require_phone && !phone.trim()) return alert('電話番号を入力してください');

    setStatus('submitting');

    try {
      const needsOwnMarkerCompile = !formConfig.use_default_marker && formConfig.allow_own_marker_upload && trackingFile;
      const mindBlob = needsOwnMarkerCompile ? await compileImageToMind(trackingFile as File) : null;

      const body = new FormData();
      body.append('customerName', name);
      body.append('email', email);
      if (formConfig.require_phone) body.append('phone', phone);
      if (clientId) body.append('clientId', clientId);
      body.append('hasCharm', String(hasCharm));
      body.append('hasKeyRing', String(hasKeyRing));
      body.append('originalFile', file);
      if (needsOwnMarkerCompile && trackingFile && mindBlob) {
        body.append('trackingFile', trackingFile);
        body.append('mindFile', new File([mindBlob], 'target.mind', { type: 'application/octet-stream' }));
      }

      const res = await fetch('/api/order', { method: 'POST', body });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || '不明なエラーが発生しました。');

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setTotalPrice(result.totalPrice ?? totalPrice);
      setHashUrl(`${origin}/ar?uid=${result.hashId}`);
      setStatus('success');
    } catch (error) {
      console.error(error);
      alert('エラーが発生しました。');
      setStatus('idle');
    }
  };

  if (status === 'loading') return <div className="p-8 text-center">読み込み中...</div>;

  if (status === 'unavailable') {
    return (
      <div className="p-8 max-w-lg mx-auto text-center bg-white rounded shadow-sm">
        <h2 className="text-xl font-bold mb-2 text-gray-700">ただいまご利用いただけません</h2>
        <p className="text-sm text-gray-500">このフォームは現在ご利用いただけません。発行元にお問い合わせください。</p>
      </div>
    );
  }

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

  const showOptionsBox = formConfig.show_charm_option || formConfig.show_key_ring_option;
  const showTrackingUpload = !formConfig.use_default_marker && formConfig.allow_own_marker_upload;

  return (
    <>
      {/* ユーザーが独自にARトラッキング画像をアップロードできる設定の場合のみ必要 */}
      <Script src="https://cdn.jsdelivr.net/npm/mind-ar@1.2.2/dist/mindar-image.prod.js" strategy="lazyOnload" />

      <div className="p-4 max-w-lg mx-auto bg-white rounded shadow-sm">
        {client?.logo_url && (
          <img src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ar_images/${client.logo_url}`} alt={client.name} className="h-12 mx-auto mb-4 object-contain" />
        )}
        <h2 className="text-xl font-bold mb-4">{client ? `${client.name} ARキーホルダー ご注文フォーム` : 'AR作成 ご注文フォーム'}</h2>

        {client?.welcome_message && (
          <div className="bg-blue-50 border-l-4 border-blue-400 p-3 mb-4 text-sm text-blue-800 whitespace-pre-wrap">{client.welcome_message}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">お名前</label>
            <input required type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium">メールアドレス</label>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border p-2 rounded" />
          </div>
          {formConfig.require_phone && (
            <div>
              <label className="block text-sm font-medium">電話番号</label>
              <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border p-2 rounded" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium">AR用画像のアップロード</label>
            <input required type="file" accept="image/png, image/jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full border p-2 rounded" />
          </div>

          {/* ARトラッキング（イメージターゲット）画像 */}
          {formConfig.use_default_marker ? (
            <div className="bg-purple-50 border border-purple-100 rounded p-3 text-xs text-purple-700">
              AR表示には{client ? client.name : ''}提供の共通マーカーが使用されます。
            </div>
          ) : showTrackingUpload ? (
            <div>
              <label className="block text-sm font-medium">AR用トラッキング画像（任意）</label>
              <input type="file" accept="image/png, image/jpeg" onChange={(e) => setTrackingFile(e.target.files?.[0] || null)} className="w-full border p-2 rounded" />
              <p className="text-xs text-gray-400 mt-1">未アップロードの場合は標準マーカーが使用されます。処理に数十秒かかる場合があります。</p>
            </div>
          ) : null}

          {/* オプション選択 */}
          {showOptionsBox && (
            <div className="bg-gray-50 p-4 rounded space-y-2 border">
              <p className="font-medium text-sm">オプション選択</p>
              {formConfig.show_charm_option && (
                <label className="flex items-center space-x-2">
                  <input type="checkbox" checked={hasCharm} onChange={(e) => setHasCharm(e.target.checked)} />
                  <span>リボンチャームを追加 (+{settings['PRICE_CHARM']}円)</span>
                </label>
              )}
              {formConfig.show_key_ring_option && (
                <label className="flex items-center space-x-2">
                  <input type="checkbox" checked={hasKeyRing} onChange={(e) => setHasKeyRing(e.target.checked)} />
                  <span>キーホルダーを追加 (+{settings['PRICE_KEY_RING']}円)</span>
                </label>
              )}
            </div>
          )}

          {formConfig.custom_note && (
            <div className="bg-yellow-50 border border-yellow-100 rounded p-3 text-xs text-yellow-800 whitespace-pre-wrap">{formConfig.custom_note}</div>
          )}

          {/* 金額表示 */}
          <div className="text-right text-lg font-bold border-t pt-4">
            合計金額 (税込・送料込): {totalPrice.toLocaleString()} 円
          </div>

          <button type="submit" disabled={status === 'submitting'} className="w-full bg-blue-600 text-white p-3 rounded font-bold disabled:opacity-50 transition-opacity">
            {status === 'submitting' ? '送信中...' : '注文を確定する'}
          </button>
        </form>
      </div>
    </>
  );
}

// useSearchParams は Suspense 境界の内側で使う必要があるため、
// このコンポーネントは Suspense でラップした状態でエクスポートします。
export default function OrderForm({ clientId }: { clientId?: string } = {}) {
  return (
    <Suspense fallback={<div className="p-8 text-center">読み込み中...</div>}>
      <OrderFormInner clientId={clientId} />
    </Suspense>
  );
}
