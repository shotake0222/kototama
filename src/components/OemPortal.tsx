'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import Script from 'next/script';

// 配置先: app/oem/page.tsx
// OEM提供先が自分のアカウントでログインし、自分の提供先の
// 料金・フォーム内容・デフォルトマーカー・注文完了メールの文面を
// 自分で編集できるセルフサービス・ポータルです。
// props を取らないため、そのまま page.tsx として置いて構いません。
//
// 前提: 002_oem_portal_and_mail.sql を適用済みで、管理画面から
// 「🔑 ログインアカウントを発行」した email / 仮パスワードが
// 提供先に共有されていること。

const ANIMATION_TYPES = [
  { key: 'none', label: 'なし' },
  { key: 'scroll', label: 'スクロール(下から上)' },
  { key: 'scroll-down', label: 'スクロール(上から下)' },
  { key: 'scroll-left', label: 'スクロール(右から左)' },
  { key: 'scroll-right', label: 'スクロール(左から右)' },
  { key: 'pulse', label: 'ふわふわ(ゆっくり拡大縮小)' },
  { key: 'heartbeat', label: '鼓動(ドクンドクン)' },
  { key: 'float', label: '浮遊(ゆっくり上下)' },
  { key: 'bounce', label: 'バウンド(跳ねる)' },
  { key: 'swing', label: 'スイング(左右に揺れる)' },
  { key: 'shake', label: 'シェイク(ぶるぶる)' },
  { key: 'spin', label: 'スピン(レコード回転)' },
  { key: 'flip-y', label: 'フリップ(横回転)' },
  { key: 'flip-x', label: 'フリップ(縦回転)' },
  { key: 'zoom-in', label: 'ズームイン(奥から手前)' },
  { key: 'fade', label: '点滅(フェードイン/アウト)' },
];

const DEFAULT_FORM_CONFIG = {
  show_charm_option: true,
  show_key_ring_option: true,
  require_phone: false,
  allow_own_marker_upload: true,
  use_default_marker: false,
  default_marker_target_url: null as string | null,
  default_marker_mind_url: null as string | null,
  default_animation_type: 'none',
  custom_note: null as string | null,
};

