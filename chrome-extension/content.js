'use strict';

// PWAのURL（デプロイ先に合わせて変更してください）
// var を使うのは script 二重 injection 時の "already declared" エラーを避けるため
var KU_LMS_PWA_URL = 'https://ku-lms-plus.vercel.app';

// UI拡張はスクレイパーと独立してページごとに1回実行
if (!window.__KU_LMS_UI_INJECTED) {
  window.__KU_LMS_UI_INJECTED = true;
  runUIEnhancements();
}

// スクレイパー二重実行ガード
if (!window.__KU_KMS_INJECTED) {
  window.__KU_KMS_INJECTED = true;
  runScraper().finally(() => {
    window.__KU_KMS_INJECTED = false;
  });
}

// =============================================
// UI拡張
// =============================================
function runUIEnhancements() {
  if (document.querySelector('section.list-group-item.cl-contentsList_listGroupItem')) {
    injectDeadlineBadges();
    injectActionButtons();
  }
  if (document.querySelector('table#schedule-table')) {
    injectMiniDashboard();
  }
}

// 授業ページ: 各課題ブロックに残り時間バッジを挿入
function injectDeadlineBadges() {
  document.querySelectorAll('section.list-group-item.cl-contentsList_listGroupItem').forEach((section) => {
    section.querySelectorAll('.cm-contentsList_contentDetailListItemData').forEach((el) => {
      if (el.querySelector('[data-kulms-badge]')) return; // 挿入済みならスキップ

      const text  = (el.textContent ?? '').trim();
      const dates = [...text.matchAll(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/g)]
        .map((m) => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+09:00`);
      if (!dates.length) return;

      const now      = new Date();
      const start    = dates.length >= 2 ? new Date(dates[0]) : null;
      const deadline = new Date(dates[dates.length - 1]);
      const diffMs   = deadline - now;
      const diffH    = diffMs / 36e5; // ミリ秒→時間

      let label, bg, color, border;
      if (start && start > now) {
        label  = '⏳ 開始前';
        bg     = '#dbeafe'; color = '#1d4ed8'; border = '#93c5fd';
      } else if (diffMs < 0) {
        label  = '期限切れ';
        bg     = '#f1f5f9'; color = '#94a3b8'; border = '#e2e8f0';
      } else if (diffH < 24) {
        label  = `🔥 あと${Math.ceil(diffH)}時間!`;
        bg     = '#dc2626'; color = '#fff'; border = '#dc2626';
      } else if (diffH < 72) {
        label  = `🟡 あと${Math.floor(diffH / 24)}日`;
        bg     = '#fef9c3'; color = '#854d0e'; border = '#fde047';
      } else {
        label  = `🟢 あと${Math.floor(diffH / 24)}日`;
        bg     = '#dcfce7'; color = '#15803d'; border = '#86efac';
      }

      const badge = document.createElement('span');
      badge.setAttribute('data-kulms-badge', '');
      badge.textContent = label;
      badge.style.cssText = [
        `background:${bg}`,
        `color:${color}`,
        `border:1px solid ${border}`,
        'display:inline-block',
        'font-size:11px',
        'font-weight:700',
        'padding:2px 8px',
        'border-radius:999px',
        'margin-left:8px',
        'white-space:nowrap',
        'vertical-align:middle',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      ].join(';');
      el.appendChild(badge);
    });
  });
}

// 授業ページ: 各課題ブロックに「完了」「非表示」ボタンを挿入し Supabase を更新
function injectActionButtons() {
  const courseId = extractCourseId(window.location.href);
  if (!courseId) return;

  document.querySelectorAll('section.list-group-item.cl-contentsList_listGroupItem').forEach((section) => {
    if (section.querySelector('[data-kulms-actions]')) return;

    const rawTitle = section.querySelector('.cm-contentsList_contentName')?.textContent ?? '';
    const title    = rawTitle.replace(/\bNew\b/g, '').replace(/\s+/g, ' ').trim();
    if (!title) return;

    const bar = document.createElement('div');
    bar.setAttribute('data-kulms-actions', '');
    bar.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 8px 7px;border-top:1px solid rgba(0,0,0,.06);';

    const completeBtn = makeLmsBtn('✓ 完了', '#16a34a', '#fff');
    const hideBtn     = makeLmsBtn('非表示', '#64748b', '#fff');

    async function applyAction(field, btn, other) {
      btn.disabled   = true;
      other.disabled = true;
      const prev     = btn.textContent;
      btn.textContent = '更新中…';

      const res = await chrome.runtime.sendMessage({
        type: 'UPDATE_ASSIGNMENT', courseId, title, field, value: true,
      });

      if (res?.ok) {
        if (field === 'is_completed_manual') {
          section.style.opacity = '0.45';
          completeBtn.textContent = '✓ 完了済み';
          completeBtn.style.cssText = [
            'background:#dcfce7', 'color:#15803d', 'border:1px solid #86efac',
            'border-radius:6px', 'padding:3px 10px', 'font-size:11px',
            'font-weight:600', 'cursor:default',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
          ].join(';');
          hideBtn.style.display = 'none';
        } else {
          section.style.opacity      = '0.2';
          section.style.pointerEvents = 'none';
        }
      } else {
        btn.textContent = prev;
        btn.disabled    = false;
        other.disabled  = false;
      }
    }

    completeBtn.addEventListener('click', () => applyAction('is_completed_manual', completeBtn, hideBtn));
    hideBtn.addEventListener('click',     () => applyAction('is_hidden',            hideBtn,     completeBtn));

    bar.appendChild(completeBtn);
    bar.appendChild(hideBtn);
    (section.querySelector('.cl-contentsList_content') ?? section).appendChild(bar);
  });
}

function makeLmsBtn(label, bg, color) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.style.cssText = [
    `background:${bg}`, `color:${color}`,
    'border:none', 'border-radius:6px', 'padding:3px 10px',
    'font-size:11px', 'font-weight:600', 'cursor:pointer', 'transition:opacity .15s',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
  ].join(';');
  btn.addEventListener('mouseover', () => { if (!btn.disabled) btn.style.opacity = '.8'; });
  btn.addEventListener('mouseout',  () => { btn.style.opacity = '1'; });
  return btn;
}

// トップページ: KU-LMS+ ミニダッシュボードをサイドバー最上部に挿入
async function injectMiniDashboard() {
  if (document.getElementById('kulms-mini-dashboard')) return;

  const sidebar =
    document.querySelector('.col-sm-3 .side-block-outer') ??
    document.querySelector('.col-sm-3') ??
    document.querySelector('.col-md-3');
  if (!sidebar) return;

  const { lastSyncAt, upcomingDeadlines } =
    await chrome.storage.local.get(['lastSyncAt', 'upcomingDeadlines']);

  const syncTime = lastSyncAt
    ? new Date(lastSyncAt).toLocaleString('ja-JP', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '未同期';

  const panel = document.createElement('div');
  panel.id = 'kulms-mini-dashboard';
  panel.style.cssText = [
    'background:linear-gradient(135deg,#004a8f,#0066cc)',
    'color:#fff',
    'border-radius:10px',
    'padding:14px 16px',
    'margin-bottom:12px',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'box-shadow:0 4px 12px rgba(0,74,143,.3)',
  ].join(';');

  // HTMLエスケープ（course_name / title は WebClass 由来のテキスト）
  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const now = new Date();
  let itemsHtml;

  if (upcomingDeadlines && upcomingDeadlines.length > 0) {
    itemsHtml = upcomingDeadlines.map((item, i) => {
      const dl     = new Date(item.deadline);
      const diffH  = (dl - now) / 36e5;
      const isLast = i === upcomingDeadlines.length - 1;

      let badgeText, badgeBg, badgeColor;
      if (diffH < 24) {
        badgeText = `🔥 ${Math.ceil(diffH)}時間`;
        badgeBg = '#dc2626'; badgeColor = '#fff';
      } else if (diffH < 72) {
        badgeText = `あと${Math.floor(diffH / 24)}日`;
        badgeBg = '#fef9c3'; badgeColor = '#854d0e';
      } else {
        badgeText = `あと${Math.floor(diffH / 24)}日`;
        badgeBg = 'rgba(255,255,255,.15)'; badgeColor = 'rgba(255,255,255,.9)';
      }

      const titleShort = item.title.length > 22 ? item.title.slice(0, 22) + '…' : item.title;
      const coursePart = item.course_name
        ? `<div style="font-size:9px;opacity:.6;margin-bottom:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(item.course_name)}</div>`
        : '';

      return [
        `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;`,
        `padding:5px 0;${isLast ? '' : 'border-bottom:1px solid rgba(255,255,255,.12);'}">`,
        `<div style="flex:1;min-width:0;">`,
        coursePart,
        `<div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(titleShort)}</div>`,
        `</div>`,
        `<span style="flex-shrink:0;font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;`,
        `background:${badgeBg};color:${badgeColor};">${badgeText}</span>`,
        `</div>`,
      ].join('');
    }).join('');
  } else {
    itemsHtml = '<div style="font-size:12px;opacity:.6;padding:6px 0 8px;">締切が近い課題はありません</div>';
  }

  panel.innerHTML = [
    '<div style="font-size:11px;font-weight:700;letter-spacing:.06em;opacity:.7;margin-bottom:8px;">📋 KU-LMS+ 締切が近い課題</div>',
    itemsHtml,
    `<div style="font-size:10px;opacity:.5;margin-top:8px;margin-bottom:10px;">最終同期: ${syncTime}</div>`,
    `<a href="${KU_LMS_PWA_URL}" target="_blank" rel="noopener" `,
    'style="display:block;text-align:center;background:#fff;color:#004a8f;',
    'font-weight:700;font-size:13px;padding:9px;border-radius:7px;text-decoration:none;" ',
    'onmouseover="this.style.background=\'#f0f9ff\'" onmouseout="this.style.background=\'#fff\'">',
    'PWA で課題を確認する →</a>',
  ].join('');

  sidebar.insertBefore(panel, sidebar.firstChild);
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

  doc.querySelectorAll('section.list-group-item.cl-contentsList_listGroupItem').forEach((section) => {
    // 課題名 — "New" バッジ div のテキストを除去
    const rawTitle =
      section.querySelector('.cm-contentsList_contentName')?.textContent ?? '';
    const title = rawTitle.replace(/\bNew\b/g, '').replace(/\s+/g, ' ').trim();
    if (!title) return;

    const category =
      section.querySelector('.cl-contentsList_categoryLabel')?.textContent?.trim() ?? '';

    // do_contents.php タイトルリンク（安定、トークンなし）を優先
    // なければ詳細リンクから acs_ を除去して使用
    const titleAnchor  = section.querySelector('.cm-contentsList_contentName a[href*="do_contents"]');
    const detailAnchor = section.querySelector('.cl-contentsList_contentDetailListItemData a[href*="/contents/"]');
    const preferredHref = (titleAnchor ?? detailAnchor)?.getAttribute('href') ?? '';
    let detailUrl = '';
    if (preferredHref) {
      try {
        const u = new URL(preferredHref, baseUrl);
        u.searchParams.delete('acs_');
        detailUrl = u.href;
      } catch { detailUrl = preferredHref; }
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
