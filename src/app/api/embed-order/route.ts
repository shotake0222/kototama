import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const customerName = formData.get('customerName') as string;
    const email = formData.get('email') as string;
    const file = formData.get('file') as File;
    const clientId = formData.get('clientId') as string || 'unknown';
    const optionDetails = formData.get('optionDetails') as string;
    const totalPrice = parseInt(formData.get('totalPrice') as string || '0', 10);
    
    if (!customerName || !email || !file) {
      return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400, headers: corsHeaders });
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from('ar_images')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const hashId = uuidv4().replace(/-/g, '').substring(0, 16);
    
    // DBへの保存に client_id, option_details, total_price を追加
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name: customerName,
        email: email,
        hash_id: hashId,
        total_price: totalPrice,
        status: 'pending',
        client_id: clientId,
        option_details: optionDetails
      })
      .select()
      .single();

    if (orderError) throw orderError;

    await supabase.from('order_images').insert({
      order_id: order.id,
      image_url: fileName,
    });

    return NextResponse.json({ 
      success: true, 
      arUrl: `https://kototama.vercel.app/ar/${hashId}` 
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('Embed API Error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500, headers: corsHeaders });
  }
}