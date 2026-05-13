'use strict';

// 二重注入ガード（executeScript が複数回呼ばれても 1 回だけ実行）
if (!window.__KU_KMS_INJECTED) {
  window.__KU_KMS_INJECTED = true;
  runScraper().finally(() => {
    window.__KU_KMS_INJECTED = false;
  });
}

// =============================================
// メインスクレイプ処理
// =============================================
async function runScraper() {
  const scheduleTable = document.querySelector('table#schedule-table');
  if (!scheduleTable) return; // 時間割ページ以外は無視

  sendStatus('scanning');

  // Step 1: 締切近い課題がある授業リンクを抽出
  const courseLinks = Array.from(
    scheduleTable.querySelectorAll('a')
  ).filter((a) => a.querySelector('div.course-contents-info'));

  if (!courseLinks.length) {
    sendStatus('no_courses_with_deadlines');
    return;
  }

  sendStatus('fetching', `${courseLinks.length} 授業を処理します`);

  const assignments = [];

  for (const link of courseLinks) {
    const courseUrl = link.href;
    const courseId = extractCourseId(courseUrl);

    try {
      const res = await fetch(courseUrl, { credentials: 'include' });
      if (!res.ok) {
        console.warn('[KU-KMS+] HTTP', res.status, courseUrl);
        continue;
      }
      const html = await res.text();
      const parsed = parseCoursePage(html, courseUrl, courseId);
      assignments.push(...parsed);
    } catch (e) {
      console.warn('[KU-KMS+] fetch 失敗:', courseUrl, e.message);
    }
  }

  if (!assignments.length) {
    sendStatus('no_assignments_found');
    return;
  }

  sendStatus('uploading', `${assignments.length} 件を Supabase に送信`);
  chrome.runtime.sendMessage({ type: 'UPSERT_ASSIGNMENTS', data: assignments });
}

// =============================================
// 授業ページのHTML解析
// =============================================
function parseCoursePage(html, baseUrl, courseId) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const results = [];

  doc.querySelectorAll('section.list-group-item').forEach((section) => {
    // 課題名 — "New" 文字を除去
    const rawTitle =
      section.querySelector('.cm-contentsList_contentName')?.textContent ?? '';
    const title = rawTitle.replace(/\bNew\b/g, '').replace(/\s+/g, ' ').trim();
    if (!title) return;

    // カテゴリ（レポート / アンケート / 資料 など）
    const category =
      section
        .querySelector('.cl-contentsList_categoryLabel')
        ?.textContent?.trim() ?? '';

    // 詳細URL（相対パスを絶対パスに解決）
    const detailHref =
      section.querySelector('a[href]')?.getAttribute('href') ?? '';
    let detailUrl = '';
    if (detailHref) {
      try {
        detailUrl = new URL(detailHref, baseUrl).href;
      } catch {
        detailUrl = detailHref;
      }
    }

    // 提出期限 — "YYYY/MM/DD HH:MM - YYYY/MM/DD HH:MM" の後半を抽出
    const deadlineRaw =
      section.querySelector('.cm-contentsList_contentDetailListItemData')
        ?.textContent ?? '';
    const deadline = parseDeadline(deadlineRaw);

    // 提出済み判定（利用回数リンクの有無で推定）
    const isSubmittedLms = !!section.querySelector('a[href*="/history"]');

    results.push({
      course_id: courseId,
      title,
      category,
      deadline,
      detail_url: detailUrl,
      is_submitted_lms: isSubmittedLms,
    });
  });

  return results;
}

// =============================================
// ユーティリティ
// =============================================
function extractCourseId(url) {
  // course_id クエリパラメータを優先
  const m = url.match(/[?&]course_id=([^&]+)/);
  if (m) return decodeURIComponent(m[1]);
  // なければパスの末尾セグメントを使用
  try {
    return new URL(url).pathname.split('/').filter(Boolean).pop() ?? url;
  } catch {
    return url;
  }
}

function parseDeadline(text) {
  // "YYYY/MM/DD HH:MM - YYYY/MM/DD HH:MM" の右辺（締切）を抽出
  // 全角ハイフン・半角ハイフン両対応
  const m = text.match(
    /[-–]\s*(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/
  );
  if (!m) return null;
  // JST (UTC+9) として ISO8601 に変換
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+09:00`;
}

function sendStatus(status, detail) {
  chrome.runtime.sendMessage({ type: 'SCRAPE_STATUS', status, detail });
}