export default function OemPortal() {
  const supabase = createClient();

  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [member, setMember] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [formConfig, setFormConfig] = useState<typeof DEFAULT_FORM_CONFIG>(DEFAULT_FORM_CONFIG);
  const [overrides, setOverrides] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);

  // 注文完了メール（trigger_type='thanks'）。own = 自分専用の上書き行、
  // global = 運営が設定した共通テンプレート（client_id が NULL の行）。
  const [globalMailTemplate, setGlobalMailTemplate] = useState<any>(null);
  const [hasMailOverride, setHasMailOverride] = useState(false);
  const [mailSubjectDraft, setMailSubjectDraft] = useState('');
  const [mailBodyDraft, setMailBodyDraft] = useState('');
  const [mailDirty, setMailDirty] = useState(false);

  const loadClientData = async (userId: string) => {
    setDataLoading(true);
    const { data: memberRow } = await supabase.from('client_members').select('*').eq('user_id', userId).maybeSingle();
    setMember(memberRow || null);

    if (memberRow) {
      const { data: clientRow } = await supabase.from('clients').select('*').eq('client_id', memberRow.client_id).maybeSingle();
      setClient(clientRow || null);

      const { data: cfgRow } = await supabase.from('client_form_config').select('*').eq('client_id', memberRow.client_id).maybeSingle();
      const cfg = cfgRow ? { ...DEFAULT_FORM_CONFIG, ...cfgRow } : { ...DEFAULT_FORM_CONFIG };
      setFormConfig(cfg);

      const { data: ownTemplate } = await supabase
        .from('mail_templates')
        .select('*')
        .eq('trigger_type', 'thanks')
        .eq('client_id', memberRow.client_id)
        .maybeSingle();
      const { data: globalTemplate } = await supabase
        .from('mail_templates')
        .select('*')
        .eq('trigger_type', 'thanks')
        .is('client_id', null)
        .maybeSingle();
      setGlobalMailTemplate(globalTemplate || null);
      setHasMailOverride(!!ownTemplate);
      setMailSubjectDraft(ownTemplate?.subject || '');
      setMailBodyDraft(ownTemplate?.body_content || '');
      setMailDirty(false);

      const { data: overridesData } = await supabase.from('client_settings').select('*').eq('client_id', memberRow.client_id).order('key');
      setOverrides(overridesData || []);
    }
    setDataLoading(false);
  };

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setAuthLoading(false);
      if (data.session) loadClientData(data.session.user.id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        loadClientData(newSession.user.id);
      } else {
        setMember(null);
        setClient(null);
        setFormConfig(DEFAULT_FORM_CONFIG);
        setOverrides([]);
        setGlobalMailTemplate(null);
        setHasMailOverride(false);
        setMailSubjectDraft('');
        setMailBodyDraft('');
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    if (error) setLoginError('メールアドレスまたはパスワードが違います。');
    setLoggingIn(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const compileImageToMind = async (file: File): Promise<Blob> => {
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
      reader.readAsDataURL(file);
    });
  };

  const handleUpdateBasicField = async (field: 'welcome_message' | 'contact_email' | 'logo_url', label: string, currentValue: string) => {
    if (!client) return;
    const newValue = prompt(`【${label}】の新しい値を入力してください`, currentValue || '');
    if (newValue === null) return;
    await supabase.from('clients').update({ [field]: newValue }).eq('client_id', client.client_id);
    loadClientData(session.user.id);
  };

  const handleToggleFormOption = async (field: string, currentValue: boolean) => {
    if (!client) return;
    await supabase.from('client_form_config').upsert({ client_id: client.client_id, [field]: !currentValue }, { onConflict: 'client_id' });
    loadClientData(session.user.id);
  };

  const handleUpdateAnimation = async () => {
    if (!client) return;
    const currentLabel = ANIMATION_TYPES.find(t => t.key === (formConfig.default_animation_type || 'none'))?.label;
    const menu = ANIMATION_TYPES.map((t, idx) => `${idx + 1}: ${t.label}`).join('\n');
    const input = prompt(`現在の初期アニメーション: ${currentLabel}\n\n変更する場合は番号を入力してください:\n${menu}`, '');
    if (!input) return;
    const idx = parseInt(input) - 1;
    if (idx >= 0 && idx < ANIMATION_TYPES.length) {
      await supabase.from('client_form_config').upsert({ client_id: client.client_id, default_animation_type: ANIMATION_TYPES[idx].key }, { onConflict: 'client_id' });
      loadClientData(session.user.id);
    } else {
      alert('無効な番号です。');
    }
  };

  const handleMarkerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !client) return;
    try {
      setIsCompiling(true);
      const fileExt = file.name.split('.').pop();
      const baseName = `marker_${uuidv4().substring(0, 8)}`;
      const imgPath = `clients/${client.client_id}/${baseName}.${fileExt}`;
      const mindPath = `clients/${client.client_id}/${baseName}.mind`;
      const mindBlob = await compileImageToMind(file);

      await supabase.storage.from('ar_images').upload(imgPath, file);
      await supabase.storage.from('ar_images').upload(mindPath, mindBlob);

      if (formConfig.default_marker_target_url) {
        await supabase.storage.from('ar_images').remove([formConfig.default_marker_target_url]).catch(() => {});
      }
      if (formConfig.default_marker_mind_url) {
        await supabase.storage.from('ar_images').remove([formConfig.default_marker_mind_url]).catch(() => {});
      }

      await supabase.from('client_form_config').upsert(
        { client_id: client.client_id, default_marker_target_url: imgPath, default_marker_mind_url: mindPath },
        { onConflict: 'client_id' }
      );
      loadClientData(session.user.id);
      alert('デフォルトマーカーを更新しました。');
    } catch (err) {
      alert('マーカーの登録に失敗しました。');
    } finally {
      setIsCompiling(false);
      e.target.value = '';
    }
  };

  const handleDeleteMarker = async () => {
    if (!client) return;
    if (!confirm('デフォルトマーカーを削除しますか？')) return;
    if (formConfig.default_marker_target_url) await supabase.storage.from('ar_images').remove([formConfig.default_marker_target_url]).catch(() => {});
    if (formConfig.default_marker_mind_url) await supabase.storage.from('ar_images').remove([formConfig.default_marker_mind_url]).catch(() => {});
    await supabase.from('client_form_config').update({
      default_marker_target_url: null,
      default_marker_mind_url: null,
      use_default_marker: false,
    }).eq('client_id', client.client_id);
    loadClientData(session.user.id);
  };

  const handleSaveMailTemplate = async () => {
    if (!client) return;
    try {
      const { data: existing } = await supabase
        .from('mail_templates')
        .select('id')
        .eq('trigger_type', 'thanks')
        .eq('client_id', client.client_id)
        .maybeSingle();

      if (existing) {
        await supabase.from('mail_templates').update({ subject: mailSubjectDraft, body_content: mailBodyDraft }).eq('id', existing.id);
      } else {
        await supabase.from('mail_templates').insert({ trigger_type: 'thanks', client_id: client.client_id, subject: mailSubjectDraft, body_content: mailBodyDraft });
      }
      setMailDirty(false);
      loadClientData(session.user.id);
      alert('メール文面を保存しました。');
    } catch (err) {
      alert('保存に失敗しました。');
    }
  };

  const handleDeleteMailTemplate = async () => {
    if (!client) return;
    if (!confirm('専用のメール文面を削除し、共通テンプレートに戻しますか？')) return;
    await supabase.from('mail_templates').delete().eq('trigger_type', 'thanks').eq('client_id', client.client_id);
    loadClientData(session.user.id);
  };

  const handleSetOverride = async (existingKey?: string, existingName?: string, existingValue?: string) => {
    if (!client) return;
    const key = existingKey || prompt('料金・設定のキー名を入力してください\n例: PRICE_TEMPLATE, PRICE_CHARM, PRICE_KEY_RING, PRICE_POSTAGE, PRICE_TAX など');
    if (!key) return;
    const value = prompt(`「${key}」の値を入力してください`, existingValue ?? '');
    if (value === null || value === '') return;
    const name = existingName || prompt('分かりやすい表示名を入力してください', key) || key;
    await supabase.from('client_settings').upsert({ client_id: client.client_id, key, name, value }, { onConflict: 'client_id,key' });
    loadClientData(session.user.id);
  };

  const handleDeleteOverride = async (key: string) => {
    if (!client) return;
    if (!confirm(`「${key}」の設定を削除しますか？`)) return;
    await supabase.from('client_settings').delete().eq('client_id', client.client_id).eq('key', key);
    loadClientData(session.user.id);
  };

  // ---------------------------------------------------------------------
  // 描画
  // ---------------------------------------------------------------------

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">読み込み中...</div>;
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-gray-800 text-center mb-2">OEM提供先ポータル</h1>
          <p className="text-xs text-gray-400 text-center mb-4">運営から発行されたメールアドレスとパスワードでログインしてください。</p>
          <div>
            <label className="block text-sm font-medium mb-1">メールアドレス</label>
            <input required type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">パスワード</label>
            <input required type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="w-full border p-2 rounded" />
          </div>
          {loginError && <p className="text-red-600 text-xs">{loginError}</p>}
          <button type="submit" disabled={loggingIn} className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white p-3 rounded font-bold transition">
            {loggingIn ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
      </div>
    );
  }

  if (dataLoading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">データを読み込んでいます...</div>;
  }

  if (!member || !client) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 text-center">
        <p className="text-gray-600 mb-4">このアカウントにはOEM提供先が紐付けられていません。<br />運営にお問い合わせください。</p>
        <button onClick={handleLogout} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded font-bold">ログアウト</button>
      </div>
    );
  }

  const currentAnimLabel = ANIMATION_TYPES.find(t => t.key === (formConfig.default_animation_type || 'none'))?.label;

  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/mind-ar@1.2.2/dist/mindar-image.prod.js" strategy="lazyOnload" />

      {isCompiling && (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col items-center justify-center text-white">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-purple-500 mb-4"></div>
          <p className="text-xl font-bold">マーカーを解析中...</p>
        </div>
      )}

      <div className="min-h-screen bg-gray-50 p-6 md:p-10 text-gray-800">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{client.name} 様 専用設定ポータル</h1>
              <p className="text-xs text-gray-400 mt-1 font-mono">client_id: {client.client_id}</p>
            </div>
            <button onClick={handleLogout} className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-bold transition">ログアウト</button>
          </div>

          {/* 基本情報 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-bold text-gray-700 mb-4">📋 基本情報</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button onClick={() => handleUpdateBasicField('contact_email', '担当者メールアドレス', client.contact_email || '')} className="text-left bg-gray-50 border p-3 rounded-lg hover:border-purple-300 transition">
                <span className="text-xs text-gray-400 block">担当者メール（クリックで編集）</span>{client.contact_email || '未設定'}
              </button>
              <button onClick={() => handleUpdateBasicField('welcome_message', 'フォーム上部の案内文', client.welcome_message || '')} className="text-left bg-gray-50 border p-3 rounded-lg hover:border-purple-300 transition md:col-span-2">
                <span className="text-xs text-gray-400 block">フォーム上部の案内文（クリックで編集）</span>{client.welcome_message || '未設定'}
              </button>
              <button onClick={() => handleUpdateBasicField('logo_url', 'ロゴ画像のパス（ar_imagesバケット内）', client.logo_url || '')} className="text-left bg-gray-50 border p-3 rounded-lg hover:border-purple-300 transition md:col-span-2">
                <span className="text-xs text-gray-400 block">ロゴ画像パス（クリックで編集）</span>{client.logo_url || '未設定'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-3">※名称・稼働状態の変更は運営にお問い合わせください。</p>
          </div>

          {/* フォーム内容 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-bold text-gray-700 mb-4">📝 フォーム内容の設定</h2>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => handleToggleFormOption('show_charm_option', formConfig.show_charm_option)} className={`text-xs font-bold px-3 py-2 rounded-lg border transition ${formConfig.show_charm_option ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-300'}`}>リボンチャーム表示: {formConfig.show_charm_option ? 'ON' : 'OFF'}</button>
              <button onClick={() => handleToggleFormOption('show_key_ring_option', formConfig.show_key_ring_option)} className={`text-xs font-bold px-3 py-2 rounded-lg border transition ${formConfig.show_key_ring_option ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-300'}`}>キーホルダー表示: {formConfig.show_key_ring_option ? 'ON' : 'OFF'}</button>
              <button onClick={() => handleToggleFormOption('require_phone', formConfig.require_phone)} className={`text-xs font-bold px-3 py-2 rounded-lg border transition ${formConfig.require_phone ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-300'}`}>電話番号を必須にする: {formConfig.require_phone ? 'ON' : 'OFF'}</button>
              <button onClick={() => handleToggleFormOption('allow_own_marker_upload', formConfig.allow_own_marker_upload)} className={`text-xs font-bold px-3 py-2 rounded-lg border transition ${formConfig.allow_own_marker_upload ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-300'}`}>独自マーカーの任意アップロード許可: {formConfig.allow_own_marker_upload ? 'ON' : 'OFF'}</button>
              <button onClick={handleUpdateAnimation} className="text-xs font-bold px-3 py-2 rounded-lg border bg-pink-50 border-pink-200 text-pink-700">初期アニメーション: {currentAnimLabel}</button>
            </div>
          </div>

          {/* デフォルトマーカー */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-bold text-gray-700 mb-4">🎯 デフォルトマーカー（共通ARトラッキング画像）</h2>
            <div className="flex items-center gap-4 flex-wrap">
              {formConfig.default_marker_target_url ? (
                <img
                  src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ar_images/${formConfig.default_marker_target_url}`}
                  alt="default marker"
                  className="w-20 h-20 object-contain bg-gray-100 rounded border"
                />
              ) : (
                <div className="w-20 h-20 bg-gray-100 flex items-center justify-center text-xs text-gray-400 rounded border">未設定</div>
              )}
              <div className="text-sm text-gray-500 flex-1 min-w-[200px]">
                「全ユーザーに適用」をONにすると、お客様は自分でトラッキング画像をアップロードする必要がなくなります。
              </div>
              <div className="flex flex-col gap-2">
                <label className="bg-green-100 hover:bg-green-200 text-green-700 font-bold px-3 py-2 rounded text-xs transition cursor-pointer text-center">
                  {formConfig.default_marker_target_url ? '再登録する' : 'マーカーを登録'}
                  <input type="file" accept="image/*" className="hidden" onChange={handleMarkerFileChange} />
                </label>
                {formConfig.default_marker_target_url && (
                  <button onClick={handleDeleteMarker} className="bg-red-50 hover:bg-red-100 text-red-600 font-bold px-3 py-2 rounded text-xs transition">削除</button>
                )}
                <button
                  onClick={() => handleToggleFormOption('use_default_marker', formConfig.use_default_marker)}
                  disabled={!formConfig.default_marker_target_url}
                  className={`font-bold px-3 py-2 rounded text-xs transition disabled:opacity-40 ${formConfig.use_default_marker ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-600'}`}
                >
                  {formConfig.use_default_marker ? '✅ 全ユーザーに強制適用中' : 'このマーカーを全ユーザーに適用'}
                </button>
              </div>
            </div>
          </div>

          {/* メール文面 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-bold text-gray-700 mb-4">✉️ 注文完了メールの文面</h2>
            <div className="bg-indigo-50 border border-indigo-100 rounded p-3 text-xs text-indigo-700 mb-4">
              差し込み変数が使えます: <code>{'{{CUSTOMER_NAME}}'}</code> <code>{'{{TOTAL_PRICE}}'}</code> <code>{'{{AR_URL}}'}</code> <code>{'{{CLIENT_NAME}}'}</code>
              <br />空欄のまま保存すると、運営が設定した共通テンプレート（{globalMailTemplate?.subject || '未設定'}）が使われます。
            </div>
            <div className="mb-3">
              <label className="block text-xs font-bold text-gray-500 mb-1">件名</label>
              <input
                value={mailSubjectDraft}
                onChange={(e) => { setMailSubjectDraft(e.target.value); setMailDirty(true); }}
                className="w-full border p-2 rounded text-sm"
                placeholder={globalMailTemplate?.subject || '（共通テンプレート未設定）'}
              />
            </div>
            <div className="mb-3">
              <label className="block text-xs font-bold text-gray-500 mb-1">本文</label>
              <textarea
                value={mailBodyDraft}
                onChange={(e) => { setMailBodyDraft(e.target.value); setMailDirty(true); }}
                rows={8}
                className="w-full border p-2 rounded text-sm"
                placeholder={globalMailTemplate?.body_content || '（共通テンプレート未設定）'}
              />
            </div>
            <div className="flex justify-end gap-2">
              {hasMailOverride && (
                <button
                  onClick={handleDeleteMailTemplate}
                  className="bg-red-50 hover:bg-red-100 text-red-600 font-bold px-5 py-2 rounded-lg text-sm transition"
                >
                  共通テンプレートに戻す（削除）
                </button>
              )}
              <button
                onClick={handleSaveMailTemplate}
                disabled={!mailDirty}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold px-5 py-2 rounded-lg text-sm transition"
              >
                この文面を保存
              </button>
            </div>
          </div>

          {/* 料金設定 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <h2 className="font-bold text-gray-700">💰 料金・その他の設定</h2>
              <button onClick={() => handleSetOverride()} className="text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-lg transition">＋ 設定を追加/編集</button>
            </div>
            {overrides.length === 0 ? (
              <p className="text-sm text-gray-400">個別設定なし（運営が設定した共通料金が適用されます）</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-left">
                  <thead className="bg-gray-50 border-b"><tr><th className="p-2">キー</th><th className="p-2">項目名</th><th className="p-2">値</th><th className="p-2 text-right">操作</th></tr></thead>
                  <tbody>
                    {overrides.map((ov: any) => (
                      <tr key={ov.key} className="border-b">
                        <td className="p-2 font-mono text-xs text-gray-500">{ov.key}</td>
                        <td className="p-2 font-bold">{ov.name}</td>
                        <td className="p-2 font-mono">{ov.value}</td>
                        <td className="p-2 text-right space-x-2">
                          <button onClick={() => handleSetOverride(ov.key, ov.name, ov.value)} className="bg-gray-800 hover:bg-gray-900 text-white font-bold px-3 py-1.5 rounded text-xs transition">編集</button>
                          <button onClick={() => handleDeleteOverride(ov.key)} className="bg-red-50 text-red-600 hover:bg-red-100 font-bold px-3 py-1.5 rounded text-xs transition">削除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
