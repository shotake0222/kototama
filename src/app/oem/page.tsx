import OemPortal from '@/components/OemPortal';

// OEM提供先向けセルフサービス・ポータル。
// OemPortal.tsx はコンポーネント本体として既に実装済みだったが、
// 配置先であるこのページと /api/oem-accounts が存在せず、管理画面の
// 「🔑 ログインアカウントを発行」ボタンがリンク切れになっていた（Phase 0で修正）。
export default function OemPage() {
  return <OemPortal />;
}
