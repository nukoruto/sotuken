/**
 * 異常操作系列を自動生成して abnormal_log.csv に保存
 *
 *  呼び出し: node abnormal_logger.js [系列数] [delay_ms]
 *     系列数   : デフォルト 100
 *     delay_ms : 各系列間ウェイト (ms) デフォルト 100
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const SECRET = 'change_this_to_env_secret';
const LOG_FILE = path.join(__dirname, 'logs', 'abnormal_log.csv');

const MAP = {
  '/login':  { use_case: 'Login',       type: 'AUTH'   },
  '/logout': { use_case: 'Logout',      type: 'AUTH'   },
  '/browse': { use_case: 'ViewPage',    type: 'READ'   },
  '/edit':   { use_case: 'EditContent', type: 'UPDATE' }
};

if (!fs.existsSync(path.dirname(LOG_FILE))) fs.mkdirSync(path.dirname(LOG_FILE));
  fs.writeFileSync(
    LOG_FILE,
    'timestamp,user_id,now_id,endpoint,use_case,type,ip,jwt,label\n'
  );

const api = axios.create({ baseURL: 'http://localhost:3000', timeout: 5000 });
const sleep = ms => new Promise(res => setTimeout(res, ms));
const rand = arr => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomIP = () => Array.from({ length: 4 }, () => randInt(1, 254)).join('.');
const USER_AGENT = 'abnormal-logger';
function extractPayload(token) {
  try {
    const payloadPart = token.split('.')[1];
    const json = Buffer.from(payloadPart, 'base64url').toString();
    return JSON.stringify(JSON.parse(json));
  } catch (_) {
    return 'invalid';
  }
}
function logRow({ ts, userId, nowId, endpoint, ip, token = 'none', label }) {
  const { use_case = 'unknown', type = 'unknown' } = MAP[endpoint] || {};
  fs.appendFileSync(
    LOG_FILE,
    [
      ts,
      userId,
      nowId,
      endpoint,
      use_case,
      type,
      ip,
      extractPayload(token),
      label
    ].join(',') + '\n'
  );
}

// ── 各異常シナリオ ───────────────────────────
// 1) 無効JWT
async function invalidTokenSequence(userId) {
  const ip = randomIP();
  const { data } = await api.post('/login', { user_id: userId }, {
    headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT }
  });
  const badToken = data.token.slice(0, -1) + 'x';
  const auth = {
    headers: {
      Authorization: `Bearer ${badToken}`,
      'X-Forwarded-For': ip,
      'User-Agent': USER_AGENT
    }
  };
  const ts = new Date().toISOString();
  try { await api.get('/browse', auth); } catch (_) {}
  logRow({ ts, userId: 'unknown', nowId: userId, endpoint: '/browse', ip, token: badToken, label: 'invalid_token' });
}

// 2) JWTなしアクセス
async function noTokenSequence(userId = 'unknown') {
  const ip = randomIP();
  const ts = new Date().toISOString();
  try { await api.post('/edit', {}, { headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT } }); } catch (_) {}
  logRow({ ts, userId: 'unknown', nowId: userId, endpoint: '/edit', ip, token: 'none', label: 'no_token' });
}

// 3) 順序異常 (edit → login → logout)
async function reversedSequence(userId) {
  const ip = randomIP();
  const ts1 = new Date().toISOString();
  try { await api.post('/edit', {}, { headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT } }); } catch (_) {}
  logRow({ ts: ts1, userId: 'unknown', nowId: userId, endpoint: '/edit', ip, token: 'none', label: 'no_token' });

  const { data } = await api.post('/login', { user_id: userId }, {
    headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT }
  });
  const token = data.token;
  const auth = {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Forwarded-For': ip,
      'User-Agent': USER_AGENT
    }
  };
  const ts2 = new Date().toISOString();
  await api.post('/logout', {}, auth);
  logRow({ ts: ts2, userId, nowId: userId, endpoint: '/logout', ip, token, label: 'out_of_order' });
}

// 4) セッション流用（別IPから同一JWTを使用）
async function sessionReuseSequence(nowId) {
  const issuerId = `victim_for_${nowId}`;
  const ip1 = randomIP();
  const { data } = await api.post('/login', { user_id: issuerId }, {
    headers: { 'X-Forwarded-For': ip1, 'User-Agent': USER_AGENT }
  });
  const token = data.token;
  // 同一トークンを別IPから利用
  const ip2 = randomIP();
  const t = new Date().toISOString();
  try {
    await api.get('/browse', {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Forwarded-For': ip2,
        'User-Agent': USER_AGENT
      }
    });
  } catch (_) {}
  logRow({ ts: t, userId: issuerId, nowId, endpoint: '/browse', ip: ip2, token, label: 'token_reuse' });
}

// 5) ログアウト後に同一トークンを再利用
async function reuseAfterLogoutSequence(userId) {
  const ip = randomIP();
  const { data } = await api.post('/login', { user_id: userId }, {
    headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT }
  });
  const token = data.token;
  const auth = {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Forwarded-For': ip,
      'User-Agent': USER_AGENT
    }
  };
  const t1 = new Date().toISOString();
  await api.post('/logout', {}, auth);
  logRow({ ts: t1, userId, nowId: userId, endpoint: '/logout', ip, token, label: 'normal' });

  const t2 = new Date().toISOString();
  try { await api.get('/browse', auth); } catch (_) {}
  logRow({ ts: t2, userId, nowId: userId, endpoint: '/browse', ip, token, label: 'reuse_after_logout' });
}

// 6) 有効期限切れトークンの使用
async function expiredTokenSequence(userId) {
  const ip = randomIP();
  const token = jwt.sign({ user_id: userId }, SECRET, { expiresIn: '1s' });
  const auth = {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Forwarded-For': ip,
      'User-Agent': USER_AGENT
    }
  };
  await sleep(1500);
  const t = new Date().toISOString();
  try { await api.get('/browse', auth); } catch (_) {}
  logRow({ ts: t, userId, nowId: userId, endpoint: '/browse', ip, token, label: 'expired_token' });
}


// 全異常パターンを配列で管理
const scenarios = [
  invalidTokenSequence,
  noTokenSequence,
  reversedSequence,
  sessionReuseSequence,
  reuseAfterLogoutSequence,
  expiredTokenSequence,
  sessionReuseSequence
];

// ── メイン ───────────────────────────────────
(async () => {
  const total = parseInt(process.argv[2] || '100', 10);
  const delay = parseInt(process.argv[3] || '100', 10);
  console.log(`▶ 異常系列 ${total} 本 生成開始`);

  for (let i = 0; i < total; i++) {
    const scen = rand(scenarios);
    await scen(`abuser${i + 1}`);
    await sleep(delay);
  }
  console.log(`完了：logs/abnormal_log.csv に保存済`);
})();
