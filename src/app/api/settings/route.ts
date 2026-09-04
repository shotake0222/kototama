import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// 🔒 セキュリティ修正（Phase 0）: このエンドポイントは埋め込みフォーム（embed.js）が
// 認証なしで呼び出す完全公開のAPI。以前は system_settings テーブルの全行を
// フィルタなしで返しており、embed.js が実際に使うのは PRICE_*/PRODUCT_* だけにも
// かかわらず、同じテーブルに保存されている振込先の銀行名・支店名・口座番号
// （BANK_NAME / BANK_BRANCH / BANK_NUMBER / BANK_USER_NAME）まで誰でも取得できる
// 状態だった。埋め込みフォームが必要とするキーだけに絞って返すようにする。
const PUBLIC_SETTINGS_PREFIXES = ['PRICE_', 'PRODUCT_'];

export async function GET() {
  try {
    const { data, error } = await supabase.from('system_settings').select('key, value');
    if (error) throw error;

    // [{key: 'PRICE_CHARM', value: '2800'}] を { PRICE_CHARM: 2800 } の形式に変換
    const settings: Record<string, string | number> = {};
    data
      .filter((item) => PUBLIC_SETTINGS_PREFIXES.some((prefix) => item.key.startsWith(prefix)))
      .forEach((item) => {
        // 数値に変換できるものは数値にする
        const numValue = Number(item.value);
        settings[item.key] = isNaN(numValue) ? item.value : numValue;
      });

    return NextResponse.json(settings, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: '設定の取得に失敗しました' }, { status: 500, headers: corsHeaders });
  }
}