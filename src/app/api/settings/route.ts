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

export async function GET() {
  try {
    const { data, error } = await supabase.from('system_settings').select('key, value');
    if (error) throw error;

    // [{key: 'PRICE_CHARM', value: '2800'}] を { PRICE_CHARM: 2800 } の形式に変換
    const settings: Record<string, string | number> = {};
    data.forEach(item => {
      // 数値に変換できるものは数値にする
      const numValue = Number(item.value);
      settings[item.key] = isNaN(numValue) ? item.value : numValue;
    });

    return NextResponse.json(settings, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: '設定の取得に失敗しました' }, { status: 500, headers: corsHeaders });
  }
}