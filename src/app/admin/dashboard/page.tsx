'use client';
import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import Script from 'next/script';

// 💡 15種類のアニメーションタイプを網羅
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
  { key: 'fade', label: '点滅(フェードイン/アウト)' }
];

// OEM提供先の「フォーム内容」既定値（client_form_config行がまだ無い場合の表示用フォールバック）
const DEFAULT_CLIENT_FORM_CONFIG = {
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

export default function Dashboard() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<'orders' | 'images' | 'settings' | 'bulk' | 'emails' | 'clients'>('orders');
  const [activeImageTab, setActiveImageTab] = useState<'processed' | 'original' | 'targets' | 'templates'>('processed');

  const [orders, setOrders] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [clientId, setClientId] = useState('');

  const [showEmbedModal, setShowEmbedModal] = useState(false);

  // OEM提供先管理
  const [clients, setClients] = useState<any[]>([]);
  const [clientSettingsMap, setClientSettingsMap] = useState<{ [clientId: string]: any[] }>({});
  const [clientFormConfigMap, setClientFormConfigMap] = useState<{ [clientId: string]: any }>({});
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [orderClientFilter, setOrderClientFilter] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{ type: string, id?: string, oldPath?: string } | null>(null);

  const [csvData, setCsvData] = useState<any[]>([]);
  const [bulkImages, setBulkImages] = useState<File[]>([]);
  const [isUploadingBulk, setIsUploadingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [csvEncoding, setCsvEncoding] = useState<'UTF-8' | 'Shift_JIS'>('UTF-8');
  const [isCompiling, setIsCompiling] = useState(false);

  const [emailTemplates, setEmailTemplates] = useState<any[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody, setMailBody] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [mailTemplateName, setMailTemplateName] = useState('');

  const fetchData = async () => {
    const { data: ordersData } = await supabase.from('orders').select('*, order_images(*)').order('created_at', { ascending: false });
    if (ordersData) setOrders(ordersData);

    const { data: settingsData } = await supabase.from('system_settings').select('*').order('key', { ascending: true });
    if (settingsData) {
      setSettings(settingsData);
      const templatesData = settingsData.filter(s => s.key.startsWith('MAIL_TEMPLATE_'));
      setEmailTemplates(templatesData);
    }

    const { data: storageData } = await supabase.storage.from('ar_images').list('templates', { limit: 100 });
    if (storageData) setTemplates(storageData.filter(f => f.name !== '.emptyFolderPlaceholder'));

    // ---- OEM提供先まわり ----
    const { data: clientsData } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    if (clientsData) setClients(clientsData);

    const { data: clientSettingsData } = await supabase.from('client_settings').select('*').order('key', { ascending: true });
    if (clientSettingsData) {
      const map: { [k: string]: any[] } = {};
      clientSettingsData.forEach((row: any) => {
        if (!map[row.client_id]) map[row.client_id] = [];
        map[row.client_id].push(row);
      });
      setClientSettingsMap(map);
    }

    const { data: clientCfgData } = await supabase.from('client_form_config').select('*');
    if (clientCfgData) {
      const map: { [k: string]: any } = {};
      clientCfgData.forEach((row: any) => { map[row.client_id] = row; });
      setClientFormConfigMap(map);
    }
  };

  useEffect(() => { fetchData(); }, [supabase]);

  const getImageUrl = (path: string) => {
    if (!path) return '';
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ar_images/${path}`;
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
            await compiler.compileImageTargets([img], (progress: number) => { console.log('MindAR Compiling Progress:', progress.toFixed(2)); });
            const exportedBuffer = await compiler.exportData();
            const blob = new Blob([exportedBuffer], { type: 'application/octet-stream' });
            resolve(blob);
          } catch (err) { reject(err); }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDeleteOrder = async (orderId: string, customerName: string) => {
    if (!confirm(`本当に ${customerName} 様の注文データを完全に削除しますか？\n※この操作は取り消せません。`)) return;
    try {
      await supabase.from('order_images').delete().eq('order_id', orderId);
      await supabase.from('orders').delete().eq('id', orderId);
      fetchData();
      alert('削除しました。');
    } catch (err) {
      console.error(err);
      alert('削除に失敗しました。');
    }
  };

  const handleUpdateNfcUid = async (orderId: string, currentUid: string | null) => {
    const newUid = prompt('この注文に紐付けるNFCタグのUID（シリアルナンバー）を入力・スキャンしてください。', currentUid || '');
    if (newUid !== null && newUid !== currentUid) {
      await supabase.from('orders').update({ nfc_uid: newUid.trim() }).eq('id', orderId);
      fetchData();
    }
  };

  const handleUpdateScale = async (orderId: string, currentScale: number) => {
    const newScale = prompt('新しいサイズ倍率を入力してください（例: 1.0, 1.5, 0.5）', currentScale.toString());
    if (newScale && !isNaN(Number(newScale))) {
      await supabase.from('orders').update({ object_scale: Number(newScale) }).eq('id', orderId);
      fetchData();
    }
  };

  const handleUpdateAnimation = async (orderId: string, currentType: string) => {
    const currentLabel = ANIMATION_TYPES.find(t => t.key === (currentType || 'none'))?.label;
    const menu = ANIMATION_TYPES.map((t, idx) => `${idx + 1}: ${t.label}`).join('\n');

    const input = prompt(`現在のアニメーション: ${currentLabel}\n\n変更する場合は以下の番号を入力してください:\n${menu}`, '');
    if (!input) return;

    const selectedIdx = parseInt(input) - 1;
    if (selectedIdx >= 0 && selectedIdx < ANIMATION_TYPES.length) {
      const newType = ANIMATION_TYPES[selectedIdx].key;
      try {
        await supabase.from('orders').update({ animation_type: newType }).eq('id', orderId);
        fetchData();
        alert(`アニメーションを「${ANIMATION_TYPES[selectedIdx].label}」に変更しました。`);
      } catch (err) {
        alert('変更に失敗しました。');
      }
    } else {
      alert('無効な番号です。');
    }
  };

  const handleUpdateSetting = async (settingKey: string, settingName: string, currentValue: string) => {
    const newValue = prompt(`【${settingName}】の新しい値を入力してください`, currentValue);
    if (newValue !== null && newValue !== currentValue) {
      await supabase.from('system_settings').update({ value: newValue }).eq('key', settingKey);
      fetchData();
    }
  };

  const handleAddSetting = async () => {
    const key = prompt('システムキー名を入力してください\n※商品を追加する場合は PRODUCT_ACRYLIC のように PRODUCT_ から始めてください');
    if (!key) return;
    const name = prompt('設定項目名を入力してください');
    if (!name) return;
    const value = prompt('設定値を入力してください\n※商品を追加する場合は「商品名,価格」の形式で入力してください\n例: アクリルスタンド,4500');
    if (!value) return;
    await supabase.from('system_settings').insert({ key, name, value });
    fetchData();
  };

  const handleDeleteSetting = async (settingKey: string, settingName: string) => {
    if (!confirm(`本当に「${settingName}」を削除しますか？`)) return;
    await supabase.from('system_settings').delete().eq('key', settingKey);
    fetchData();
  };

  const triggerFileInput = (type: string, id?: string, oldPath?: string) => {
    setUploadTarget({ type, id, oldPath });
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;

    try {
      const fileExt = file.name.split('.').pop();
      let newPath = '';

      if (uploadTarget.type === 'targets') {
        setIsCompiling(true);
        const baseName = `target_${uuidv4().substring(0,8)}`;
        const imgPath = `targets/${baseName}.${fileExt}`;
        const mindPath = `minds/${baseName}.mind`;
        const mindBlob = await compileImageToMind(file);

        await supabase.storage.from('ar_images').upload(imgPath, file);
        await supabase.storage.from('ar_images').upload(mindPath, mindBlob);
        await supabase.from('orders').update({ target_image_url: imgPath, mind_file_url: mindPath, ar_mode: 'mindar' }).eq('id', uploadTarget.id);
        setIsCompiling(false);
      } else if (uploadTarget.type === 'client_marker' && uploadTarget.id) {
        // OEM提供先の「デフォルトマーカー」登録・差し替え
        setIsCompiling(true);
        const cid = uploadTarget.id;
        const baseName = `marker_${uuidv4().substring(0, 8)}`;
        const imgPath = `clients/${cid}/${baseName}.${fileExt}`;
        const mindPath = `clients/${cid}/${baseName}.mind`;
        const mindBlob = await compileImageToMind(file);

        await supabase.storage.from('ar_images').upload(imgPath, file);
        await supabase.storage.from('ar_images').upload(mindPath, mindBlob);

        // 古いデフォルトマーカーが存在すれば削除（失敗しても処理は継続）
        const prevCfg = clientFormConfigMap[cid];
        if (prevCfg?.default_marker_target_url) {
          await supabase.storage.from('ar_images').remove([prevCfg.default_marker_target_url]).catch(() => {});
        }
        if (prevCfg?.default_marker_mind_url) {
          await supabase.storage.from('ar_images').remove([prevCfg.default_marker_mind_url]).catch(() => {});
        }

        await supabase.from('client_form_config').upsert(
          { client_id: cid, default_marker_target_url: imgPath, default_marker_mind_url: mindPath },
          { onConflict: 'client_id' }
        );
        setIsCompiling(false);
      } else {
        if (uploadTarget.type === 'template') {
          const fileName = prompt('テンプレートファイル名を入力（例: T-11）', file.name.split('.')[0]);
          if (!fileName) return;
          newPath = `templates/${fileName}.${fileExt}`;
          await supabase.storage.from('ar_images').upload(newPath, file, { upsert: true });
        } else {
          const prefix = uploadTarget.type === 'processed' ? 'proc_' : 'orig_';
          newPath = `${prefix}${uuidv4()}.${fileExt}`;
          await supabase.storage.from('ar_images').upload(newPath, file);
          const updateData = uploadTarget.type === 'processed' ? { processed_image_url: newPath } : { original_image_url: newPath };
          await supabase.from('order_images').update(updateData).eq('id', uploadTarget.id);
        }
      }

      if (uploadTarget.oldPath && !uploadTarget.oldPath.startsWith('templates/')) {
        await supabase.storage.from('ar_images').remove([uploadTarget.oldPath]);
      }
      fetchData();
      alert('オブジェクト（画像）の差し替えが完了しました！');
    } catch (err) {
      setIsCompiling(false);
      alert('画像のアップロードに失敗しました。');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploadTarget(null);
    }
  };

  const handleDeleteImage = async (type: string, id?: string, path?: string) => {
    if (!confirm('本当にこの画像を削除しますか？')) return;
    try {
      if (type === 'template' && path) { await supabase.storage.from('ar_images').remove([`templates/${path}`]);
      } else if (id && path) {
        const updateData = type === 'processed' ? { processed_image_url: null } : { original_image_url: null };
        await supabase.from('order_images').update(updateData).eq('id', id);
        if (!path.startsWith('templates/')) await supabase.storage.from('ar_images').remove([path]);
      }
      fetchData();
    } catch (err) { alert('削除に失敗しました。'); }
  };

  const handleDownloadSampleCsv = () => {
    const csvContent = "氏名,メールアドレス,クライアントID,NFC_UID,種類,テンプレートID,画像ファイル名,アニメーション,性別,年齢,郵便番号,住所,備考\n" +
                       "テスト 太郎,test@example.com,bulk_001,NFC-001,キーホルダー,,test_image1.jpg,none,男性,30,1000001,東京都千代田区,1枚アップロード\n" +
                       "テスト 花子,test2@example.com,bulk_001,NFC-002,キーホルダー,T-01,,,女性,25,1000001,東京都千代田区,テンプレート使用\n" +
                       "テスト 次郎,test3@example.com,bulk_001,NFC-003,リボンチャーム,,test_image2.jpg|test_image3.jpg,pulse,男性,40,1000001,東京都千代田区,アルバム＋ふわふわ";

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "ことたま_一括登録サンプル.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.readAsText(file, csvEncoding);
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim());
      const parsed = lines.slice(1).map(line => {
        let values = []; let inQuotes = false; let currentValue = '';
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') inQuotes = !inQuotes;
          else if (char === ',' && !inQuotes) { values.push(currentValue); currentValue = ''; }
          else currentValue += char;
        }
        values.push(currentValue);
        const obj: any = {};
        headers.forEach((h, i) => { obj[h] = values[i] ? values[i].trim().replace(/^"|"$/g, '') : ''; });
        return obj;
      });
      setCsvData(parsed);
    };
  };

  const handleBulkImagesUpload = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) setBulkImages(Array.from(e.target.files)); };

  const executeBulkUpload = async () => {
    if (!confirm(`合計 ${csvData.length} 件のデータを作成します。よろしいですか？`)) return;
    setIsUploadingBulk(true); setBulkProgress({ current: 0, total: csvData.length });
    const getSettingNum = (key: string, def: number) => { const found = settings.find(s => s.key === key); return found && !isNaN(Number(found.value)) ? Number(found.value) : def; };
    const PRICE_TAX = getSettingNum('PRICE_TAX', 0.1);
    const PRICE_POSTAGE = getSettingNum('PRICE_POSTAGE', 380);
    const PRICE_ALBUM = getSettingNum('PRICE_ALBUM', 2500);
    const PRICE_ANIMATION = getSettingNum('PRICE_ANIMATION', 1000);

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const targetFileNames = row['画像ファイル名'] ? row['画像ファイル名'].split(/[|]/).map((n: string) => n.trim()) : [];
      const templateId = row['テンプレートID'];
      const itemType = row['種類'] || 'キーホルダー';
      const nfcUid = row['NFC_UID'];
      const animationType = row['アニメーション'] || 'none';

      const uploadFiles = targetFileNames.map((name: string) => bulkImages.find(f => f.name === name)).filter(Boolean);

      let subTotal = 1500 + PRICE_POSTAGE;
      if (uploadFiles.length > 1) subTotal += PRICE_ALBUM;
      if (animationType !== 'none') subTotal += PRICE_ANIMATION;

      const total = subTotal + Math.floor(subTotal * PRICE_TAX);
      const optionDetails = `【種類】${itemType}\n【画像】${templateId ? 'テンプレート' : 'アップロード'}\n【アニメーション】${animationType}\n【性別】${row['性別'] || ''}\n【年齢】${row['年齢'] || ''}\n【住所】〒${row['郵便番号'] || ''} ${row['住所'] || ''}\n【備考】${row['備考'] || ''}`;

      try {
        const hashId = uuidv4().replace(/-/g, '').substring(0, 16);
        const { data: order, error: orderError } = await supabase.from('orders').insert({
          customer_name: row['氏名'] || '名称未設定',
          email: row['メールアドレス'] || 'no-email@example.com',
          hash_id: hashId,
          nfc_uid: nfcUid || null,
          total_price: total,
          status: 'pending',
          client_id: row['クライアントID'] || 'bulk_upload',
          option_details: optionDetails.trim(),
          animation_type: animationType
        }).select().single();

        if (orderError) throw orderError;

        if (templateId) {
          let formattedId = templateId.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s: string) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).toUpperCase().trim();
          formattedId = formattedId.replace(/ー|−|_/g, '-');
          if (!formattedId.includes('-')) formattedId = formattedId.replace('T', 'T-');
          const processedFileName = `templates/${formattedId}.jpg`;
          await supabase.from('order_images').insert({ order_id: order.id, original_image_url: null, processed_image_url: processedFileName });
        } else if (uploadFiles.length > 0) {
          for (const file of uploadFiles as File[]) {
            const fileExt = file.name.split('.').pop();
            const processedFileName = `proc_bulk_${uuidv4()}.${fileExt}`;
            await supabase.storage.from('ar_images').upload(processedFileName, file);
            await supabase.from('order_images').insert({ order_id: order.id, original_image_url: null, processed_image_url: processedFileName });
          }
        }
      } catch (err) { console.error(`Row ${i + 1} Error:`, err); }
      setBulkProgress({ current: i + 1, total: csvData.length });
    }
    setIsUploadingBulk(false); alert('一括処理が完了しました！'); setCsvData([]); setBulkImages([]); fetchData();
  };

  const handleSaveMailTemplate = async () => {
    if (!mailTemplateName || !mailSubject || !mailBody) return alert('テンプレート名、件名、本文をすべて入力してください。');
    const key = `MAIL_TEMPLATE_${Date.now()}`;
    const value = JSON.stringify({ subject: mailSubject, body: mailBody });
    await supabase.from('system_settings').insert({ key, name: mailTemplateName, value });
    alert('テンプレートを保存しました。');
    fetchData();
    setMailTemplateName('');
  };

  const handleApplyTemplate = (key: string) => {
    const tmpl = emailTemplates.find(t => t.key === key);
    if (tmpl) {
      try {
        const parsed = JSON.parse(tmpl.value);
        setMailSubject(parsed.subject);
        setMailBody(parsed.body);
      } catch (e) {
        setMailBody(tmpl.value);
      }
    }
  };

  const handleExecuteMailDelivery = async () => {
    if (selectedOrderIds.length === 0) return alert('配信先のユーザーを選択してください。');
    if (!mailSubject || !mailBody) return alert('件名と本文を入力してください。');

    const confirmMsg = scheduledTime
      ? `${selectedOrderIds.length}件のユーザーに\n【${scheduledTime.replace('T', ' ')}】に配信予約しますか？`
      : `${selectedOrderIds.length}件のユーザーに\n【今すぐ】メールを配信しますか？`;

    if (!confirm(confirmMsg)) return;

    try {
      alert('配信リクエストが正常に処理されました！\n（※実際のメール送信にはバックエンドAPIの設定が必要です）');
      setSelectedOrderIds([]);
      setMailSubject('');
      setMailBody('');
      setScheduledTime('');
    } catch (err) {
      alert('エラーが発生しました。');
    }
  };

  const handleSelectAllOrders = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedOrderIds(orders.map(o => o.id));
    else setSelectedOrderIds([]);
  };

  const handleSelectOrder = (orderId: string) => {
    if (selectedOrderIds.includes(orderId)) setSelectedOrderIds(selectedOrderIds.filter(id => id !== orderId));
    else setSelectedOrderIds([...selectedOrderIds, orderId]);
  };

  // ==========================================================================
  // OEM提供先（クライアント）管理
  // ==========================================================================

  const handleAddClient = async () => {
    const clientIdInput = prompt('OEM提供先のID（半角英数字・ハイフン。埋め込みタグやURLで使用されます）を入力してください\n例: acme-corp');
    if (!clientIdInput) return;
    const slug = clientIdInput.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    if (!slug) return alert('無効なIDです。');
    const name = prompt('提供先の名称を入力してください');
    if (!name) return;
    const contactEmail = prompt('担当者メールアドレス（任意・空欄可）') || null;

    try {
      const { error } = await supabase.from('clients').insert({ client_id: slug, name, contact_email: contactEmail, status: 'active' });
      if (error) throw error;
      await supabase.from('client_form_config').insert({ client_id: slug });
      fetchData();
      alert(`OEM提供先「${name}」を登録しました。\nクライアントID: ${slug}`);
    } catch (err: any) {
      alert(err?.message?.includes('duplicate') ? 'このIDは既に使用されています。' : '登録に失敗しました。');
    }
  };

  const handleUpdateClientField = async (
    clientId: string,
    table: 'clients' | 'client_form_config',
    field: string,
    label: string,
    currentValue: string
  ) => {
    const newValue = prompt(`【${label}】の新しい値を入力してください`, currentValue || '');
    if (newValue === null) return;
    if (table === 'clients') {
      await supabase.from('clients').update({ [field]: newValue }).eq('client_id', clientId);
    } else {
      await supabase.from('client_form_config').upsert({ client_id: clientId, [field]: newValue }, { onConflict: 'client_id' });
    }
    fetchData();
  };

  const handleToggleClientStatus = async (clientId: string, current: string) => {
    const next = current === 'active' ? 'inactive' : 'active';
    await supabase.from('clients').update({ status: next }).eq('client_id', clientId);
    fetchData();
  };

  const handleDeleteClient = async (clientId: string, name: string) => {
    if (!confirm(`本当に「${name}」(OEM提供先)を削除しますか？\n※関連する料金設定・フォーム設定も全て削除されます。\n※既に発行済みの注文データは削除されません。`)) return;
    await supabase.from('clients').delete().eq('client_id', clientId);
    fetchData();
  };

  const handleToggleFormOption = async (clientId: string, field: string, currentValue: boolean) => {
    await supabase.from('client_form_config').upsert({ client_id: clientId, [field]: !currentValue }, { onConflict: 'client_id' });
    fetchData();
  };

  const handleUpdateClientAnimation = async (clientId: string, currentType: string) => {
    const currentLabel = ANIMATION_TYPES.find(t => t.key === (currentType || 'none'))?.label;
    const menu = ANIMATION_TYPES.map((t, idx) => `${idx + 1}: ${t.label}`).join('\n');
    const input = prompt(`このOEM提供先の初期アニメーション: ${currentLabel}\n\n変更する場合は以下の番号を入力してください:\n${menu}`, '');
    if (!input) return;
    const idx = parseInt(input) - 1;
    if (idx >= 0 && idx < ANIMATION_TYPES.length) {
      await supabase.from('client_form_config').upsert({ client_id: clientId, default_animation_type: ANIMATION_TYPES[idx].key }, { onConflict: 'client_id' });
      fetchData();
      alert(`初期アニメーションを「${ANIMATION_TYPES[idx].label}」に変更しました。`);
    } else {
      alert('無効な番号です。');
    }
  };

  const handleDeleteClientMarker = async (clientId: string) => {
    if (!confirm('デフォルトマーカーを削除しますか？')) return;
    const cfg = clientFormConfigMap[clientId];
    if (cfg?.default_marker_target_url) await supabase.storage.from('ar_images').remove([cfg.default_marker_target_url]).catch(() => {});
    if (cfg?.default_marker_mind_url) await supabase.storage.from('ar_images').remove([cfg.default_marker_mind_url]).catch(() => {});
    await supabase.from('client_form_config').update({
      default_marker_target_url: null,
      default_marker_mind_url: null,
      use_default_marker: false,
    }).eq('client_id', clientId);
    fetchData();
  };

  // クライアント専用の料金・設定の上書きを追加/編集する（キー未指定なら新規追加）
  const handleSetClientOverride = async (clientId: string, existingKey?: string, existingName?: string, existingValue?: string) => {
    const globalKeysList = settings.map(s => `${s.key} = ${s.value} (${s.name})`).join('\n');
    const key = existingKey || prompt(`上書きするキー名を入力してください。\n\n【現在のグローバル設定一覧】\n${globalKeysList}\n\n※このクライアント専用の新しい商品キー（PRODUCT_〜）を追加することも可能です。`);
    if (!key) return;
    const globalMatch = settings.find(s => s.key === key);
    const value = prompt(`「${key}」の、このクライアント専用の値を入力してください${globalMatch ? `\n（グローバル値: ${globalMatch.value}）` : ''}`, existingValue ?? globalMatch?.value ?? '');
    if (value === null || value === '') return;
    const name = existingName || globalMatch?.name || prompt('管理画面用の表示名を入力してください', key) || key;

    const { error } = await supabase.from('client_settings').upsert(
      { client_id: clientId, key, name, value },
      { onConflict: 'client_id,key' }
    );
    if (error) { alert('保存に失敗しました。'); return; }
    fetchData();
  };

  const handleDeleteClientOverride = async (clientId: string, key: string) => {
    if (!confirm(`「${key}」の個別設定を削除しますか？（削除後はグローバル設定の値が使われます）`)) return;
    await supabase.from('client_settings').delete().eq('client_id', clientId).eq('key', key);
    fetchData();
  };

  const buildEmbedTag = (id: string) =>
    id
      ? `<div id="ar-order-form-container"></div>\n<script src="https://app.kototama-ar.com/embed.js" id="ar-embed-script" data-client-id="${id}"></script>`
      : '※クライアントIDを入力すると、ここにタグが表示されます。';

  const generatedTag = buildEmbedTag(clientId);

  const filteredOrders = !orderClientFilter
    ? orders
    : orderClientFilter === '__direct__'
      ? orders.filter(o => !o.client_id || !clients.some(c => c.client_id === o.client_id))
      : orders.filter(o => o.client_id === orderClientFilter);

  return (
    <>
      <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/mind-ar@1.2.2/dist/mindar-image.prod.js" strategy="lazyOnload" />

      {showEmbedModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 animate-fade-in">
            <h3 className="text-xl font-bold mb-4 border-b pb-2 text-blue-900">🌐 ホームページへの埋め込みサンプル</h3>
            <p className="text-sm text-gray-600 mb-4">以下のHTMLコードをコピーして、あなたのホームページやLP内の「表示させたい場所」に貼り付けてください。</p>
            <div className="relative">
              <pre className="bg-gray-800 text-green-400 p-4 rounded-lg text-sm font-mono overflow-x-auto border border-gray-900">
{`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>ことたま 注文ページ</title>
</head>
<body style="background-color: #f3f4f6; padding: 20px;">

  <h1 style="text-align: center;">ご注文はこちらから</h1>

  <!-- ↓↓↓ ここからコピーして貼り付け ↓↓↓ -->
  ${generatedTag}
  <!-- ↑↑↑ ここまで ↑↑↑ -->

</body>
</html>`}
              </pre>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatedTag);
                  alert('埋め込みタグをコピーしました！');
                }}
                className="absolute top-2 right-2 bg-blue-500 hover:bg-blue-600 text-white font-bold px-4 py-2 rounded text-xs transition shadow"
              >
                タグだけをコピー
              </button>
            </div>
            <div className="mt-6 text-right">
              <button onClick={() => setShowEmbedModal(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2 rounded-lg font-bold transition">閉じる</button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-gray-50 p-8 text-gray-800 font-sans pb-24">
        {isCompiling && (
          <div className="fixed inset-0 bg-black/60 z-50 flex flex-col items-center justify-center text-white">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-green-500 mb-4"></div>
            <p className="text-xl font-bold">画像をAIで解析中...</p>
          </div>
        )}

        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-extrabold mb-8 text-gray-900 border-b pb-4">ことたま 管理ダッシュボード</h1>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleFileChange} />

          <div className="flex space-x-2 border-b-2 border-gray-200 mb-8 overflow-x-auto">
            <button onClick={() => setActiveTab('orders')} className={`px-6 py-3 font-bold rounded-t-lg transition whitespace-nowrap ${activeTab === 'orders' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>📦 注文管理</button>
            <button onClick={() => setActiveTab('images')} className={`px-6 py-3 font-bold rounded-t-lg transition whitespace-nowrap ${activeTab === 'images' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>🖼️ 画像・マーカー管理</button>
            <button onClick={() => setActiveTab('settings')} className={`px-6 py-3 font-bold rounded-t-lg transition whitespace-nowrap ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>⚙️ システム設定</button>
            <button onClick={() => setActiveTab('clients')} className={`px-6 py-3 font-bold rounded-t-lg transition whitespace-nowrap ${activeTab === 'clients' ? 'bg-purple-600 text-white shadow-lg transform -translate-y-1' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>🏢 OEM提供先管理</button>
            <button onClick={() => setActiveTab('bulk')} className={`px-6 py-3 font-bold rounded-t-lg transition whitespace-nowrap ${activeTab === 'bulk' ? 'bg-green-600 text-white shadow-lg transform -translate-y-1' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>📁 一括発注処理</button>
            <button onClick={() => setActiveTab('emails')} className={`px-6 py-3 font-bold rounded-t-lg transition whitespace-nowrap ${activeTab === 'emails' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>📧 メール配信</button>
          </div>

          {activeTab === 'orders' && (
            <div className="space-y-8 animate-fade-in">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4 border-b pb-4">
                  <h2 className="text-lg font-bold text-blue-900">🔗 クライアント用 埋め込みタグ生成</h2>
                  <button onClick={() => setShowEmbedModal(true)} className="text-sm bg-blue-50 text-blue-600 border border-blue-200 px-4 py-2 rounded-lg font-bold hover:bg-blue-100 transition shadow-sm">
                    💡 埋め込みサンプルを確認
                  </button>
                </div>
                <div className="flex gap-4 mb-4 items-center flex-wrap">
                  <select
                    className="border-2 border-gray-200 p-2 rounded-lg focus:border-blue-400 outline-none"
                    value={clients.some(c => c.client_id === clientId) ? clientId : ''}
                    onChange={(e) => setClientId(e.target.value)}
                  >
                    <option value="">-- 登録済みのOEM提供先から選択 --</option>
                    {clients.filter(c => c.status === 'active').map(c => (
                      <option key={c.client_id} value={c.client_id}>{c.name} ({c.client_id})</option>
                    ))}
                  </select>
                  <span className="text-gray-400 text-sm">または直接入力:</span>
                  <input type="text" placeholder="クライアントID" className="border-2 border-gray-200 p-2 rounded-lg w-64 focus:border-blue-400 outline-none" value={clientId} onChange={(e) => setClientId(e.target.value)} />
                </div>
                <div className="bg-gray-800 text-green-400 p-4 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap shadow-inner">{generatedTag}</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 bg-gray-50 border-b flex justify-between items-center flex-wrap gap-3">
                  <h2 className="font-bold text-gray-700">受注・顧客一覧</h2>
                  <div className="flex items-center gap-3">
                    <select value={orderClientFilter} onChange={(e) => setOrderClientFilter(e.target.value)} className="border p-2 rounded text-sm">
                      <option value="">すべてのOEM提供先</option>
                      <option value="__direct__">自社サイト（提供先なし）</option>
                      {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}
                    </select>
                    <span className="text-sm text-gray-500">全 {filteredOrders.length} 件</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm text-left">
                    <thead className="bg-white border-b">
                      <tr>
                        <th className="p-4 font-bold text-gray-600">受注日時 / ID</th>
                        <th className="p-4 font-bold text-gray-600">顧客名 / メール</th>
                        <th className="p-4 font-bold text-gray-600">OEM提供先</th>
                        <th className="p-4 font-bold text-gray-600 text-center">表示オブジェクト</th>
                        <th className="p-4 font-bold text-gray-600">オプション詳細</th>
                        <th className="p-4 font-bold text-gray-600">NFC / AR設定</th>
                        <th className="p-4 font-bold text-gray-600">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((order) => {
                        const imgData = order.order_images?.[0];
                        const imgPath = imgData ? (imgData.processed_image_url || imgData.original_image_url) : null;
                        const currentAnimLabel = ANIMATION_TYPES.find(t => t.key === (order.animation_type || 'none'))?.label;
                        const orderClient = clients.find(c => c.client_id === order.client_id);

                        return (
                        <tr key={order.id} className="border-b hover:bg-blue-50 transition">
                          <td className="p-4"><div className="font-bold">{new Date(order.created_at).toLocaleDateString()}</div><div className="text-xs text-gray-400 mt-1 font-mono">{order.hash_id?.substring(0,8)}...</div></td>
                          <td className="p-4"><div className="font-bold text-gray-800">{order.customer_name}</div><div className="text-gray-500 text-xs mt-1">{order.email}</div>{order.phone && <div className="text-gray-400 text-xs">{order.phone}</div>}</td>

                          <td className="p-4">
                            {orderClient ? (
                              <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2 py-1 rounded text-xs font-bold whitespace-nowrap">{orderClient.name}</span>
                            ) : (
                              <span className="text-gray-400 text-xs">自社サイト</span>
                            )}
                          </td>

                          <td className="p-4 text-center">
                            {imgPath ? (
                              <div className="flex flex-col items-center gap-2">
                                <img src={getImageUrl(imgPath)} alt="ARオブジェクト" className="w-16 h-16 object-contain bg-gray-100 rounded border border-gray-200" />
                                <button
                                  onClick={() => triggerFileInput(imgData.processed_image_url ? 'processed' : 'original', imgData.id, imgPath)}
                                  className="text-xs font-bold bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-3 py-1 rounded-full transition shadow-sm"
                                >
                                  🔄 差し替え
                                </button>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">未設定</span>
                            )}
                          </td>

                          <td className="p-4"><div className="text-gray-600 text-xs whitespace-pre-wrap bg-gray-50 p-2 rounded border max-w-xs overflow-auto max-h-24">{order.option_details || 'なし'}</div><div className="font-bold text-red-600 mt-2">合計: ¥{order.total_price?.toLocaleString() || 0}</div></td>

                          <td className="p-4">
                            <div className="flex flex-col gap-2 items-start">
                              <div className="flex items-center gap-2">
                                {order.nfc_uid ? <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-mono font-bold border border-green-200">{order.nfc_uid}</span> : <span className="text-gray-400 text-xs">未登録</span>}
                                <button onClick={() => handleUpdateNfcUid(order.id, order.nfc_uid)} className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded transition">更新</button>
                              </div>
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {order.ar_mode === 'mindar' ? <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded font-bold text-xs inline-block">MindAR</span> : <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-bold text-xs inline-block">Hiroマーカー</span>}
                                <span className={`px-2 py-1 rounded font-bold text-xs inline-block ${order.animation_type && order.animation_type !== 'none' ? 'bg-pink-100 text-pink-800' : 'bg-gray-100 text-gray-500'}`}>
                                  {currentAnimLabel}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="p-4 whitespace-nowrap">
                            <div className="flex flex-col gap-2">
                              <div className="flex gap-2">
                                <a href={`/ar?uid=${order.nfc_uid || order.hash_id}`} target="_blank" className="bg-blue-500 hover:bg-blue-600 text-white font-bold px-3 py-2 rounded-lg text-xs shadow transition">AR確認</a>
                                <button onClick={() => handleDeleteOrder(order.id, order.customer_name)} className="bg-red-100 hover:bg-red-200 text-red-700 font-bold px-3 py-2 rounded-lg text-xs shadow-sm transition">削除</button>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => handleUpdateScale(order.id, order.object_scale || 1.0)} className="flex-1 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-2 rounded-lg transition shadow-sm text-center">x{order.object_scale || 1.0}変更</button>
                                <button onClick={() => handleUpdateAnimation(order.id, order.animation_type || 'none')} className="flex-1 text-xs bg-pink-50 hover:bg-pink-100 border border-pink-200 text-pink-700 px-2 py-2 rounded-lg transition shadow-sm text-center">🎬 アニメ変更</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'images' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
              <div className="flex bg-gray-50 border-b overflow-x-auto">
                <button onClick={() => setActiveImageTab('processed')} className={`px-6 py-3 font-bold text-sm whitespace-nowrap transition ${activeImageTab === 'processed' ? 'border-b-4 border-blue-500 text-blue-700 bg-white' : 'text-gray-500 hover:bg-gray-100'}`}>浮かび上がる画像</button>
                <button onClick={() => setActiveImageTab('original')} className={`px-6 py-3 font-bold text-sm whitespace-nowrap transition ${activeImageTab === 'original' ? 'border-b-4 border-blue-500 text-blue-700 bg-white' : 'text-gray-500 hover:bg-gray-100'}`}>オリジナル画像</button>
                <button onClick={() => setActiveImageTab('targets')} className={`px-6 py-3 font-bold text-sm whitespace-nowrap transition ${activeImageTab === 'targets' ? 'border-b-4 border-green-500 text-green-700 bg-white' : 'text-gray-500 hover:bg-gray-100'}`}>🎯 MindARターゲット</button>
                <button onClick={() => setActiveImageTab('templates')} className={`px-6 py-3 font-bold text-sm whitespace-nowrap transition ${activeImageTab === 'templates' ? 'border-b-4 border-blue-500 text-blue-700 bg-white' : 'text-gray-500 hover:bg-gray-100'}`}>テンプレート一覧</button>
              </div>
              <div className="p-6">
                {activeImageTab === 'targets' && (
                  <>
                    <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-6 text-sm text-green-800">💡 <b>イメージトラッキング（MindAR）用のターゲット画像</b><br/>画像をアップロードすると、ブラウザが自動的にAR用のトラッキングデータ（.mind）を生成します。</div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm text-left"><thead className="bg-gray-100 border-b"><tr><th className="p-3">画像プレビュー</th><th className="p-3">顧客名</th><th className="p-3">.mind ファイル</th><th className="p-3 text-right">操作</th></tr></thead>
                        <tbody>
                          {orders.map((order) => (
                            <tr key={order.id} className="border-b hover:bg-gray-50">
                              <td className="p-3 w-32">{order.target_image_url ? <img src={getImageUrl(order.target_image_url)} alt="target" className="w-24 h-24 object-cover rounded border" /> : <div className="w-24 h-24 bg-gray-100 flex items-center justify-center text-xs text-gray-400">未設定</div>}</td>
                              <td className="p-3 font-bold">{order.customer_name} 様</td>
                              <td className="p-3 font-mono text-xs text-gray-500">{order.mind_file_url ? '✅ 生成済み' : '未生成'}</td>
                              <td className="p-3 text-right space-x-2"><button onClick={() => triggerFileInput('targets', order.id, order.target_image_url)} className="bg-green-100 text-green-700 font-bold px-3 py-2 rounded text-xs hover:bg-green-200">{order.target_image_url ? '変更して再生成' : 'ターゲット登録'}</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {(activeImageTab === 'processed' || activeImageTab === 'original') && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left"><thead className="bg-gray-100 border-b"><tr><th className="p-3 font-bold text-gray-600">プレビュー</th><th className="p-3 font-bold text-gray-600">顧客名</th><th className="p-3 font-bold text-gray-600">現在のパス (URL)</th><th className="p-3 font-bold text-gray-600 text-right">操作</th></tr></thead>
                      <tbody>
                        {orders.map((order) => {
                          const imgData = order.order_images?.[0];
                          if (!imgData) return null;
                          const path = activeImageTab === 'processed' ? imgData.processed_image_url : imgData.original_image_url;
                          if (!path) return null;
                          return (
                            <tr key={order.id} className="border-b hover:bg-gray-50">
                              <td className="p-3 w-32"><img src={getImageUrl(path)} alt="preview" className="w-24 h-24 object-contain bg-gray-200 rounded border" /></td>
                              <td className="p-3"><div className="font-bold">{order.customer_name} 様</div></td>
                              <td className="p-3 font-mono text-xs text-gray-500 break-all">{path}</td>
                              <td className="p-3 text-right space-x-2"><button onClick={() => triggerFileInput(activeImageTab, imgData.id, path)} className="bg-blue-100 text-blue-700 hover:bg-blue-200 font-bold px-3 py-2 rounded text-xs transition">変更</button><button onClick={() => handleDeleteImage(activeImageTab, imgData.id, path)} className="bg-red-50 text-red-600 hover:bg-red-100 font-bold px-3 py-2 rounded text-xs transition">削除</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {activeImageTab === 'templates' && (
                  <div>
                    <div className="mb-4 text-right"><button onClick={() => triggerFileInput('template')} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded shadow transition">＋ 新規テンプレート追加</button></div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm text-left"><thead className="bg-gray-100 border-b"><tr><th className="p-3 font-bold text-gray-600 w-32">プレビュー</th><th className="p-3 font-bold text-gray-600">ファイル名 (ID)</th><th className="p-3 font-bold text-gray-600 text-right">操作</th></tr></thead>
                        <tbody>
                          {templates.map((file) => (
                            <tr key={file.id} className="border-b hover:bg-gray-50">
                              <td className="p-3"><img src={getImageUrl(`templates/${file.name}`)} alt="preview" className="w-24 h-24 object-contain bg-gray-200 rounded border" /></td>
                              <td className="p-3 font-bold text-gray-700">{file.name}</td>
                              <td className="p-3 text-right space-x-2"><button onClick={() => triggerFileInput('template')} className="bg-blue-100 text-blue-700 hover:bg-blue-200 font-bold px-3 py-2 rounded text-xs transition">上書き</button><button onClick={() => handleDeleteImage('template', undefined, file.name)} className="bg-red-50 text-red-600 hover:bg-red-100 font-bold px-3 py-2 rounded text-xs transition">削除</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
              <div className="p-6 bg-rose-50 border-b flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h2 className="font-bold text-rose-900 text-lg">システム定数・各種設定（グローバル）</h2>
                  <p className="text-sm text-rose-700 mt-1">ここで変更・追加した値は、システム全体のデフォルト値として利用されます。OEM提供先ごとに金額や内容を変えたい場合は「🏢 OEM提供先管理」タブで個別に上書きできます。</p>
                </div>
                <button onClick={handleAddSetting} className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-5 py-2 rounded-lg shadow-sm transition whitespace-nowrap">＋ 新規設定を追加</button>
              </div>

              <div className="p-6 bg-white border-b border-gray-100">
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded text-sm text-blue-800">
                  <h4 className="font-bold mb-1">🛒 フォームに新しい商品（ラジオボタン）を追加するには？</h4>
                  <p>「＋ 新規設定を追加」ボタンを押し、キー名を <code className="bg-white px-1 text-blue-900 rounded border">PRODUCT_</code> から始まる名前にして、値を <code className="bg-white px-1 text-blue-900 rounded border">商品名,価格</code> の形式で登録してください。世界中のフォームに即座に新しい選択肢が追加されます。<br/>
                  （例）キー名：<code>PRODUCT_ACRYLIC</code> ／ 設定値：<code>アクリルスタンド,4500</code></p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-left">
                  <thead className="bg-white border-b"><tr><th className="p-4 font-bold text-gray-600 w-1/4">キー名（システム変数）</th><th className="p-4 font-bold text-gray-600 w-1/3">設定項目名</th><th className="p-4 font-bold text-gray-600">現在の値</th><th className="p-4 font-bold text-gray-600 text-right">操作</th></tr></thead>
                  <tbody>
                    {settings.map((setting) => (
                      <tr key={setting.key} className="border-b hover:bg-gray-50 transition">
                        <td className="p-4 font-mono text-xs text-gray-500 bg-gray-50">{setting.key}</td>
                        <td className="p-4 font-bold text-gray-700">{setting.name}</td>
                        <td className="p-4"><div className="bg-white border px-3 py-2 rounded text-gray-800 font-mono inline-block break-all">{setting.value}</div></td>
                        <td className="p-4 text-right space-x-2"><button onClick={() => handleUpdateSetting(setting.key, setting.name, setting.value)} className="bg-gray-800 hover:bg-gray-900 text-white font-bold px-3 py-2 rounded text-xs shadow transition">編集</button><button onClick={() => handleDeleteSetting(setting.key, setting.name)} className="bg-red-50 text-red-600 hover:bg-red-100 font-bold px-3 py-2 rounded text-xs transition">削除</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'clients' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center flex-wrap gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-purple-900">OEM提供先管理</h2>
                  <p className="text-sm text-gray-500 mt-1">提供先ごとに「料金」「デフォルトマーカー」「フォーム内容」を個別に設定できます。未設定の項目はグローバル設定がそのまま使われます。</p>
                </div>
                <button onClick={handleAddClient} className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-5 py-2 rounded-lg shadow-sm transition whitespace-nowrap">＋ 新規OEM提供先を追加</button>
              </div>

              {clients.length === 0 && (
                <div className="bg-white p-8 rounded-xl border text-center text-gray-400">まだOEM提供先が登録されていません。</div>
              )}

              {clients.map((c) => {
                const cfg = clientFormConfigMap[c.client_id] || { ...DEFAULT_CLIENT_FORM_CONFIG, client_id: c.client_id };
                const overrides = clientSettingsMap[c.client_id] || [];
                const isExpanded = expandedClientId === c.client_id;
                const embedTag = buildEmbedTag(c.client_id);
                const currentAnimLabel = ANIMATION_TYPES.find(t => t.key === (cfg.default_animation_type || 'none'))?.label;

                return (
                  <div key={c.client_id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-5 flex flex-wrap justify-between items-center gap-4 border-b">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-lg text-gray-800">{c.name}</h3>
                          <span className={`px-2 py-1 rounded text-xs font-bold ${c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>{c.status === 'active' ? '稼働中' : '停止中'}</span>
                        </div>
                        <p className="text-xs text-gray-400 font-mono mt-1">client_id: {c.client_id}</p>
                        {c.contact_email && <p className="text-xs text-gray-500 mt-1">担当: {c.contact_email}</p>}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => handleToggleClientStatus(c.client_id, c.status)} className={`text-xs font-bold px-3 py-2 rounded-lg transition shadow-sm ${c.status === 'active' ? 'bg-gray-200 hover:bg-gray-300 text-gray-700' : 'bg-green-100 hover:bg-green-200 text-green-700'}`}>{c.status === 'active' ? '停止する' : '再開する'}</button>
                        <button onClick={() => setExpandedClientId(isExpanded ? null : c.client_id)} className="text-xs font-bold bg-purple-100 hover:bg-purple-200 text-purple-700 px-3 py-2 rounded-lg transition shadow-sm">{isExpanded ? '詳細を閉じる ▲' : '詳細設定を開く ▼'}</button>
                        <button onClick={() => handleDeleteClient(c.client_id, c.name)} className="text-xs font-bold bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-lg transition">削除</button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-6 bg-gray-50 space-y-8">
                        {/* 基本情報 */}
                        <div>
                          <h4 className="font-bold text-gray-700 mb-3">📋 基本情報</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <button onClick={() => handleUpdateClientField(c.client_id, 'clients', 'name', '名称', c.name)} className="text-left bg-white border p-3 rounded-lg hover:border-purple-300 transition">
                              <span className="text-xs text-gray-400 block">名称（クリックで編集）</span>{c.name}
                            </button>
                            <button onClick={() => handleUpdateClientField(c.client_id, 'clients', 'contact_email', '担当者メールアドレス', c.contact_email || '')} className="text-left bg-white border p-3 rounded-lg hover:border-purple-300 transition">
                              <span className="text-xs text-gray-400 block">担当者メール（クリックで編集）</span>{c.contact_email || '未設定'}
                            </button>
                            <button onClick={() => handleUpdateClientField(c.client_id, 'clients', 'welcome_message', 'フォーム上部の案内文', c.welcome_message || '')} className="text-left bg-white border p-3 rounded-lg hover:border-purple-300 transition md:col-span-2">
                              <span className="text-xs text-gray-400 block">フォーム上部の案内文（クリックで編集）</span>{c.welcome_message || '未設定'}
                            </button>
                            <button onClick={() => handleUpdateClientField(c.client_id, 'client_form_config', 'custom_note', '注文ボタン付近の補足メモ', cfg.custom_note || '')} className="text-left bg-white border p-3 rounded-lg hover:border-purple-300 transition md:col-span-2">
                              <span className="text-xs text-gray-400 block">補足メモ（クリックで編集）</span>{cfg.custom_note || '未設定'}
                            </button>
                          </div>
                        </div>

                        {/* フォーム内容 */}
                        <div>
                          <h4 className="font-bold text-gray-700 mb-3">📝 フォーム内容の設定</h4>
                          <div className="flex flex-wrap gap-2">
                            <button onClick={() => handleToggleFormOption(c.client_id, 'show_charm_option', cfg.show_charm_option)} className={`text-xs font-bold px-3 py-2 rounded-lg border transition ${cfg.show_charm_option ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-300'}`}>リボンチャーム表示: {cfg.show_charm_option ? 'ON' : 'OFF'}</button>
                            <button onClick={() => handleToggleFormOption(c.client_id, 'show_key_ring_option', cfg.show_key_ring_option)} className={`text-xs font-bold px-3 py-2 rounded-lg border transition ${cfg.show_key_ring_option ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-300'}`}>キーホルダー表示: {cfg.show_key_ring_option ? 'ON' : 'OFF'}</button>
                            <button onClick={() => handleToggleFormOption(c.client_id, 'require_phone', cfg.require_phone)} className={`text-xs font-bold px-3 py-2 rounded-lg border transition ${cfg.require_phone ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-300'}`}>電話番号を必須にする: {cfg.require_phone ? 'ON' : 'OFF'}</button>
                            <button onClick={() => handleToggleFormOption(c.client_id, 'allow_own_marker_upload', cfg.allow_own_marker_upload)} className={`text-xs font-bold px-3 py-2 rounded-lg border transition ${cfg.allow_own_marker_upload ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-300'}`}>独自マーカーの任意アップロード許可: {cfg.allow_own_marker_upload ? 'ON' : 'OFF'}</button>
                            <button onClick={() => handleUpdateClientAnimation(c.client_id, cfg.default_animation_type)} className="text-xs font-bold px-3 py-2 rounded-lg border bg-pink-50 border-pink-200 text-pink-700">初期アニメーション: {currentAnimLabel}</button>
                          </div>
                        </div>

                        {/* デフォルトマーカー */}
                        <div>
                          <h4 className="font-bold text-gray-700 mb-3">🎯 デフォルトマーカー（共通ARトラッキング画像）</h4>
                          <div className="bg-white border rounded-lg p-4 flex items-center gap-4 flex-wrap">
                            {cfg.default_marker_target_url ? (
                              <img src={getImageUrl(cfg.default_marker_target_url)} alt="default marker" className="w-20 h-20 object-contain bg-gray-100 rounded border" />
                            ) : (
                              <div className="w-20 h-20 bg-gray-100 flex items-center justify-center text-xs text-gray-400 rounded border">未設定</div>
                            )}
                            <div className="text-sm text-gray-500 flex-1 min-w-[200px]">
                              このOEM提供先の全ユーザー共通で使用するARマーカーです。「全ユーザーに適用」をONにすると、ユーザーは自分でトラッキング画像をアップロードする必要がなくなります。
                            </div>
                            <div className="flex flex-col gap-2">
                              <button onClick={() => triggerFileInput('client_marker', c.client_id)} className="bg-green-100 hover:bg-green-200 text-green-700 font-bold px-3 py-2 rounded text-xs transition">{cfg.default_marker_target_url ? '再登録する' : 'マーカーを登録'}</button>
                              {cfg.default_marker_target_url && <button onClick={() => handleDeleteClientMarker(c.client_id)} className="bg-red-50 hover:bg-red-100 text-red-600 font-bold px-3 py-2 rounded text-xs transition">削除</button>}
                              <button onClick={() => handleToggleFormOption(c.client_id, 'use_default_marker', cfg.use_default_marker)} disabled={!cfg.default_marker_target_url} className={`font-bold px-3 py-2 rounded text-xs transition disabled:opacity-40 ${cfg.use_default_marker ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-600'}`}>{cfg.use_default_marker ? '✅ 全ユーザーに強制適用中' : 'このマーカーを全ユーザーに適用'}</button>
                            </div>
                          </div>
                        </div>

                        {/* 料金設定 */}
                        <div>
                          <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                            <h4 className="font-bold text-gray-700">💰 このクライアント専用の料金・設定</h4>
                            <button onClick={() => handleSetClientOverride(c.client_id)} className="text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-lg transition">＋ 上書き設定を追加/編集</button>
                          </div>
                          {overrides.length === 0 ? (
                            <p className="text-sm text-gray-400 bg-white border rounded-lg p-4">個別設定なし（グローバル設定の料金がそのまま適用されます）</p>
                          ) : (
                            <div className="overflow-x-auto bg-white border rounded-lg">
                              <table className="min-w-full text-sm text-left">
                                <thead className="bg-gray-100 border-b"><tr><th className="p-3">キー</th><th className="p-3">項目名</th><th className="p-3">値</th><th className="p-3 text-right">操作</th></tr></thead>
                                <tbody>
                                  {overrides.map((ov: any) => (
                                    <tr key={ov.key} className="border-b">
                                      <td className="p-3 font-mono text-xs text-gray-500">{ov.key}</td>
                                      <td className="p-3 font-bold">{ov.name}</td>
                                      <td className="p-3 font-mono">{ov.value}</td>
                                      <td className="p-3 text-right space-x-2">
                                        <button onClick={() => handleSetClientOverride(c.client_id, ov.key, ov.name, ov.value)} className="bg-gray-800 hover:bg-gray-900 text-white font-bold px-3 py-1.5 rounded text-xs transition">編集</button>
                                        <button onClick={() => handleDeleteClientOverride(c.client_id, ov.key)} className="bg-red-50 text-red-600 hover:bg-red-100 font-bold px-3 py-1.5 rounded text-xs transition">削除</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* 埋め込みタグ */}
                        <div>
                          <h4 className="font-bold text-gray-700 mb-3">🔗 このOEM提供先用の埋め込みタグ</h4>
                          <div className="bg-gray-800 text-green-400 p-4 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap shadow-inner">{embedTag}</div>
                          <button onClick={() => { navigator.clipboard.writeText(embedTag); alert('コピーしました'); }} className="mt-2 text-xs bg-blue-50 text-blue-600 border border-blue-200 px-4 py-2 rounded-lg font-bold hover:bg-blue-100 transition">タグをコピー</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'bulk' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-green-800">CSVと画像フォルダによる一括登録</h2>
                  <button onClick={handleDownloadSampleCsv} className="bg-white border-2 border-green-500 text-green-600 font-bold px-4 py-2 rounded-lg shadow-sm hover:bg-green-50 transition">📥 サンプルCSVをダウンロード</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  <div className="bg-green-50 p-6 rounded-lg border border-green-100">
                    <h3 className="font-bold text-green-900 mb-2">Step 1: CSVファイルの読み込み</h3>
                    <div className="mb-3 text-sm">
                      <label className="mr-4"><input type="radio" name="enc" checked={csvEncoding === 'UTF-8'} onChange={() => setCsvEncoding('UTF-8')} /> UTF-8（標準）</label>
                      <label><input type="radio" name="enc" checked={csvEncoding === 'Shift_JIS'} onChange={() => setCsvEncoding('Shift_JIS')} /> Shift-JIS</label>
                    </div>
                    <input type="file" accept=".csv" onChange={handleCsvUpload} className="w-full bg-white border p-2 rounded" />
                    <p className="text-xs text-green-700 mt-2">※CSVの「クライアントID」列にOEM提供先の client_id を入力すると、その提供先の注文として登録されます。</p>
                  </div>
                  <div className="bg-green-50 p-6 rounded-lg border border-green-100">
                    <h3 className="font-bold text-green-900 mb-2">Step 2: 画像ファイル群の読み込み</h3>
                    <p className="text-xs text-green-700 mb-2">※アルバムの場合は対象画像をすべて選択してください。</p>
                    <input type="file" multiple accept="image/*" onChange={handleBulkImagesUpload} className="w-full bg-white border p-2 rounded" />
                  </div>
                </div>
                {csvData.length > 0 && (
                  <div className="mt-8 border-t pt-8">
                    <h3 className="font-bold text-lg mb-4">マッチングプレビュー（全 {csvData.length} 件）</h3>
                    <div className="max-h-64 overflow-y-auto mb-6 bg-gray-50 border rounded">
                      <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="p-3 border-b">氏名</th>
                            <th className="p-3 border-b">画像ファイル名</th>
                            <th className="p-3 border-b">演出</th>
                            <th className="p-3 border-b text-center">ステータス</th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvData.map((row, idx) => {
                            const targetNames = row['画像ファイル名'] ? row['画像ファイル名'].split(/[|]/).map((n: string) => n.trim()) : [];
                            const isTemplate = !!row['テンプレートID'];
                            const animation = row['アニメーション'];

                            let foundFilesCount = 0;
                            if (targetNames.length > 0) {
                              targetNames.forEach((name: string) => {
                                if (bulkImages.some(f => f.name === name)) foundFilesCount++;
                              });
                            }

                            let statusHtml = <span className="text-gray-400">-</span>;
                            if (isTemplate) {
                              statusHtml = <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold">テンプレート</span>;
                            } else if (targetNames.length > 0) {
                              if (foundFilesCount === targetNames.length) {
                                statusHtml = <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold">✅ 一致 ({foundFilesCount}枚)</span>;
                              } else {
                                statusHtml = <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-bold">❌ 画像不足 ({foundFilesCount}/{targetNames.length})</span>;
                              }
                            }
                            return (
                              <tr key={idx} className="border-b">
                                <td className="p-2">{row['氏名'] || '無名'}</td>
                                <td className="p-2 font-mono text-xs max-w-xs truncate">{row['画像ファイル名'] || '-'}</td>
                                <td className="p-2 font-mono text-xs">{ANIMATION_TYPES.find(t => t.key === (animation || 'none'))?.label || 'なし'}</td>
                                <td className="p-2 text-center">{statusHtml}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {isUploadingBulk ? (
                      <div className="bg-green-100 border border-green-300 p-6 rounded-lg text-center">
                        <div className="text-green-800 font-bold mb-2 text-lg">アップロード処理中... ({bulkProgress.current} / {bulkProgress.total})</div>
                        <div className="w-full bg-white rounded-full h-4 overflow-hidden border"><div className="bg-green-500 h-4 transition-all duration-300" style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}></div></div>
                      </div>
                    ) : (
                      <button onClick={executeBulkUpload} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl text-lg shadow-lg transition">▶ 全 {csvData.length} 件のデータと画像をアップロード</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'emails' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
              <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold mb-4 text-indigo-900 border-b pb-2">✉️ メール作成</h2>

                <div className="mb-4">
                  <label className="block text-sm font-bold text-gray-700 mb-1">テンプレート読み込み</label>
                  <select
                    onChange={(e) => handleApplyTemplate(e.target.value)}
                    className="w-full border p-2 rounded focus:outline-none focus:border-indigo-500 bg-gray-50"
                  >
                    <option value="">-- テンプレートを選択 --</option>
                    {emailTemplates.map(tmpl => (
                      <option key={tmpl.key} value={tmpl.key}>{tmpl.name}</option>
                    ))}
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-bold text-gray-700 mb-1">件名</label>
                  <input
                    type="text"
                    value={mailSubject}
                    onChange={(e) => setMailSubject(e.target.value)}
                    placeholder="【重要】ご案内"
                    className="w-full border p-2 rounded focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-bold text-gray-700 mb-1">本文</label>
                  <textarea
                    rows={8}
                    value={mailBody}
                    onChange={(e) => setMailBody(e.target.value)}
                    placeholder="メール本文を入力してください。"
                    className="w-full border p-2 rounded focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="mb-6 p-4 bg-indigo-50 rounded border border-indigo-100">
                  <label className="block text-sm font-bold text-indigo-900 mb-1">📅 配信日時 (空欄で即時配信)</label>
                  <input
                    type="datetime-local"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full border p-2 rounded focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  onClick={handleExecuteMailDelivery}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg shadow transition mb-4"
                >
                  ▶ 選択したユーザーへ配信
                </button>

                <hr className="my-6 border-gray-200" />

                <h3 className="text-sm font-bold text-gray-600 mb-2">現在の内容をテンプレートとして保存</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={mailTemplateName}
                    onChange={(e) => setMailTemplateName(e.target.value)}
                    placeholder="テンプレート名"
                    className="flex-1 border p-2 rounded text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <button onClick={handleSaveMailTemplate} className="bg-gray-800 text-white px-4 py-2 rounded text-sm hover:bg-gray-900 transition">保存</button>
                </div>
              </div>

              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[800px]">
                <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                  <div>
                    <h2 className="font-bold text-gray-700 text-lg">👥 配信対象ユーザー選択</h2>
                    <p className="text-sm text-gray-500">選択中: <span className="font-bold text-indigo-600">{selectedOrderIds.length}</span> 人</p>
                  </div>
                </div>

                <div className="overflow-y-auto flex-1">
                  <table className="min-w-full text-sm text-left">
                    <thead className="bg-white border-b sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="p-3 text-center w-12">
                          <input
                            type="checkbox"
                            onChange={handleSelectAllOrders}
                            checked={orders.length > 0 && selectedOrderIds.length === orders.length}
                            className="w-4 h-4 cursor-pointer"
                          />
                        </th>
                        <th className="p-3 font-bold text-gray-600">顧客名</th>
                        <th className="p-3 font-bold text-gray-600">メールアドレス</th>
                        <th className="p-3 font-bold text-gray-600">受注日</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => (
                        <tr key={order.id} className={`border-b transition cursor-pointer hover:bg-indigo-50 ${selectedOrderIds.includes(order.id) ? 'bg-indigo-50' : ''}`} onClick={() => handleSelectOrder(order.id)}>
                          <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedOrderIds.includes(order.id)}
                              onChange={() => handleSelectOrder(order.id)}
                              className="w-4 h-4 cursor-pointer"
                            />
                          </td>
                          <td className="p-3 font-bold text-gray-800">{order.customer_name}</td>
                          <td className="p-3 text-gray-500">{order.email}</td>
                          <td className="p-3 text-gray-500">{new Date(order.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                      {orders.length === 0 && (
                        <tr><td colSpan={4} className="p-8 text-center text-gray-400">ユーザーが存在しません</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
