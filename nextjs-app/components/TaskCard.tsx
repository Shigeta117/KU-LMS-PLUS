'use client';

import { Check } from 'lucide-react';
import type { Assignment, DeadlineUrgency } from '@/lib/types';
import { getDeadlineUrgency, formatDeadline } from '@/lib/types';

const URGENCY_STYLES: Record<
  DeadlineUrgency,
  { badge: string; border: string; text: string }
> = {
  overdue: {
    badge: 'bg-red-100 text-red-700',
    border: 'border-l-red-500',
    text:   'text-red-600',
  },
  today: {
    badge: 'bg-orange-100 text-orange-700',
    border: 'border-l-orange-400',
    text:   'text-orange-600',
  },
  week: {
    badge: 'bg-amber-100 text-amber-700',
    border: 'border-l-amber-400',
    text:   'text-amber-600',
  },
  future: {
    badge: 'bg-slate-100 text-slate-600',
    border: 'border-l-slate-300',
    text:   'text-slate-500',
  },
  none: {
    badge: 'bg-slate-100 text-slate-500',
    border: 'border-l-slate-200',
    text:   'text-slate-400',
  },
};

const URGENCY_LABEL: Record<DeadlineUrgency, string> = {
  overdue: '期限切れ',
  today:   '今日まで',
  week:    '今週中',
  future:  '期限あり',
  none:    '期限なし',
};

interface Props {
  assignment: Assignment;
  onToggleComplete: (id: string, current: boolean) => void;
  onToggleHidden:   (id: string, current: boolean) => void;
}

export default function TaskCard({
  assignment,
  onToggleComplete,
  onToggleHidden,
}: Props) {
  const {
    id,
    title,
    category,
    deadline,
    detail_url,
    course_id,
    is_submitted_lms,
    is_completed_manual,
    is_hidden,
  } = assignment;

  const urgency = getDeadlineUrgency(deadline);
  const styles  = URGENCY_STYLES[urgency];

  return (
    <article
      className={[
        'bg-white rounded-xl border-l-4 shadow-sm overflow-hidden transition-opacity',
        styles.border,
        is_completed_manual || is_hidden ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="p-4">
        {/* ヘッダー行: カテゴリ + 期限バッジ */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          {category && (
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {category}
            </span>
          )}
          <span
            className={[
              'ml-auto text-xs font-semibold px-2 py-0.5 rounded-full',
              styles.badge,
            ].join(' ')}
          >
            {URGENCY_LABEL[urgency]}
          </span>
        </div>

        {/* 課題タイトル */}
        <h3 className="text-sm font-semibold text-slate-800 leading-snug mb-1">
          {detail_url ? (
            <a
              href={detail_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline hover:text-[#004a8f]"
            >
              {title}
            </a>
          ) : (
            title
          )}
          {is_completed_manual && (
            <Check
              size={13}
              strokeWidth={2.5}
              className="inline ml-1 text-emerald-600 translate-y-[-1px]"
            />
          )}
        </h3>

        {/* 授業ID */}
        <p className="text-xs text-slate-400 mb-2">{course_id}</p>

        {/* 期限 */}
        <p className={['text-xs font-medium', styles.text].join(' ')}>
          期限: {formatDeadline(deadline)}
        </p>

        {/* LMS 提出済みバッジ */}
        {is_submitted_lms && (
          <p className="mt-1 text-xs text-emerald-600 font-medium">
            LMS 提出履歴あり
          </p>
        )}
      </div>

      {/* アクションボタン */}
      <div className="flex border-t border-slate-100">
        <ActionButton
          onClick={() => onToggleComplete(id, is_completed_manual)}
          active={is_completed_manual}
          activeLabel="完了済"
          inactiveLabel="完了にする"
          activeClass="text-emerald-600 bg-emerald-50"
        />
        <div className="w-px bg-slate-100" />
        <ActionButton
          onClick={() => onToggleHidden(id, is_hidden)}
          active={is_hidden}
          activeLabel="表示に戻す"
          inactiveLabel="非表示"
          activeClass="text-slate-600 bg-slate-50"
        />
      </div>
    </article>
  );
}

function ActionButton({
  onClick,
  active,
  activeLabel,
  inactiveLabel,
  activeClass,
}: {
  onClick: () => void;
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  activeClass: string;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex-1 py-2.5 text-xs font-semibold transition-colors',
        active ? activeClass : 'text-slate-500 hover:bg-slate-50',
      ].join(' ')}
    >
      {active ? activeLabel : inactiveLabel}
    </button>
  );
}
