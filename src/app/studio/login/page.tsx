'use client';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';

// ユーザー基準CMS（/studio）のログイン画面。
// パスワードは使わず、Supabase Authのマジックリンク（メールのリンクをクリックするだけ）でログインする。
export default function StudioLoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    setErrorMessage('');

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/studio`,
      },
    });

    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
    } else {
      setStatus('sent');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 w-full max-w-sm">
        <h1 className="text-xl font-bold text-gray-800 text-center mb-2">ことたま スタジオ</h1>
        <p className="text-xs text-gray-400 text-center mb-6">メールアドレスにログイン用のリンクを送ります。</p>

        {status === 'sent' ? (
          <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded p-4 text-center">
            {email} 宛にログイン用のリンクを送信しました。メール内のリンクをクリックしてください。
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">メールアドレス</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border p-2 rounded"
              />
            </div>
            {status === 'error' && <p className="text-red-600 text-xs">{errorMessage}</p>}
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white p-3 rounded font-bold transition"
            >
              {status === 'sending' ? '送信中...' : 'ログインリンクを送る'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
