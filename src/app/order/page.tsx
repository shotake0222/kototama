import OrderForm from '@/components/OrderForm';

// Next.js 14 (App Router) は page.tsx のデフォルトエクスポートの引数の型を
// ビルド時に自動生成される PageProps 型と照合します。searchParams の値は
// クエリが複数指定された場合に配列になり得るため string | string[] | undefined
// で受け、Optional にしておく必要があります。
type Props = {
  searchParams?: { [key: string]: string | string[] | undefined };
};

export default function OrderPage({ searchParams }: Props) {
  const clientParam = searchParams?.client;
  const clientId = typeof clientParam === 'string' ? clientParam : undefined;
  return <OrderForm clientId={clientId} />;
}