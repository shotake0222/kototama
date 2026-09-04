// サーバー側で信頼できる金額を再計算するための共通ロジック。
//
// 背景: これまで /api/embed-order は、ブラウザ（embed.js）が計算した totalPrice を
// そのまま信頼して orders.total_price に保存していた。また自社サイトのメイン導線
// （OrderForm.tsx）に至っては、ブラウザから直接 Supabase に金額込みで insert して
// おり、サーバー側の検証が一切存在しなかった。
//
// ここでは「system_settings（グローバル設定）から、正規の金額をサーバー側だけで
// 計算し直す」ロジックを1箇所にまとめる。クライアントから送られてくる金額表示用の
// 値はUI表示にのみ使い、実際にDBへ保存する金額は必ずこのモジュールの計算結果を
// 使うこと。
//
// 注意: client_settings（OEM提供先ごとの料金上書き）は、現状 embed.js 側が
// /api/settings 呼び出し時に clientId を渡していないため、実際の注文フォームの
// 金額計算には反映されていない（管理画面・OEMポータルにはこの上書きを編集する
// UIがあるが、画面表示上は機能していても実際の注文には影響しない状態）。
// この関数もその現状の挙動に合わせて、あえて system_settings のみを見ている。
// クライアント別料金を本当に有効化する場合は、embed.js 側の /api/settings 呼び出しに
// clientId を渡す変更とセットで、この関数にも client_settings のマージ処理を
// 追加する必要がある（Phase 0のスコープ外として今回は見送っている）。

export type SettingsRow = { key: string; value: string };

export type EmbedFormInput = {
  itemType: string; // 例: 'キーホルダー' / 'リボンチャーム' （商品名で照合）
  arMode: 'mindar' | 'hiro';
  imageType: 'アップロード' | 'テンプレート';
  displayOption: 'single' | 'album';
  isAnimated: boolean;
};

export type PricingBreakdown = {
  basePrice: number;
  optionPrice: number;
  postage: number;
  tax: number;
  total: number;
};

const DEFAULT_EMBED_SETTINGS = {
  PRICE_TEMPLATE: 500,
  PRICE_MIND_AR: 3000,
  PRICE_ANIMATION: 1000,
  PRICE_ALBUM: 2500,
  PRICE_TAX: 0.1,
  PRICE_POSTAGE: 380,
  PRICE_KEY_RING: 1500,
  PRICE_CHARM: 2800,
};

/**
 * embed.js（OEM埋め込みフォーム）と全く同じロジックで、商品リストと
 * 設定値マップを system_settings から組み立てる。embed.js 側の
 * ロジックを変更したときは、必ずこちらも合わせて変更すること。
 */
function buildEmbedProductsAndSettings(settingsRows: SettingsRow[]) {
  const s: Record<string, number> = { ...DEFAULT_EMBED_SETTINGS };
  const customProducts: { name: string; price: number }[] = [];

  for (const row of settingsRows) {
    if (row.key.startsWith('PRODUCT_')) {
      const parts = String(row.value).split(',');
      if (parts.length >= 2) {
        customProducts.push({ name: parts[0].trim(), price: Number(parts[1].trim()) || 0 });
      }
    } else {
      const num = Number(row.value);
      if (!isNaN(num)) s[row.key] = num;
    }
  }

  const products = customProducts.length > 0
    ? customProducts
    : [
        { name: 'キーホルダー', price: s.PRICE_KEY_RING },
        { name: 'リボンチャーム', price: s.PRICE_CHARM },
      ];

  return { s, products };
}

/**
 * embed.js から送られてくる注文（/api/embed-order）の正規金額を、
 * クライアントを一切信用せずサーバー側だけで計算する。
 */
export function computeEmbedOrderTotal(settingsRows: SettingsRow[], input: EmbedFormInput): PricingBreakdown {
  const { s, products } = buildEmbedProductsAndSettings(settingsRows);

  const basePrice = products.find((p) => p.name === input.itemType)?.price ?? 0;
  const optMindAr = input.arMode === 'mindar' ? s.PRICE_MIND_AR : 0;
  const optTemplate = input.imageType === 'テンプレート' ? s.PRICE_TEMPLATE : 0;
  const optAlbum = input.imageType === 'アップロード' && input.displayOption === 'album' ? s.PRICE_ALBUM : 0;
  const optAnimation = input.imageType === 'アップロード' && input.isAnimated ? s.PRICE_ANIMATION : 0;

  const optionPrice = optMindAr + optTemplate + optAlbum + optAnimation;
  const postage = s.PRICE_POSTAGE;
  const subtotal = basePrice + optionPrice + postage;
  const tax = Math.floor(subtotal * s.PRICE_TAX);
  const total = subtotal + tax;

  return { basePrice, optionPrice, postage, tax, total };
}

export type DirectFormInput = {
  hasCharm: boolean;
  hasKeyRing: boolean;
};

/**
 * 自社サイトのメイン注文フォーム（OrderForm.tsx → /api/order）の
 * 正規金額を計算する。OrderForm.tsx の合計金額useEffectと同じロジック。
 */
export function computeDirectOrderTotal(settingsRows: SettingsRow[], input: DirectFormInput): PricingBreakdown {
  const map: Record<string, string> = {};
  settingsRows.forEach((row) => { map[row.key] = row.value; });

  const basePrice = parseInt(map['PRICE_TEMPLATE'] || '0', 10) || 0;
  const charmPrice = input.hasCharm ? (parseInt(map['PRICE_CHARM'] || '0', 10) || 0) : 0;
  const keyRingPrice = input.hasKeyRing ? (parseInt(map['PRICE_KEY_RING'] || '0', 10) || 0) : 0;
  const postage = parseInt(map['PRICE_POSTAGE'] || '0', 10) || 0;
  const taxRate = parseFloat(map['PRICE_TAX'] || '0') || 0;

  const optionPrice = charmPrice + keyRingPrice;
  const subtotal = basePrice + optionPrice;
  const tax = Math.floor(subtotal * taxRate);
  const total = subtotal + tax + postage;

  return { basePrice, optionPrice, postage, tax, total };
}
