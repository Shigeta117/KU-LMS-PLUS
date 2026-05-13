'use client';

import type { FilterTab } from '@/lib/types';

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'pending',   label: '未完了' },
  { key: 'completed', label: '完了済' },
  { key: 'hidden',    label: '非表示' },
];

interface Props {
  activeTab: FilterTab;
  onTabChange: (tab: FilterTab) => void;
  categories: string[];
  activeCategory: string;
  onCategoryChange: (cat: string) => void;
  counts: Record<FilterTab, number>;
}

export default function FilterBar({
  activeTab,
  onTabChange,
  categories,
  activeCategory,
  onCategoryChange,
  counts,
}: Props) {
  return (
    <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
      {/* タブ */}
      <div className="flex">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className={[
              'flex-1 py-3 text-sm font-semibold border-b-2 transition-colors',
              activeTab === key
                ? 'border-[#004a8f] text-[#004a8f] dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
            ].join(' ')}
          >
            {label}
            {counts[key] > 0 && (
              <span
                className={[
                  'ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold',
                  activeTab === key
                    ? 'bg-[#004a8f] dark:bg-blue-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
                ].join(' ')}
              >
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* カテゴリフィルタ */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 py-2 scrollbar-none">
          <CategoryChip
            label="すべて"
            active={activeCategory === ''}
            onClick={() => onCategoryChange('')}
          />
          {categories.map((cat) => (
            <CategoryChip
              key={cat}
              label={cat}
              active={activeCategory === cat}
              onClick={() => onCategoryChange(cat)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors',
        active
          ? 'bg-[#004a8f] dark:bg-blue-600 text-white border-[#004a8f] dark:border-blue-600'
          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-400',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
