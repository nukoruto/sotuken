/**
 * 異常操作系列を自動生成して abnormal_log.csv に保存
 *
 *  呼び出し: node abnormal_logger.js --n 50 --d 100 --p 4
 *     --n 系列数   (default 100)
 *     --d delay_ms (ms, default 100)
 *     --p 同時実行数 (default 1)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const updateOperationLog = require('./update_operation_log');
const SECRET = 'change_this_to_env_secret';
const LOG_FILE = path.join(__dirname, 'logs', 'abnormal_log.csv');
const API_VERSION = 'v1';

const jpOctets = new Set([
  43,49,58,59,60,61,101,103,106,110,111,112,113,114,115,116,118,
  119,120,121,122,123,124,125,126,133,150,153,175,180,182,183,202,
  203,210,211,219,220,221,222
]);

function lookupRegion(ip) {
  if (!ip) return '-';
  const first = parseInt(ip.split('.')[0], 10);
  if (jpOctets.has(first)) return 'JP';
  if (first <= 126) return 'NA';
  if (first <= 191) return 'EU';
  if (first <= 223) return 'AP';
  return '-';
}

function getUserRole(user_id) {
  if (!user_id) return 'guest';
  if (user_id.startsWith('admin')) return 'admin';
  if (user_id.startsWith('mod')) return 'moderator';
  return 'member';
}

const lastEndpoint = new Map();

// logging fields (server.js と同一順)
const FIELDS = [
  'timestamp',
  'session_id',
  'ip',
  'user_agent',
  'jwt',
  'method',
  'endpoint',
  'referrer'
];

const MAP = {
  '/login':  { use_case: 'Login',       type: 'AUTH'   },
  '/logout': { use_case: 'Logout',      type: 'AUTH'   },
  '/browse': { use_case: 'ViewPage',    type: 'READ'   },
  '/edit':   { use_case: 'EditContent', type: 'UPDATE' },
  '/profile': { use_case: 'Profile',    type: 'UPDATE' },
  '/search':  { use_case: 'Search',     type: 'READ' }
};

if (!fs.existsSync(path.dirname(LOG_FILE))) fs.mkdirSync(path.dirname(LOG_FILE));
  fs.writeFileSync(
    LOG_FILE,
    FIELDS.join(',') + '\n'
  );

const api = axios.create({ baseURL: 'http://localhost:3000', timeout: 5000 });
const sleep = ms => new Promise(res => setTimeout(res, ms));
const rand = arr => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const jpOctetList = [43,49,58,59,60,61,101,103,106,110,111,112,113,114,115,116,118,
 119,120,121,122,123,124,125,126,133,150,153,175,180,182,183,202,203,210,211,
 219,220,221,222];
const randomIP = () => [rand(jpOctetList), randInt(0,255), randInt(0,255), randInt(1,254)].join('.');
const USER_AGENT = 'abnormal-logger';
const DELAY_RANGES = {
  '/login': [500, 1500],
  '/logout': [500, 1000],
  '/browse': [1000, 300000],
  '/edit': [800, 5000],
  '/profile': [1000, 120000],
  '/search': [1000, 60000],
  default: [300, 800]
};
const humanDelay = (endpoint = 'default') => {
  const [min, max] = DELAY_RANGES[endpoint] || DELAY_RANGES.default;
  return sleep(randInt(min, max));
};
function parseArgs() {
  const argv = process.argv.slice(2);
  let total = 100;
  let delay = 100;
  let parallel = 1;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--n') {
      total = parseInt(argv[i + 1], 10) || total;
      i++;
    } else if (argv[i] === '--d') {
      delay = parseInt(argv[i + 1], 10) || delay;
      i++;
    } else if (argv[i] === '--p') {
      parallel = parseInt(argv[i + 1], 10) || parallel;
      i++;
    }
  }
  return { total, delay, parallel };
}
// token と発行者(user_id)の対応表
const tokenMap = new Map();

const registerToken = (token, userId) => tokenMap.set(token, userId);
const getIssuer = token => tokenMap.get(token) || 'unknown';
// セッション管理
const sessions = new Map(); // token -> { loginTime, actionCount, lastAction }

function decodePayload(token) {
  try {
    const json = Buffer.from(token.split('.')[1], 'base64url').toString();
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

function logRow(obj) {
  const line = FIELDS.map(f => (obj[f] !== undefined ? String(obj[f]) : ''))
    .join(',') + '\n';
  fs.appendFileSync(LOG_FILE, line);
}

async function requestAndLog({ method, endpoint, data, token, userId, ip, label, abnormal_type }) {
  const headers = { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT, 'API-Version': API_VERSION };
  const prev = lastEndpoint.get(userId);
  if (prev) headers.Referer = `http://localhost:3000${prev}`;
  if (token) headers.Authorization = `Bearer ${token}`;
  const start = Date.now();
  let res;
  try {
    res = await api.request({ method, url: endpoint, data, headers });
  } catch (err) {
    res = err.response || { status: 0, headers: {}, data: {} };
  }
  const now = Date.now();
  const session = token ? sessions.get(token) : null;
  const log = {
    timestamp: new Date(start).toISOString(),
    session_id: token ? token.slice(-8) : 'guest',
    ip,
    user_agent: USER_AGENT,
    jwt: token || '',
    method: method.toUpperCase(),
    endpoint,
    referrer: headers.Referer || ''
  };
  logRow(log);
  lastEndpoint.set(userId, endpoint);
  if (token) {
    if (!session) {
      sessions.set(token, { loginTime: start, actionCount: 1, lastAction: MAP[endpoint]?.use_case || endpoint });
    } else {
      session.actionCount++;
      session.lastAction = MAP[endpoint]?.use_case || endpoint;
    }
  }
  if (endpoint === '/login' && res.status < 400 && res.data.token) {
    return res.data.token;
  }
  return token;
}

// ── 各異常シナリオ ───────────────────────────
// 1) 無効JWT
async function invalidTokenSequence(userId) {
  const ip = randomIP();
  const { data } = await api.post('/login', { user_id: userId }, {
    headers: {
      'X-Forwarded-For': ip,
      'User-Agent': USER_AGENT,
      'API-Version': API_VERSION,
      'Referer': lastEndpoint.get(userId)
        ? `http://localhost:3000${lastEndpoint.get(userId)}`
        : ''
    }
  });
  lastEndpoint.set(userId, '/login');
  // 発行された正規トークンを記録
  registerToken(data.token, userId);
  const badToken = data.token.slice(0, -1) + 'x';
  await requestAndLog({
    method: 'get',
    endpoint: '/browse',
    token: badToken,
    userId: getIssuer(badToken),
    ip,
    label: 'invalid_token',
    abnormal_type: 'invalid_token'
  });
  await humanDelay('/browse');
}

// 2) JWTなしアクセス
async function noTokenSequence(userId = 'unknown') {
  const ip = randomIP();
  await requestAndLog({
    method: 'post',
    endpoint: '/edit',
    data: { id: randInt(1, 1000) },
    token: null,
    userId: 'unknown',
    ip,
    label: 'no_token',
    abnormal_type: 'no_token'
  });
  await humanDelay('/edit');
}

// 2b) 認証なしでプロフィール閲覧
async function unauthorizedProfileSequence(userId = 'unknown') {
  const ip = randomIP();
  await requestAndLog({
    method: 'get',
    endpoint: '/profile',
    token: null,
    userId: 'unknown',
    ip,
    label: 'no_token',
    abnormal_type: 'no_token'
  });
  await humanDelay('/profile');
}

// 3) 順序異常 (edit → login → logout)
async function reversedSequence(userId) {
  const ip = randomIP();
  await requestAndLog({
    method: 'post',
    endpoint: '/edit',
    data: { id: randInt(1, 1000) },
    token: null,
    userId: 'unknown',
    ip,
    label: 'no_token',
    abnormal_type: 'no_token'
  });
  await humanDelay('/edit');

  const token = await requestAndLog({
    method: 'post',
    endpoint: '/login',
    data: { user_id: userId },
    token: null,
    userId,
    ip,
    label: 'normal'
  });
  registerToken(token, userId);
  await humanDelay('/login');
  await requestAndLog({
    method: 'post',
    endpoint: '/logout',
    data: {},
    token,
    userId: getIssuer(token),
    ip,
    label: 'out_of_order',
    abnormal_type: 'out_of_order'
  });
  await humanDelay('/logout');
}

// 3b) プロフィール更新を先に実行
async function profileBeforeLoginSequence(userId) {
  const ip = randomIP();
  await requestAndLog({
    method: 'post',
    endpoint: '/profile',
    data: { bio: 'x' },
    token: null,
    userId: 'unknown',
    ip,
    label: 'no_token',
    abnormal_type: 'no_token'
  });
  await humanDelay('/profile');

  const token = await requestAndLog({
    method: 'post',
    endpoint: '/login',
    data: { user_id: userId },
    token: null,
    userId,
    ip,
    label: 'normal'
  });
  registerToken(token, userId);
  await humanDelay('/login');
  await requestAndLog({
    method: 'post',
    endpoint: '/logout',
    data: {},
    token,
    userId: getIssuer(token),
    ip,
    label: 'out_of_order',
    abnormal_type: 'out_of_order'
  });
  await humanDelay('/logout');
}

// 4) 発行者と利用者が異なるトークン流用
async function tokenReuseSequence(nowId) {
  // 既に取得済みのトークンから自分以外の発行分を選択
  let candidates = Array.from(tokenMap.entries()).filter(([, uid]) => uid !== nowId);
  let token, issuerId;

  if (candidates.length === 0) {
    // なければ新たに被害者用トークンを発行
    issuerId = `victim_for_${nowId}`;
    const ip = randomIP();
    const { data } = await api.post('/login', { user_id: issuerId }, {
      headers: {
        'X-Forwarded-For': ip,
        'User-Agent': USER_AGENT,
        'API-Version': API_VERSION,
        'Referer': ''
      }
    });
    lastEndpoint.set(issuerId, '/login');
    token = data.token;
    registerToken(token, issuerId);
  } else {
    [token, issuerId] = rand(candidates);
  }

  const ip = randomIP();
  await requestAndLog({
    method: 'get',
    endpoint: '/browse',
    token,
    userId: issuerId,
    ip,
    label: 'token_reuse',
    abnormal_type: 'token_reuse'
  });
  await humanDelay('/browse');
}

// 5) ログアウト後に同一トークンを再利用
async function reuseAfterLogoutSequence(userId) {
  const ip = randomIP();
  const { data } = await api.post('/login', { user_id: userId }, {
    headers: {
      'X-Forwarded-For': ip,
      'User-Agent': USER_AGENT,
      'API-Version': API_VERSION,
      'Referer': lastEndpoint.get(userId)
        ? `http://localhost:3000${lastEndpoint.get(userId)}`
        : ''
    }
  });
  lastEndpoint.set(userId, '/login');
  const token = data.token;
  registerToken(token, userId);
  await requestAndLog({
    method: 'post',
    endpoint: '/logout',
    data: {},
    token,
    userId: getIssuer(token),
    ip,
    label: 'normal'
  });

  await requestAndLog({
    method: 'get',
    endpoint: '/browse',
    token,
    userId: getIssuer(token),
    ip,
    label: 'reuse_after_logout',
    abnormal_type: 'reuse_after_logout'
  });
  await humanDelay('/browse');
}

// 6) 有効期限切れトークンの使用
async function expiredTokenSequence(userId) {
  const ip = randomIP();
  const token = jwt.sign({ user_id: userId }, SECRET, { expiresIn: '1s' });
  registerToken(token, userId);
  await sleep(1500);
  await requestAndLog({
    method: 'get',
    endpoint: '/browse',
    token,
    userId: getIssuer(token),
    ip,
    label: 'expired_token',
    abnormal_type: 'expired_token'
  });
  }

// 7) user_id なしでのログイン試行
async function missingUserIdSequence(nowId = 'unknown') {
  const ip = randomIP();
  await requestAndLog({
    method: 'post',
    endpoint: '/login',
    data: {},
    token: null,
    userId: 'unknown',
    ip,
    label: 'missing_user_id',
    abnormal_type: 'missing_user_id'
  });
  await humanDelay('/login');
}

// 8) 存在しないエンドポイントへのアクセス
async function invalidEndpointSequence(userId) {
  const ip = randomIP();
  const { data } = await api.post('/login', { user_id: userId }, { headers: {
    'X-Forwarded-For': ip,
    'User-Agent': USER_AGENT,
    'API-Version': API_VERSION,
    'Referer': lastEndpoint.get(userId)
      ? `http://localhost:3000${lastEndpoint.get(userId)}`
      : ''
  } });
  lastEndpoint.set(userId, '/login');
  const token = data.token;
  registerToken(token, userId);
  await requestAndLog({
    method: 'get',
    endpoint: '/admin',
    token,
    userId: getIssuer(token),
    ip,
    label: 'invalid_endpoint',
    abnormal_type: 'invalid_endpoint'
  });
}

// 9) IP を切り替えて同一トークンを使用
async function ipSwitchSequence(userId) {
  const ip1 = randomIP();
  const { data } = await api.post('/login', { user_id: userId }, {
    headers: {
      'X-Forwarded-For': ip1,
      'User-Agent': USER_AGENT,
      'API-Version': API_VERSION,
      'Referer': lastEndpoint.get(userId)
        ? `http://localhost:3000${lastEndpoint.get(userId)}`
        : ''
    }
  });
  lastEndpoint.set(userId, '/login');
  const token = data.token;
  registerToken(token, userId);
  const ip2 = randomIP();
  await requestAndLog({
    method: 'get',
    endpoint: '/browse',
    token,
    userId: getIssuer(token),
    ip: ip2,
    label: 'ip_switch',
    abnormal_type: 'ip_switch'
  });
}

// 10) 過剰な連続ログイン
  async function rapidLoginSequence(userId) {
    const ip = randomIP();
    for (let i = 0; i < 5; i++) {
      try {
        const token = await requestAndLog({
          method: 'post',
          endpoint: '/login',
          data: { user_id: userId },
          token: null,
          userId,
          ip,
          label: 'rapid_login'
        });
        registerToken(token, userId);
      } catch (_) {
        await requestAndLog({
          method: 'post',
          endpoint: '/login',
          data: {},
          token: null,
          userId: 'unknown',
          ip,
          label: 'rapid_login',
          abnormal_type: 'rapid_login'
        });
      }
      await humanDelay('/login');
      await sleep(50);
    }
  }

// 11) さまざまな操作を連結した複合異常
async function complexSequence(userId) {
  const ip = randomIP();
  // 正常ログイン
  const token = await requestAndLog({
    method: 'post',
    endpoint: '/login',
    data: { user_id: userId },
    token: null,
    userId,
    ip,
    label: 'normal'
  });
  registerToken(token, userId);
  await humanDelay('/login');
  await requestAndLog({
    method: 'get',
    endpoint: '/browse',
    token,
    userId,
    ip,
    label: 'normal'
  });
  await humanDelay('/browse');

  // ログアウト
  await requestAndLog({
    method: 'post',
    endpoint: '/logout',
    data: {},
    token,
    userId,
    ip,
    label: 'normal'
  });
  await humanDelay('/logout');

  // ログアウト済みトークンで操作
  await requestAndLog({
    method: 'post',
    endpoint: '/edit',
    data: { id: randInt(1, 1000) },
    token,
    userId,
    ip,
    label: 'reuse_after_logout',
    abnormal_type: 'reuse_after_logout'
  });
  await humanDelay('/edit');

  // user_id を送らずログイン試行
  await requestAndLog({
    method: 'post',
    endpoint: '/login',
    data: {},
    token: null,
    userId: 'unknown',
    ip,
    label: 'missing_user_id',
    abnormal_type: 'missing_user_id'
  });
  await humanDelay('/login');

  // 存在しないページへアクセス
  await requestAndLog({
    method: 'get',
    endpoint: '/admin',
    token,
    userId,
    ip,
    label: 'invalid_endpoint',
    abnormal_type: 'invalid_endpoint'
  });
  await humanDelay('/admin');
}


// 全異常パターンを配列で管理
const scenarios = [
  invalidTokenSequence,
  noTokenSequence,
  unauthorizedProfileSequence,
  reversedSequence,
  profileBeforeLoginSequence,
  tokenReuseSequence,
  reuseAfterLogoutSequence,
  expiredTokenSequence,
  missingUserIdSequence,
  invalidEndpointSequence,
  ipSwitchSequence,
  rapidLoginSequence,
  complexSequence
];

// ── メイン ───────────────────────────────────
(async () => {
  const { total, delay, parallel } = parseArgs();
  console.log(`▶ 異常系列 ${total} 本 生成開始`);

  const running = new Set();
  for (let i = 0; i < total; i++) {
    const scen = rand(scenarios);
    const p = scen(`abuser${i + 1}`).then(() => running.delete(p));
    running.add(p);
    if (running.size >= parallel) await Promise.race(running);
    await sleep(delay);
  }
  await Promise.all(running);
  console.log(`完了：logs/abnormal_log.csv に保存済`);
  updateOperationLog();
})();
