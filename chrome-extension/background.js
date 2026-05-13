'use strict';

// =============================================
// Supabase エンドポイントヘルパー
// =============================================
const authUrl = (base) => `${base}/auth/v1`;
const restUrl = (base) => `${base}/rest/v1`;

// =============================================
// webNavigation: WebClass ページで自動スクレイプ
// =============================================
chrome.webNavigation.onCompleted.addListener(
  async (details) => {
    if (details.frameId !== 0) return;
    const { accessToken } = await chrome.storage.local.get(['accessToken']);
    if (!accessToken) return;

    try {
      await chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        files: ['content.js'],
      });
    } catch (e) {
      console.warn('[KU-KMS+] Script injection failed:', e.message);
    }
  },
  { url: [{ hostContains: 'webclass.ku-portal.kansai-u.ac.jp' }] }
);

// =============================================
// メッセージハンドラ
// =============================================
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'LOGIN':
      login(message.email, message.password)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case 'LOGOUT':
      chrome.storage.local.remove(['accessToken', 'refreshToken', 'userId']);
      sendResponse({ ok: true });
      return false;

    case 'GET_AUTH_STATUS':
      chrome.storage.local
        .get(['accessToken', 'userId'])
        .then(({ accessToken, userId }) =>
          sendResponse({ loggedIn: !!(accessToken && userId), userId })
        );
      return true;

    case 'UPSERT_ASSIGNMENTS':
      upsertAssignments(message.data)
        .then((count) => sendResponse({ ok: true, count }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case 'SCRAPE_STATUS':
      // content.js からの進捗通知（デバッグ用）
      console.info('[KU-KMS+]', message.status, message.detail ?? '');
      return false;

    default:
      return false;
  }
});

// =============================================
// Supabase Auth: Email / Password ログイン
// =============================================
async function login(email, password) {
  const { supabaseUrl, supabaseAnonKey } = await chrome.storage.local.get([
    'supabaseUrl',
    'supabaseAnonKey',
  ]);
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL と Anon Key を先に設定してください');
  }

  const res = await fetch(
    `${authUrl(supabaseUrl)}/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({ email, password }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.error_description || err.message || 'ログイン失敗'
    );
  }

  const data = await res.json();
  await chrome.storage.local.set({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    userId: data.user?.id,
  });

  return { userId: data.user?.id };
}

// =============================================
// Supabase Auth: トークンリフレッシュ
// =============================================
async function refreshAccessToken() {
  const { supabaseUrl, supabaseAnonKey, refreshToken } =
    await chrome.storage.local.get([
      'supabaseUrl',
      'supabaseAnonKey',
      'refreshToken',
    ]);

  if (!refreshToken) {
    throw new Error('セッションが切れています。再ログインしてください。');
  }

  const res = await fetch(
    `${authUrl(supabaseUrl)}/token?grant_type=refresh_token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }
  );

  if (!res.ok) {
    throw new Error('セッション更新に失敗しました。再ログインしてください。');
  }

  const data = await res.json();
  await chrome.storage.local.set({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  });

  return data.access_token;
}

// =============================================
// Supabase REST: UPSERT
// ユーザー操作フィールド（is_completed_manual, is_hidden）は
// payload に含めないため ON CONFLICT 時も上書きされない
// =============================================
async function upsertAssignments(assignments) {
  if (!assignments?.length) return 0;

  const { supabaseUrl, supabaseAnonKey, userId, accessToken: token } =
    await chrome.storage.local.get([
      'supabaseUrl',
      'supabaseAnonKey',
      'userId',
      'accessToken',
    ]);

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('拡張機能の設定が不完全です。ポップアップから設定してください。');
  }
  if (!token || !userId) {
    throw new Error('ログインしていません。ポップアップからログインしてください。');
  }

  const now = new Date().toISOString();
  const rows = assignments.map((a) => ({
    user_id: userId,
    course_id: a.course_id,
    title: a.title,
    category: a.category,
    deadline: a.deadline,
    detail_url: a.detail_url,
    is_submitted_lms: a.is_submitted_lms,
    updated_at: now,
  }));

  const doRequest = (jwt) =>
    fetch(
      `${restUrl(supabaseUrl)}/assignments?on_conflict=user_id,course_id,title`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${jwt}`,
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(rows),
      }
    );

  let res = await doRequest(token);

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    res = await doRequest(newToken);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase UPSERT error: ${body}`);
  }

  // バッジで件数を一時表示
  const count = rows.length;
  chrome.action.setBadgeText({ text: `${count}` });
  chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);

  return count;
}
