'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchAssignments, updateAssignment } from '@/lib/supabase';
import type { Assignment, FilterTab } from '@/lib/types';
import { CheckCircle2, EyeOff, RefreshCw, InboxIcon, Settings } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import FilterBar from '@/components/FilterBar';
import TaskCard from '@/components/TaskCard';
import { usePullToRefresh } from '@/lib/usePullToRefresh';

export default function HomePage() {
  return (
    <AuthGuard>
      <AssignmentList />
    </AuthGuard>
  );
}

function AssignmentList() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [activeTab,   setActiveTab]   = useState<FilterTab>('pending');
  const [activeCategory, setActiveCategory] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // =============================================
  // データ取得
  // =============================================
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchAssignments();
      setAssignments(data);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // =============================================
  // 楽観的更新ヘルパー
  // =============================================
  const optimisticUpdate = useCallback(
    async (
      id: string,
      patch: Partial<Pick<Assignment, 'is_completed_manual' | 'is_hidden'>>
    ) => {
      setAssignments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
      );
      try {
        await updateAssignment(id, patch);
      } catch {
        // ロールバック
        loadData();
      }
    },
    [loadData]
  );

  const handleToggleComplete = (id: string, current: boolean) =>
    optimisticUpdate(id, { is_completed_manual: !current });

  const handleToggleHidden = (id: string, current: boolean) =>
    optimisticUpdate(id, { is_hidden: !current });

  // =============================================
  // フィルタリング
  // =============================================
  const filtered = assignments.filter((a) => {
    const matchTab =
      activeTab === 'pending'
        ? !a.is_completed_manual && !a.is_hidden
        : activeTab === 'completed'
        ? a.is_completed_manual && !a.is_hidden
        : a.is_hidden;

    const matchCat = !activeCategory || a.category === activeCategory;
    return matchTab && matchCat;
  });

  const categories = [
    ...new Set(assignments.map((a) => a.category).filter(Boolean)),
  ].sort();

  const counts: Record<FilterTab, number> = {
    pending:   assignments.filter((a) => !a.is_completed_manual && !a.is_hidden).length,
    completed: assignments.filter((a) => a.is_completed_manual && !a.is_hidden).length,
    hidden:    assignments.filter((a) => a.is_hidden).length,
  };

  const pullIndicatorRef = usePullToRefresh(loadData, !loading);

  // =============================================
  // 描画
  // =============================================
  return (
    <div className="flex flex-col min-h-dvh w-full sm:max-w-2xl sm:mx-auto sm:border-x sm:border-slate-200 dark:sm:border-slate-700">
      {/* プルツーリフレッシュ インジケーター */}
      <div className="flex justify-center pt-2 h-0 overflow-visible pointer-events-none">
        <div
          ref={pullIndicatorRef}
          className="w-8 h-8 border-4 border-white/40 border-t-white rounded-full opacity-0 transition-none"
          style={{ transform: 'translateY(0) scale(0.6)' }}
        />
      </div>

      {/* ヘッダー */}
      <header
        className="px-4 pt-safe-top pb-3 flex items-center justify-between"
        style={{ background: 'linear-gradient(135deg, #004a8f, #0066cc)' }}
      >
        <div>
          <h1 className="text-white text-lg font-bold">KU-LMS+</h1>
          <p className="text-blue-100 text-xs">
            {lastUpdated
              ? `更新: ${lastUpdated.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
              : '課題一覧'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 text-white text-sm px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            更新
          </button>
          <button
            onClick={() => router.push('/settings')}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            aria-label="設定"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* フィルタバー */}
      <FilterBar
        activeTab={activeTab}
        onTabChange={(tab) => { setActiveTab(tab); setActiveCategory(''); }}
        categories={categories}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        counts={counts}
      />

      {/* メインコンテンツ */}
      <main className="flex-1 px-3 py-3 pb-safe-bottom space-y-3 sm:px-4 sm:py-4">
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-slate-200 dark:border-slate-700 border-t-[#004a8f] rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-600 dark:text-red-400">
            {error}
            <button
              onClick={loadData}
              className="block mt-2 text-red-700 dark:text-red-300 font-semibold underline"
            >
              再試行
            </button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <EmptyState tab={activeTab} />
        )}

        {!loading &&
          filtered.map((assignment) => (
            <TaskCard
              key={assignment.id}
              assignment={assignment}
              onToggleComplete={handleToggleComplete}
              onToggleHidden={handleToggleHidden}
            />
          ))}
      </main>
    </div>
  );
}

function EmptyState({ tab }: { tab: FilterTab }) {
  const config: Record<FilterTab, { icon: React.ReactNode; text: string }> = {
    pending: {
      icon: <InboxIcon size={40} strokeWidth={1.5} className="text-slate-300 dark:text-slate-600" />,
      text: '未完了の課題はありません',
    },
    completed: {
      icon: <CheckCircle2 size={40} strokeWidth={1.5} className="text-slate-300 dark:text-slate-600" />,
      text: '完了済みの課題はありません',
    },
    hidden: {
      icon: <EyeOff size={40} strokeWidth={1.5} className="text-slate-300 dark:text-slate-600" />,
      text: '非表示にした課題はありません',
    },
  };
  const { icon, text } = config[tab];

  return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
      <div className="mb-4">{icon}</div>
      <p className="text-sm font-medium">{text}</p>
      <p className="text-xs mt-1 text-slate-400 dark:text-slate-500">WebClass で拡張機能またはブックマークレットを実行してください</p>
    </div>
  );
}
