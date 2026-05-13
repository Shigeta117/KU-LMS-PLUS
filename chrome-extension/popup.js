'use strict';

// =============================================
// ユーティリティ
// =============================================
const bg = (type, payload = {}) =>
  chrome.runtime.sendMessage({ type, ...payload });

function showStatus(msg, type = 'info') {
  const el = document.getElementById('statusMsg');
  el.textContent = msg;
  el.className = `status show status-${type}`;
  // 4秒後に自動消去
  clearTimeout(el.__timer);
  el.__timer = setTimeout(() => {
    el.className = 'status';
  }, 4000);
}

// =============================================
// 認証バッジ更新
// =============================================
async function refreshAuthBadge() {
  const { loggedIn, userId } = await bg('GET_AUTH_STATUS');
  const dot  = document.getElementById('authDot');
  const text = document.getElementById('authText');

  if (loggedIn) {
    dot.className  = 'dot dot-green';
    text.textContent = `ログイン中 (${userId?.slice(0, 8)}…)`;
  } else {
    dot.className  = 'dot dot-red';
    text.textContent = '未ログイン';
  }
}

// =============================================
// 設定値の読み込み
// =============================================
async function loadSettings() {
  const { supabaseUrl, supabaseAnonKey } = await chrome.storage.local.get([
    'supabaseUrl',
    'supabaseAnonKey',
  ]);
  if (supabaseUrl)    document.getElementById('supabaseUrl').value    = supabaseUrl;
  if (supabaseAnonKey) document.getElementById('supabaseAnonKey').value = supabaseAnonKey;
}

// =============================================
// 初期化
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await refreshAuthBadge();

  // ---------- 設定保存 ----------
  document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
    const url = document.getElementById('supabaseUrl').value.trim().replace(/\/+$/, '');
    const key = document.getElementById('supabaseAnonKey').value.trim();

    if (!url || !key) {
      showStatus('URL と Anon Key を入力してください', 'error');
      return;
    }
    await chrome.storage.local.set({ supabaseUrl: url, supabaseAnonKey: key });
    showStatus('設定を保存しました', 'success');
  });

  // ---------- ログイン ----------
  document.getElementById('loginBtn').addEventListener('click', async () => {
    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      showStatus('メールアドレスとパスワードを入力してください', 'error');
      return;
    }

    const btn = document.getElementById('loginBtn');
    btn.disabled    = true;
    btn.textContent = 'ログイン中…';

    const res = await bg('LOGIN', { email, password });

    btn.disabled    = false;
    btn.textContent = 'ログイン';

    if (res.ok) {
      document.getElementById('password').value = '';
      showStatus('ログインしました', 'success');
      await refreshAuthBadge();
    } else {
      showStatus(res.error ?? 'ログインに失敗しました', 'error');
    }
  });

  // ---------- ログアウト ----------
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await bg('LOGOUT');
    showStatus('ログアウトしました', 'info');
    await refreshAuthBadge();
  });

  // ---------- 手動スクレイプ ----------
  document.getElementById('scrapeBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url?.includes('webclass.ku-portal.kansai-u.ac.jp')) {
      showStatus('WebClass のトップページを開いた状態で実行してください', 'error');
      return;
    }

    const btn = document.getElementById('scrapeBtn');
    btn.disabled    = true;
    btn.textContent = '収集中…';

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
      showStatus('収集を開始しました。完了後バッジに件数が表示されます。', 'success');
    } catch (e) {
      showStatus(`エラー: ${e.message}`, 'error');
    } finally {
      setTimeout(() => {
        btn.disabled    = false;
        btn.textContent = '今すぐ課題を収集';
      }, 2000);
    }
  });

  // Enter キーでログイン
  document.getElementById('password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('loginBtn').click();
  });
});
