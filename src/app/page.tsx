import { redirect } from 'next/navigation';

export default function HomePage() {
  // アクセスされたら自動的に発注フォームへ飛ばす
  redirect('/order');
}