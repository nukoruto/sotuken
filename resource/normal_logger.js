/**
 * 正常操作系列を自動生成して normal_log.csv に保存
 *
 *  呼び出し: node normal_logger.js --n 50 --d 100 --p 4
 *     --n 系列数   (default 100)
 *     --d delay_ms (ms, default 100)
 *     --p 同時実行数 (default 1)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const updateOperationLog = require('./update_operation_log');
const LOG_FILE = path.join(__dirname, 'logs', 'normal_log.csv');
const API_VERSION = 'v1';

// IPによる地域判定は使用しないため削除

function getUserRole(user_id) {
  if (!user_id) return 'guest';
  if (user_id.startsWith('admin')) return 'admin';
  if (user_id.startsWith('mod')) return 'moderator';
  return 'member';
}

const lastEndpoint = new Map();

// logging fields (IP は記録しない)
const FIELDS = [
  'timestamp',
  'session_id',
  'user_agent',
  'jwt',
  'method',
  'endpoint',
  'referrer'
];

// ── マッピング（endpoint → use_case/type） ──────────────
const MAP = {
  '/login':  { use_case: 'Login',       type: 'AUTH'   },
  '/logout': { use_case: 'Logout',      type: 'AUTH'   },
  '/browse': { use_case: 'ViewPage',    type: 'READ'   },
  '/edit':   { use_case: 'EditContent', type: 'UPDATE' },
  '/profile': { use_case: 'Profile',    type: 'UPDATE' },
  '/search':  { use_case: 'Search',     type: 'READ' }
};

// ── CSV 初期化 ────────────────────────────────
if (!fs.existsSync(path.dirname(LOG_FILE))) fs.mkdirSync(path.dirname(LOG_FILE));
fs.writeFileSync(
  LOG_FILE,
  FIELDS.join(',') + '\n'
);

// ── 共通ユーティリティ ────────────────────────
const api = axios.create({ baseURL: 'http://localhost:3000', timeout: 5000 });
const sleep = ms => new Promise(res => setTimeout(res, ms));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const jpOctetList = [43,49,58,59,60,61,101,103,106,110,111,112,113,114,115,116,118,
 119,120,121,122,123,124,125,126,133,150,153,175,180,182,183,202,203,210,211,
 219,220,221,222];
const rand = arr => arr[Math.floor(Math.random() * arr.length)];
const randomIP = () => [rand(jpOctetList), randInt(0,255), randInt(0,255), randInt(1,254)].join('.');
const USER_AGENT = 'normal-logger';
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
// セッション管理: token -> { loginTime, actionCount, lastAction }
const sessions = new Map();

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

async function requestAndLog({ method, endpoint, data, token, userId, ip, label }) {
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

  if (endpoint === '/login' && res.status < 400 && res.data.token) {
    actualToken = res.data.token;
  }

  const session = actualToken ? sessions.get(actualToken) : null;
  const log = {
    timestamp: new Date(start).toISOString(),
    session_id: actualToken ? actualToken.slice(-8) : 'guest',
    user_agent: USER_AGENT,
    jwt: actualToken || '',
    method: method.toUpperCase(),
    endpoint,
    referrer: headers.Referer || ''
  };
  logRow(log);
  lastEndpoint.set(userId, endpoint);
  if (actualToken) {
    if (!session) {
      sessions.set(actualToken, { loginTime: start, actionCount: 1, lastAction: MAP[endpoint]?.use_case || endpoint });
    } else {
      session.actionCount++;
      session.lastAction = MAP[endpoint]?.use_case || endpoint;
    }
  }
  return actualToken;
}

// ── 基本操作 ──────────────────────────────────
async function stepLogin(userId, ip) {
  const token = await requestAndLog({
    method: 'post',
    endpoint: '/login',
    data: { user_id: userId },
    token: null,
    userId,
    ip,
    label: 'normal'
  });
  await humanDelay('/login');
  return { token, auth: { headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT } } };
}

async function stepBrowse(userId, ip, token, auth) {
  await requestAndLog({
    method: 'get',
    endpoint: '/browse',
    token,
    userId,
    ip,
    label: 'normal'
  });
  await humanDelay('/browse');
}

async function stepEdit(userId, ip, token, auth) {
  await requestAndLog({
    method: 'post',
    endpoint: '/edit',
    data: { id: randInt(1, 1000) },
    token,
    userId,
    ip,
    label: 'normal'
  });
  await humanDelay('/edit');
}

async function stepLogout(userId, ip, token, auth) {
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
}

async function stepProfileView(userId, ip, token, auth) {
  await requestAndLog({
    method: 'get',
    endpoint: '/profile',
    token,
    userId,
    ip,
    label: 'normal'
  });
  await humanDelay('/profile');
}

async function stepProfileUpdate(userId, ip, token, auth) {
  await requestAndLog({
    method: 'post',
    endpoint: '/profile',
    data: { bio: 'hello' },
    token,
    userId,
    ip,
    label: 'normal'
  });
  await humanDelay('/profile');
}

async function stepSearch(userId, ip, token) {
  await requestAndLog({
    method: 'get',
    endpoint: '/search',
    token,
    userId,
    ip,
    label: 'normal'
  });
  await humanDelay('/search');
}

// ── 各ユースケース定義 ──────────────────────────
async function ucA2(userId) {                 // Login → Logout
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  await stepLogout(userId, ip, token, auth);
}

async function ucA1(userId) {                 // Login のみ
  const ip = randomIP();
  await stepLogin(userId, ip);
}

async function ucR4(userId) {                 // Login → Browse×n → Logout
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  const count = randInt(2, 4);
  for (let i = 0; i < count; i++) await stepBrowse(userId, ip, token, auth);
  await stepLogout(userId, ip, token, auth);
}

async function ucR3(userId) {                 // Login → Browse → Logout
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  await stepBrowse(userId, ip, token, auth);
  await stepLogout(userId, ip, token, auth);
}

async function ucR1R2(userId) {               // Login → Browse(複数) → (no logout)
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  const count = randInt(1, 3);
  for (let i = 0; i < count; i++) await stepBrowse(userId, ip, token, auth);
}

async function ucU2(userId) {                 // Login → Edit → Logout
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  await stepEdit(userId, ip, token, auth);
  await stepLogout(userId, ip, token, auth);
}

async function ucU5(userId) {                 // Login → Browse → Edit → Logout
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  await stepBrowse(userId, ip, token, auth);
  await stepEdit(userId, ip, token, auth);
  await stepLogout(userId, ip, token, auth);
}

async function ucU1U3(userId) {               // Login → Edit(複数)
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  const count = randInt(1, 3);
  for (let i = 0; i < count; i++) await stepEdit(userId, ip, token, auth);
}

async function ucM1(userId) {                 // Login → Browse → Edit → Browse → Logout
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  await stepBrowse(userId, ip, token, auth);
  await stepEdit(userId, ip, token, auth);
  await stepBrowse(userId, ip, token, auth);
  await stepLogout(userId, ip, token, auth);
}

async function ucM3(userId) {                 // Login → Browse → Edit → Edit → Browse → Logout
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  await stepBrowse(userId, ip, token, auth);
  await stepEdit(userId, ip, token, auth);
  await stepEdit(userId, ip, token, auth);
  await stepBrowse(userId, ip, token, auth);
  await stepLogout(userId, ip, token, auth);
}

async function ucM2(userId) {                 // Login → Edit → Browse → Edit → Logout
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  await stepEdit(userId, ip, token, auth);
  await stepBrowse(userId, ip, token, auth);
  await stepEdit(userId, ip, token, auth);
  await stepLogout(userId, ip, token, auth);
}

async function ucO1(userId) {                 // Login → Browse → Edit (no logout)
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  await stepBrowse(userId, ip, token, auth);
  await stepEdit(userId, ip, token, auth);
}

async function ucO2O3(userId) {               // Login → Browse (no logout)
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  const count = randInt(1, 3);
  for (let i = 0; i < count; i++) await stepBrowse(userId, ip, token, auth);
}

async function ucP1(userId) {                 // Login → ProfileView → Update → Search → Logout
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  await stepProfileView(userId, ip, token, auth);
  await stepProfileUpdate(userId, ip, token, auth);
  await stepSearch(userId, ip, token);
  await stepLogout(userId, ip, token, auth);
}

const scenarios = [
  { weight: 5, run: ucA2 },
  { weight: 3, run: ucA1 },
  { weight: 5, run: ucR4 },
  { weight: 4, run: ucR3 },
  { weight: 2, run: ucR1R2 },
  { weight: 4, run: ucU2 },
  { weight: 3, run: ucU5 },
  { weight: 2, run: ucU1U3 },
  { weight: 5, run: ucM1 },
  { weight: 3, run: ucM3 },
  { weight: 2, run: ucM2 },
  { weight: 3, run: ucO1 },
  { weight: 2, run: ucO2O3 },
  { weight: 3, run: ucP1 }
];

function pickScenario() {
  const total = scenarios.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const scen of scenarios) {
    if (r < scen.weight) return scen.run;
    r -= scen.weight;
  }
  return scenarios[0].run;
}

async function normalSequence(userId) {
  const run = pickScenario();
  await run(userId);
}

// ── メイン ───────────────────────────────────
(async () => {
  const { total, delay, parallel } = parseArgs();
  console.log(`▶ 正常系列 ${total} 本 生成開始`);

  const running = new Set();
  for (let i = 0; i < total; i++) {
    const uid = `user${String(i + 1).padStart(3, '0')}`;
    const p = normalSequence(uid).then(() => running.delete(p));
    running.add(p);
    if (running.size >= parallel) await Promise.race(running);
    await sleep(delay);
  }
  await Promise.all(running);
  console.log(`完了：logs/normal_log.csv に保存済`);
  updateOperationLog();
})();
