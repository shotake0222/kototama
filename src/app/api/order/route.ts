import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { computeDirectOrderTotal } from '@/utils/pricing';

// 🔒 セキュリティ修正（Phase 0）:
// これまで自社サイトのメイン注文導線（OrderForm.tsx）は、ブラウザから直接
// Supabaseの orders / order_images テーブルに insert し、金額もブラウザ側で
// 計算した値をそのまま書き込んでいた。サーバー側の検証が一切存在せず、
// 任意の金額・任意のclient_id・任意のストレージパスで注文を作成できてしまう
// 状態だったため、/api/embed-order と同じ「サーバーが金額とデータを検証してから
// DBに書き込む」パターンに揃えた。OrderForm.tsx 側の見た目・操作感は変えていない
// （このAPIにPOSTするように内部実装を差し替えただけ）。
//
// また、これまで OrderForm.tsx は order_images に "image_url" という列で
// insert していたが、/api/embed-order や管理画面が使う "processed_image_url" /
// "original_image_url" と列名が食い違っていた（/ar ページはこの2列しか見ないため、
// 自社サイト経由の注文でARが正しく表示されない可能性があった）。このAPIでは
// 他の注文経路と同じ列名で保存する。
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const DEFAULT_FORM_CONFIG = {
  show_charm_option: true,
  show_key_ring_option: true,
  require_phone: false,
  allow_own_marker_upload: true,
  use_default_marker: false,
  default_marker_target_url: null as string | null,
  default_marker_mind_url: null as string | null,
  default_animation_type: 'none',
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const customerName = (formData.get('customerName') as string) || '';
    const email = (formData.get('email') as string) || '';
    const phone = (formData.get('phone') as string) || '';
    const clientId = (formData.get('clientId') as string) || null;
    const hasCharm = formData.get('hasCharm') === 'true';
    const hasKeyRing = formData.get('hasKeyRing') === 'true';

    const originalFile = formData.get('originalFile') as File | null;
    const trackingFile = formData.get('trackingFile') as File | null;
    const mindFile = formData.get('mindFile') as File | null;

    if (!customerName || !email) {
      return NextResponse.json({ success: false, error: '氏名・メールアドレスは必須です。' }, { status: 400 });
    }
    if (!originalFile) {
      return NextResponse.json({ success: false, error: '画像をアップロードしてください。' }, { status: 400 });
    }

    // ==========================================
    // 1. OEM提供先の解決（clientIdがある場合）。
    //    フォームが「利用不可」と判定すべき状態かどうかを、ここでも
    //    サーバー側で必ず確認する（以前はブラウザ側の判定のみだった）。
    // ==========================================
    let formConfig = { ...DEFAULT_FORM_CONFIG };
    if (clientId) {
      const { data: clientRow } = await supabase
        .from('clients')
        .select('client_id, status')
        .eq('client_id', clientId)
        .maybeSingle();

      if (!clientRow || clientRow.status !== 'active') {
        return NextResponse.json({ success: false, error: 'このフォームは現在ご利用いただけません。' }, { status: 403 });
      }

      const { data: cfgRow } = await supabase
        .from('client_form_config')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();
      if (cfgRow) formConfig = { ...DEFAULT_FORM_CONFIG, ...cfgRow };
    }

    if (formConfig.require_phone && !phone.trim()) {
      return NextResponse.json({ success: false, error: '電話番号を入力してください。' }, { status: 400 });
    }

    // ==========================================
    // 2. 金額の再計算（クライアントから金額を受け取らない）
    // 🐛 バグ修正（デバッグフェーズ）: OrderForm.tsx（ブラウザ側）は表示金額の計算時に
    // system_settings に client_settings（OEM提供先ごとの料金上書き）をマージしているが、
    // ここではこれまで system_settings のみを見ており、サーバーが再計算する正規金額に
    // OEM提供先の料金上書きが一切反映されていなかった。これだとOEM提供先ごとに
    // カスタム料金を設定しても、画面には反映されて見える一方で実際の請求額は
    // 常にグローバル料金になってしまう（表示と実際の請求が食い違う）。
    // OrderForm.tsx と同じ優先順位（clientの上書きが勝つ）でマージしてから計算する。
    // ==========================================
    const { data: globalSettingsRows } = await supabase.from('system_settings').select('key, value');
    const settingsMap = new Map<string, string>();
    (globalSettingsRows || []).forEach((row: any) => settingsMap.set(row.key, row.value));

    if (clientId) {
      const { data: overrideRows } = await supabase
        .from('client_settings')
        .select('key, value')
        .eq('client_id', clientId);
      (overrideRows || []).forEach((row: any) => settingsMap.set(row.key, row.value));
    }

    const settingsRows = Array.from(settingsMap.entries()).map(([key, value]) => ({ key, value }));
    const pricing = computeDirectOrderTotal(settingsRows, { hasCharm, hasKeyRing });
    const totalPrice = pricing.total;

    // ==========================================
    // 3. ARトラッキングマーカーの決定（OrderForm.tsxと同じ優先順位。
    //    ただしuse_default_markerの強制適用など、判断そのものをサーバー側で行う）
    // ==========================================
    const hashId = uuidv4().replace(/-/g, '').substring(0, 16);
    let arMode: 'mindar' | 'hiro' = 'hiro';
    let targetImageUrl: string | null = null;
    let mindFileUrl: string | null = null;

    if (formConfig.use_default_marker && formConfig.default_marker_target_url && formConfig.default_marker_mind_url) {
      arMode = 'mindar';
      targetImageUrl = formConfig.default_marker_target_url;
      mindFileUrl = formConfig.default_marker_mind_url;
    } else if (formConfig.allow_own_marker_upload && trackingFile && mindFile) {
      const trackingExt = trackingFile.name.split('.').pop() || 'jpg';
      const trackingImgPath = `targets/${hashId}.${trackingExt}`;
      const trackingMindPath = `minds/${hashId}.mind`;
      await supabase.storage.from('ar_images').upload(trackingImgPath, trackingFile);
      await supabase.storage.from('ar_images').upload(trackingMindPath, mindFile);
      arMode = 'mindar';
      targetImageUrl = trackingImgPath;
      mindFileUrl = trackingMindPath;
    }

    // ==========================================
    // 4. メイン画像のアップロード
    // ==========================================
    const fileExt = originalFile.name.split('.').pop() || 'jpg';
    const fileName = `${hashId}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('ar_images').upload(fileName, originalFile);
    if (uploadError) throw uploadError;

    // ==========================================
    // 5. 注文レコードの作成
    // ==========================================
    const optionDetails = [hasCharm ? 'リボンチャーム' : null, hasKeyRing ? 'キーホルダー' : null]
      .filter(Boolean)
      .join(' / ') || null;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        hash_id: hashId,
        customer_name: customerName,
        email,
        phone: formConfig.require_phone ? phone : null,
        total_price: totalPrice,
        status: 'pending',
        client_id: clientId,
        ar_mode: arMode,
        target_image_url: targetImageUrl,
        mind_file_url: mindFileUrl,
        animation_type: formConfig.default_animation_type || 'none',
        option_details: optionDetails,
      })
      .select()
      .single();
    if (orderError) throw orderError;

    // 🔧 列名の食い違い修正: 以前の実装は image_url という存在しない想定の列に
    // 保存していた。/ar ページや管理画面が読むのは processed_image_url /
    // original_image_url なので、他の注文経路と同じ形で保存する。
    const { error: imageError } = await supabase.from('order_images').insert({
      order_id: order.id,
      original_image_url: fileName,
      processed_image_url: fileName,
    });
    if (imageError) throw imageError;

    // ==========================================
    // 6. サンクスメール送信（既存の /api/send-mail をそのまま利用）
    // ==========================================
    try {
      const origin = request.headers.get('origin') || new URL(request.url).origin;
      await fetch(`${origin}/api/send-mail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      });
    } catch (mailErr) {
      console.error('send-mail call failed:', mailErr);
      // メール送信の失敗で注文自体は失敗させない（他の注文経路と同じ方針）
    }

    return NextResponse.json({ success: true, hashId, totalPrice });
  } catch (error: any) {
    console.error('Order API Error:', error);
    return NextResponse.json({ success: false, error: error.message || '不明なエラーが発生しました。' }, { status: 500 });
  }
}
