'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, fetchAssignments, updateAssignment } from '@/lib/supabase';
import type { Assignment } from '@/lib/types';

type UndoEntry = {
  id: string;
  label: string;
  rollback: Partial<Pick<Assignment, 'is_completed_manual' | 'is_hidden'>>;
};

export function useAssignments() {
  const [assignments,  setAssignments]  = useState<Assignment[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [lastUpdated,  setLastUpdated]  = useState<Date | null>(null);
  const [undoEntry,    setUndoEntry]    = useState<UndoEntry | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => { loadData(); }, [loadData]);

  // Supabase Realtime: 拡張機能・ブックマークレットのUPSERT後に自動再取得
  useEffect(() => {
    const channel = supabase
      .channel('assignments-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, () => {
        loadData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  // Undo トースト
  const showUndo = useCallback((entry: UndoEntry) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoEntry(entry);
    undoTimerRef.current = setTimeout(() => setUndoEntry(null), 4000);
  }, []);

  const handleUndo = useCallback(async () => {
    if (!undoEntry) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoEntry(null);
    setAssignments((prev) =>
      prev.map((a) => (a.id === undoEntry.id ? { ...a, ...undoEntry.rollback } : a))
    );
    try {
      await updateAssignment(undoEntry.id, undoEntry.rollback);
    } catch {
      loadData();
    }
  }, [undoEntry, loadData]);

  // 楽観的更新
  const optimisticUpdate = useCallback(
    async (
      id: string,
      patch: Partial<Pick<Assignment, 'is_completed_manual' | 'is_hidden'>>,
      undoLabel: string
    ) => {
      const target = assignments.find((a) => a.id === id);
      if (!target) return;

      const rollback: Partial<Pick<Assignment, 'is_completed_manual' | 'is_hidden'>> = {};
      if ('is_completed_manual' in patch) rollback.is_completed_manual = target.is_completed_manual;
      if ('is_hidden' in patch)           rollback.is_hidden           = target.is_hidden;

      setAssignments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
      );
      showUndo({ id, label: undoLabel, rollback });

      try {
        await updateAssignment(id, patch);
      } catch {
        loadData();
      }
    },
    [assignments, loadData, showUndo]
  );

  const handleToggleComplete = useCallback(
    (id: string, current: boolean) =>
      optimisticUpdate(id, { is_completed_manual: !current },
        current ? '完了を取り消しました' : '完了済みにしました'),
    [optimisticUpdate]
  );

  const handleToggleHidden = useCallback(
    (id: string, current: boolean) =>
      optimisticUpdate(id, { is_hidden: !current },
        current ? '表示に戻しました' : '非表示にしました'),
    [optimisticUpdate]
  );

  return {
    assignments,
    loading,
    error,
    lastUpdated,
    loadData,
    handleToggleComplete,
    handleToggleHidden,
    undoEntry,
    handleUndo,
  };
}
