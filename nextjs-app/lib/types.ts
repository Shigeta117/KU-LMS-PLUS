export interface Assignment {
  id: string;
  user_id: string;
  course_id: string;
  course_name: string | null;
  title: string;
  category: string;
  deadline: string | null;
  detail_url: string;
  is_submitted_lms: boolean;
  is_completed_manual: boolean;
  is_hidden: boolean;
  updated_at: string;
  created_at: string;
}

export type FilterTab = 'pending' | 'completed' | 'hidden';

export type DeadlineUrgency = 'overdue' | 'today' | 'week' | 'future' | 'none';

export function getDeadlineUrgency(deadline: string | null): DeadlineUrgency {
  if (!deadline) return 'none';
  const now = Date.now();
  const due = new Date(deadline).getTime();
  const diff = due - now;

  if (diff < 0)                          return 'overdue';
  if (diff < 24 * 60 * 60 * 1000)        return 'today';
  if (diff < 7  * 24 * 60 * 60 * 1000)   return 'week';
  return 'future';
}

export function formatDeadline(deadline: string | null): string {
  if (!deadline) return '期限なし';
  return new Date(deadline).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  });
}
