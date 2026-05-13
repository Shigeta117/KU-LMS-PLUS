'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // ログイン済みなら即リダイレクト（getSession 不要 — onAuthStateChange が初回セッションも発火）
  const redirectedRef = useRef(false);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !redirectedRef.current) {
        redirectedRef.current = true;
        router.replace('/');
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました');
      setLoading(false);
    }
  }

  return (
    <main className="flex items-center justify-center min-h-dvh px-4 bg-slate-50 dark:bg-slate-900">
      <div className="w-full max-w-sm">
        {/* ロゴ */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'linear-gradient(135deg, #004a8f, #0066cc)' }}
          >
            <span className="text-white text-2xl font-black">K+</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">KU-LMS+</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">関大 WebClass 課題管理</p>
        </div>

        {/* フォーム */}
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm dark:shadow-none dark:ring-1 dark:ring-slate-700 border border-slate-200 dark:border-transparent p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              placeholder="your@email.com"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:border-[#0066cc] dark:focus:border-blue-400 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:border-[#0066cc] dark:focus:border-blue-400 transition-colors"
            />
          </div>

          {error && (
            <p className="text-sm rounded-lg px-3 py-2 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
            style={{ background: loading ? '#94a3b8' : '#004a8f' }}
          >
            {loading ? '処理中…' : 'ログイン'}
          </button>
        </form>
      </div>
    </main>
  );
}
