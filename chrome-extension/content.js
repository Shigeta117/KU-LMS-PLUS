'use strict';

// 二重注入ガード
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
  if (!scheduleTable) return;

  sendStatus('scanning');

  // Step 1: すべての授業リンクを抽出（/webclass/course.php/ を含む a タグ）

  // 1a. 時間割テーブルから
  const courseLinks = Array.from(scheduleTable.querySelectorAll('a[href*="/webclass/course.php/"]'))
    .map((a) => ({
      url:        a.href,
      courseName: extractCourseName(a.textContent ?? ''),
    }));

  // 1b. 時間割外コース（オンデマンド・集中・隔週等）を courses_list_left / right から追加
  for (const listId of ['courses_list_left', 'courses_list_right']) {
    const container = document.getElementById(listId);
    if (!container) continue;
    for (const anchor of container.querySelectorAll('.course-title a[href*="/webclass/course.php/"]')) {
      courseLinks.push({
        url:        anchor.href,
        courseName: extractCourseName(anchor.textContent ?? ''),
      });
    }
  }

  // 重複 URL を除去（時間割とコースリストで同じ授業が現れる場合）
  const seen = new Set();
  const uniqueLinks = courseLinks.filter(({ url }) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });

  if (!uniqueLinks.length) {
    sendStatus('no_courses_found');
    return;
  }

  sendStatus('fetching', `${uniqueLinks.length} 授業を処理します`);

  const assignments = [];

  for (const { url: courseUrl, courseName } of uniqueLinks) {
    const courseId = extractCourseId(courseUrl);

    try {
      const html = await fetchFollowingJsRedirect(courseUrl);
      if (!html) continue;
      const parsed = parseCoursePage(html, courseUrl, courseId, courseName);
      assignments.push(...parsed);
    } catch (e) {
      console.warn('[KU-LMS+] fetch 失敗:', courseUrl, e.message);
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  if (!assignments.length) {
    sendStatus('no_assignments_found');
    return;
  }

  sendStatus('uploading', `${assignments.length} 件を Supabase に送信`);
  chrome.runtime.sendMessage({ type: 'UPSERT_ASSIGNMENTS', data: assignments });
}

// =============================================
// JS リダイレクトを透過的に追跡する fetch
// WebClass は認証確認後に window.location.href = "..." でリダイレクトする
// =============================================
async function fetchFollowingJsRedirect(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    console.warn('[KU-LMS+] HTTP', res.status, url);
    return null;
  }
  const html = await res.text();

  // window.location.href = "/path" または window.location.href = "https://..." を検出
  const m = html.match(/window\.location\.href\s*=\s*["']([^"']+)["']/);
  if (!m) return html;

  const redirectUrl = new URL(m[1], url).href;
  console.info('[KU-LMS+] JS redirect:', url, '→', redirectUrl);

  const res2 = await fetch(redirectUrl, { credentials: 'include' });
  if (!res2.ok) {
    console.warn('[KU-LMS+] リダイレクト先 HTTP', res2.status, redirectUrl);
    return null;
  }
  return res2.text();
}

// =============================================
// 授業ページの HTML 解析
// =============================================
function parseCoursePage(html, baseUrl, courseId, courseName) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const results = [];

  doc.querySelectorAll('section.list-group-item').forEach((section) => {
    // 課題名 — "New" 文字を除去
    const rawTitle =
      section.querySelector('.cm-contentsList_contentName')?.textContent ?? '';
    const title = rawTitle.replace(/\bNew\b/g, '').replace(/\s+/g, ' ').trim();
    if (!title) return;

    const category =
      section.querySelector('.cl-contentsList_categoryLabel')?.textContent?.trim() ?? '';

    const detailHref =
      section.querySelector('a[href]')?.getAttribute('href') ?? '';
    let detailUrl = '';
    if (detailHref) {
      try { detailUrl = new URL(detailHref, baseUrl).href; }
      catch { detailUrl = detailHref; }
    }

    // 受付期間と締切が別々の要素に入るケースに対応するため全要素テキストを結合
    const allDetailText = Array.from(
      section.querySelectorAll('.cm-contentsList_contentDetailListItemData')
    ).map((el) => (el.textContent ?? '').trim()).filter(Boolean).join(' ');
    const { start_time, deadline } = parseDateRange(allDetailText);

    const isSubmittedLms = !!section.querySelector('a[href*="/history"]');

    results.push({
      course_id:        courseId,
      course_name:      courseName || null,
      title,
      category,
      start_time,
      deadline,
      detail_url:       detailUrl,
      is_submitted_lms: isSubmittedLms,
    });
  });

  return results;
}

// =============================================
// ユーティリティ
// NOTE: 以下の関数は public/bookmarklet.js にも複製されています。
//       WebClass の仕様変更時は両ファイルを同期してください。
// =============================================

// 授業名を時間割リンクのテキストから抽出
// "» 専攻横断型講義（仕事、働くことのいま） (2026-春学期-水曜日-2限-50738)"
// → "専攻横断型講義（仕事、働くことのいま）"
function extractCourseName(rawText) {
  // 先頭の "»", "＞", ">" および空白を除去
  const text = rawText.replace(/^[»＞>\s]+/, '').trim();
  // 最初の半角 " (" より前を授業名とする（後ろは学期・曜日・時限情報）
  const idx = text.indexOf(' (');
  return idx > 0 ? text.slice(0, idx).trim() : text;
}

// course_id を URL から抽出
// 例: /webclass/course.php/26150738/login → "26150738"
function extractCourseId(url) {
  // クエリパラメータに course_id がある場合
  const qm = url.match(/[?&]course_id=([^&]+)/);
  if (qm) return decodeURIComponent(qm[1]);
  // パスに数値IDが含まれる場合（/course.php/26150738/...）
  const pm = url.match(/\/course\.php\/(\d+)\//);
  if (pm) return pm[1];
  try {
    return new URL(url).pathname.split('/').filter(Boolean).pop() ?? url;
  } catch {
    return url;
  }
}

function parseDateRange(text) {
  // テキスト内の "YYYY/MM/DD HH:MM" をすべて抽出（セパレータ依存なし）
  // 2件以上: 最初 = start_time, 最後 = deadline
  // 1件: deadline のみ
  const dates = [...text.matchAll(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/g)]
    .map((m) => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+09:00`);
  if (dates.length >= 2) return { start_time: dates[0], deadline: dates[dates.length - 1] };
  if (dates.length === 1) return { start_time: null, deadline: dates[0] };
  return { start_time: null, deadline: null };
}

function sendStatus(status, detail) {
  chrome.runtime.sendMessage({ type: 'SCRAPE_STATUS', status, detail });
}
