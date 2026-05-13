/* KU-LMS+ ブックマークレット本体 v1
 * このファイルはローダーから読み込まれます。直接実行しないでください。
 * content.js / background.js のロジックをブラウザ汎用に移植したものです。
 */
(function () {
  'use strict';

  // 二重実行ガード
  if (window.__KULMS_BM_RUNNING) {
    console.info('[KU-LMS+] 既に実行中です');
    return;
  }
  window.__KULMS_BM_RUNNING = true;

  // ============================================================
  // 定数（Supabase プロジェクト設定）
  // ============================================================
  var SUPABASE_URL  = 'https://jjjndffkyuvlwwcqcurt.supabase.co';
  var SUPABASE_ANON = 'sb_publishable_DZj-CpBoQgnSFnkjcb9ZkQ_7m7g72V1';
  var AUTH_URL      = SUPABASE_URL + '/auth/v1';
  var REST_URL      = SUPABASE_URL + '/rest/v1';
  var SESSION_KEY   = 'kulms_bm_v1_session';

  // ============================================================
  // トースト通知
  // ============================================================
  var _toastEl    = null;
  var _toastTimer = null;

  function showToast(type, msg) {
    if (!_toastEl) {
      _toastEl = document.createElement('div');
      _toastEl.style.cssText = [
        'position:fixed',
        'top:16px',
        'left:50%',
        'transform:translateX(-50%)',
        'z-index:2147483647',
        'max-width:90vw',
        'min-width:260px',
        'padding:12px 18px',
        'border-radius:14px',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        'font-size:14px',
        'font-weight:600',
        'line-height:1.4',
        'box-shadow:0 6px 24px rgba(0,0,0,.3)',
        'transition:opacity .25s',
        'pointer-events:none',
      ].join(';');
      document.body.appendChild(_toastEl);
    }

    clearTimeout(_toastTimer);
    _toastEl.style.opacity = '1';

    var palette = {
      info:    { bg: '#1a4a8f', color: '#e8f0ff' },
      success: { bg: '#14532d', color: '#d1fae5' },
      warn:    { bg: '#78350f', color: '#fef3c7' },
      error:   { bg: '#7f1d1d', color: '#fee2e2' },
    };
    var c = palette[type] || palette.info;
    _toastEl.style.background   = c.bg;
    _toastEl.style.color        = c.color;

    var icons = { info: '🔄', success: '✅', warn: '⚠️', error: '❌' };
    _toastEl.textContent = (icons[type] || '') + ' ' + msg;

    // 完了・エラーは一定時間後に自動で消す
    if (type === 'success' || type === 'error' || type === 'warn') {
      _toastTimer = setTimeout(function () {
        if (_toastEl) _toastEl.style.opacity = '0';
      }, 5000);
    }
  }

  // ============================================================
  // セッション管理（WebClass ドメインの localStorage に保存）
  // ============================================================
  function loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
  }

  function saveSession(s) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  // ============================================================
  // Supabase Auth: パスワードログイン
  // ============================================================
  async function loginWithPassword(email, password) {
    var res = await fetch(AUTH_URL + '/token?grant_type=password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON,
      },
      body: JSON.stringify({ email: email, password: password }),
    });

    if (!res.ok) {
      var body = await res.json().catch(function () { return {}; });
      var msg  = body.error_description || body.message || 'ログイン失敗 (' + res.status + ')';
      if (res.status === 400) msg = 'メールアドレスまたはパスワードが違います';
      if (res.status === 422) msg = 'メールアドレスの形式が正しくありません';
      if (res.status === 429) msg = 'ログイン試行回数超過。しばらく待ってください';
      throw new Error(msg);
    }

    var data = await res.json();
    return {
      accessToken:  data.access_token,
      refreshToken: data.refresh_token,
      userId:       data.user.id,
      expiresAt:    Date.now() + (data.expires_in || 3600) * 1000,
    };
  }

  // ============================================================
  // Supabase Auth: トークンリフレッシュ
  // ============================================================
  async function refreshSession(session) {
    var res = await fetch(AUTH_URL + '/token?grant_type=refresh_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON,
      },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });

    if (!res.ok) throw new Error('セッション更新失敗');

    var data = await res.json();
    return {
      accessToken:  data.access_token,
      refreshToken: data.refresh_token,
      userId:       session.userId,
      expiresAt:    Date.now() + (data.expires_in || 3600) * 1000,
    };
  }

  // ============================================================
  // 有効なセッションを取得（必要に応じてログイン/リフレッシュ）
  // ============================================================
  async function getValidSession() {
    var session = loadSession();

    // 有効期限まで5分以上あれば再利用
    if (session && Date.now() < session.expiresAt - 5 * 60 * 1000) {
      return session;
    }

    // リフレッシュを試みる
    if (session && session.refreshToken) {
      try {
        var refreshed = await refreshSession(session);
        saveSession(refreshed);
        return refreshed;
      } catch (e) {
        clearSession();
        // リフレッシュ失敗 → 再ログインへ
      }
    }

    // 新規ログイン（初回 or セッション切れ）
    var email = prompt(
      'KU-LMS+ へのログイン\n\n' +
      'Supabase に登録したメールアドレスを入力してください\n' +
      '（次回以降は入力不要です）'
    );
    if (!email) return null;

    var password = prompt('パスワードを入力してください:');
    if (!password) return null;

    try {
      showToast('info', 'ログイン中...');
      var newSession = await loginWithPassword(email.trim(), password);
      saveSession(newSession);
      return newSession;
    } catch (e) {
      showToast('error', e.message);
      clearSession();
      return null;
    }
  }

  // ============================================================
  // ユーティリティ（chrome-extension/content.js より移植）
  // NOTE: このロジックは content.js と共通です。
  //       WebClass の仕様変更時は両ファイルを同期してください。
  // ============================================================

  // 時間割リンクのテキストから授業名を抽出
  // 例: "» 線形代数学 (2026-春学期-月曜日-1限-50001)" → "線形代数学"
  function extractCourseName(rawText) {
    var text = rawText.replace(/^[»＞>\s]+/, '').trim();
    var idx  = text.indexOf(' (');
    return idx > 0 ? text.slice(0, idx).trim() : text;
  }

  // URL から course_id を抽出
  function extractCourseId(url) {
    var qm = url.match(/[?&]course_id=([^&]+)/);
    if (qm) return decodeURIComponent(qm[1]);
    var pm = url.match(/\/course\.php\/(\d+)\//);
    if (pm) return pm[1];
    try {
      return new URL(url).pathname.split('/').filter(Boolean).pop() || url;
    } catch (e) {
      return url;
    }
  }

  // 日時範囲文字列から { start_time, deadline } を抽出
  // セパレータ: -(ハイフン) –(en dash) 〜 ～ →
  var SEP_PATTERN = '[-–〜～→]';
  function parseDateRange(text) {
    var full = text.match(
      new RegExp(
        '(\\d{4})/(\\d{2})/(\\d{2})\\s+(\\d{2}):(\\d{2})\\s*' + SEP_PATTERN +
        '\\s*(\\d{4})/(\\d{2})/(\\d{2})\\s+(\\d{2}):(\\d{2})'
      )
    );
    if (full) {
      return {
        start_time: full[1] + '-' + full[2] + '-' + full[3] + 'T' + full[4] + ':' + full[5] + ':00+09:00',
        deadline:   full[6] + '-' + full[7] + '-' + full[8] + 'T' + full[9] + ':' + full[10] + ':00+09:00',
      };
    }
    var deadlineOnly = text.match(
      new RegExp(SEP_PATTERN + '\\s*(\\d{4})/(\\d{2})/(\\d{2})\\s+(\\d{2}):(\\d{2})')
    );
    if (deadlineOnly) {
      return {
        start_time: null,
        deadline:   deadlineOnly[1] + '-' + deadlineOnly[2] + '-' + deadlineOnly[3] + 'T' + deadlineOnly[4] + ':' + deadlineOnly[5] + ':00+09:00',
      };
    }
    return { start_time: null, deadline: null };
  }

  // JS リダイレクト (window.location.href = "...") を透過的に辿る fetch
  async function fetchFollowingJsRedirect(url) {
    var res = await fetch(url, { credentials: 'include' });
    if (!res.ok) { console.warn('[KU-LMS+] HTTP', res.status, url); return null; }

    var html = await res.text();
    var m    = html.match(/window\.location\.href\s*=\s*["']([^"']+)["']/);
    if (!m) return html;

    var redirectUrl = new URL(m[1], url).href;
    console.info('[KU-LMS+] JS redirect:', url, '→', redirectUrl);
    var res2 = await fetch(redirectUrl, { credentials: 'include' });
    if (!res2.ok) { console.warn('[KU-LMS+] リダイレクト先 HTTP', res2.status); return null; }
    return res2.text();
  }

  // 授業ページ HTML を解析して課題一覧を返す
  function parseCoursePage(html, baseUrl, courseId, courseName) {
    var doc     = new DOMParser().parseFromString(html, 'text/html');
    var results = [];

    doc.querySelectorAll('section.list-group-item').forEach(function (section) {
      var rawTitle = (section.querySelector('.cm-contentsList_contentName') || {}).textContent || '';
      var title    = rawTitle.replace(/\bNew\b/g, '').replace(/\s+/g, ' ').trim();
      if (!title) return;

      var categoryEl  = section.querySelector('.cl-contentsList_categoryLabel');
      var category    = categoryEl ? categoryEl.textContent.trim() : '';

      var anchorEl    = section.querySelector('a[href]');
      var detailHref  = anchorEl ? anchorEl.getAttribute('href') : '';
      var detailUrl   = '';
      if (detailHref) {
        try { detailUrl = new URL(detailHref, baseUrl).href; } catch (e) { detailUrl = detailHref; }
      }

      // 受付期間と締切が別々の要素に入るケースに対応するため全要素テキストを結合
      var allDetailText = Array.from(
        section.querySelectorAll('.cm-contentsList_contentDetailListItemData')
      ).map(function (el) { return (el.textContent || '').trim(); }).filter(Boolean).join(' ');
      var dateRange    = parseDateRange(allDetailText);

      var isSubmitted = !!section.querySelector('a[href*="/history"]');

      results.push({
        course_id:        courseId,
        course_name:      courseName || null,
        title:            title,
        category:         category,
        start_time:       dateRange.start_time,
        deadline:         dateRange.deadline,
        detail_url:       detailUrl,
        is_submitted_lms: isSubmitted,
      });
    });

    return results;
  }

  // ============================================================
  // スクレイパー本体
  // ============================================================
  async function scrape() {
    var scheduleTable = document.querySelector('table#schedule-table');
    if (!scheduleTable) return [];

    // すべての授業リンクを抽出（/webclass/course.php/ を含む a タグ）
    var courseLinks = Array.from(scheduleTable.querySelectorAll('a[href*="/webclass/course.php/"]'))
      .map(function (a) {
        return {
          url:        a.href,
          courseName: extractCourseName(a.textContent || ''),
        };
      });

    // 時間割外コース（オンデマンド・集中・隔週等）を追加
    ['courses_list_left', 'courses_list_right'].forEach(function (listId) {
      var container = document.getElementById(listId);
      if (!container) return;
      container.querySelectorAll('.course-title a[href*="/webclass/course.php/"]').forEach(function (anchor) {
        courseLinks.push({ url: anchor.href, courseName: extractCourseName(anchor.textContent || '') });
      });
    });

    // 重複 URL を除去
    var seen = {};
    courseLinks = courseLinks.filter(function (item) {
      if (seen[item.url]) return false;
      seen[item.url] = true;
      return true;
    });

    if (!courseLinks.length) return [];

    var assignments = [];

    for (var i = 0; i < courseLinks.length; i++) {
      var item     = courseLinks[i];
      var courseId = extractCourseId(item.url);
      showToast('info', '(' + (i + 1) + '/' + courseLinks.length + ') ' + (item.courseName || courseId));

      try {
        var html = await fetchFollowingJsRedirect(item.url);
        if (html) {
          var parsed = parseCoursePage(html, item.url, courseId, item.courseName);
          assignments.push.apply(assignments, parsed);
        }
      } catch (e) {
        console.warn('[KU-LMS+] fetch 失敗:', item.url, e.message);
      }

      await new Promise(function (r) { setTimeout(r, 500); });
    }

    return assignments;
  }

  // ============================================================
  // Supabase REST API: UPSERT
  // is_completed_manual / is_hidden は含めない（ユーザー操作を保護）
  // ============================================================
  async function upsertAssignments(assignments, session) {
    var now  = new Date().toISOString();
    var rows = assignments.map(function (a) {
      return {
        user_id:          session.userId,
        course_id:        a.course_id,
        course_name:      a.course_name,
        title:            a.title,
        category:         a.category,
        start_time:       a.start_time || null,
        deadline:         a.deadline,
        detail_url:       a.detail_url,
        is_submitted_lms: a.is_submitted_lms,
        updated_at:       now,
      };
    });

    var doRequest = function (token) {
      return fetch(REST_URL + '/assignments?on_conflict=user_id,course_id,title', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey:         SUPABASE_ANON,
          Authorization:  'Bearer ' + token,
          Prefer:         'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(rows),
      });
    };

    var res = await doRequest(session.accessToken);

    // 401 はトークンリフレッシュで1回リトライ
    if (res.status === 401) {
      try {
        var refreshed = await refreshSession(session);
        saveSession(refreshed);
        res = await doRequest(refreshed.accessToken);
      } catch (e) {
        clearSession();
        throw new Error('セッション切れ。もう一度ブックマークレットを実行してください。');
      }
    }

    if (!res.ok) {
      var body = await res.text();
      throw new Error('Supabase エラー (' + res.status + '): ' + body);
    }

    return rows.length;
  }

  // ============================================================
  // エントリポイント
  // ============================================================
  async function main() {
    try {
      // ページ確認
      if (!document.querySelector('table#schedule-table')) {
        showToast('error', 'WebClass のトップページ（時間割が表示されているページ）で実行してください');
        return;
      }

      // セッション取得（必要なら prompt でログイン）
      var session = await getValidSession();
      if (!session) return; // キャンセルされた場合

      // スクレイプ
      showToast('info', 'スキャン開始...');
      var assignments = await scrape();

      if (!assignments.length) {
        showToast('warn', '課題が見つかりませんでした（時間割に締切マークがない可能性があります）');
        return;
      }

      // UPSERT
      showToast('info', assignments.length + ' 件を送信中...');
      var count = await upsertAssignments(assignments, session);
      showToast('success', count + ' 件の課題情報を更新しました！');

    } catch (e) {
      showToast('error', e.message || '予期しないエラーが発生しました');
      console.error('[KU-LMS+] Bookmarklet error:', e);
    } finally {
      window.__KULMS_BM_RUNNING = false;
    }
  }

  main();
})();
