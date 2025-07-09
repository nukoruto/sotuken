/**
 * プレ版 Web セッションロガー
 * -----------------------------------------
 * - Node.js v20.x 推奨
 * - express / jsonwebtoken / body-parser
 * - CSV ログ: 多数のフィールドを含む拡張形式
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const { extractPayload } = require('./jwt_helper');

const SECRET   = 'change_this_to_env_secret'; // 本運用では環境変数へ
const PORT     = 3000;
const LOG_DIR  = process.env.LOG_DIR || path.join(__dirname, 'logs');
// 各リクエストの詳細ログは request_log.csv に保存
const REQUEST_LOG = path.join(LOG_DIR, 'request_log.csv');

const SESSIONS = new Map();           // token -> {loginTime, actionCount, last}
const REVOKED  = new Set();           // logout したトークン

const FIELDS = [
  ['timestamp',          'timestamp'],
  ['epoch_ms',           'epoch_ms'],
  ['user_id',            'user_id'],
  ['session_id',         'session_id'],
  ['user_role',          'user_role'],
  ['auth_method',        'auth_method'],
  ['ip',                 'ip'],
  ['geo_location',       'geo_location'],
  ['user_agent',         'user_agent'],
  ['device_type',        'device_type'],
  ['platform',           'platform'],
  ['method',             'method'],
  ['endpoint',           'endpoint'],
  ['use_case',           'use_case'],
  ['type',               'type'],
  ['target_id',          'target_id'],
  ['endpoint_group',     'endpoint_group'],
  ['referrer',           'referrer'],
  ['api_version',        'api_version'],
  ['status_code',        'status_code'],
  ['response_time_ms',   'response_time_ms'],
  ['content_length',     'content_length'],
  ['success',            'success'],
  ['jwt_payload.sub',    'jwt_payload_sub'],
  ['jwt_payload.exp',    'jwt_payload_exp'],
  ['token_reuse_detected','token_reuse_detected'],
  ['login_state',        'login_state'],
  ['time_since_login',   'time_since_login'],
  ['actions_in_session', 'actions_in_session'],
  ['previous_action',    'previous_action'],
  ['next_action_expected','next_action_expected'],
  ['label',              'label'],
  ['abnormal_type',      'abnormal_type'],
  ['severity',           'severity'],
  ['comment',            'comment'],
  ['debug_info',         'debug_info']
];

// ── 1. 抽象化マッピングテーブル ─────────────────────────
//   endpoint        → use_case (レイヤ2) → type (レイヤ3)
const MAP = {
  '/login':  { use_case: 'Login',       type: 'AUTH'   },
  '/logout': { use_case: 'Logout',      type: 'AUTH'   },
  '/browse': { use_case: 'ViewPage',    type: 'READ'   },
  '/edit':   { use_case: 'EditContent', type: 'UPDATE' },
  '/profile': { use_case: 'Profile',    type: 'UPDATE' },
  '/search':  { use_case: 'Search',     type: 'READ' }
};
// ──────────────────────────────────────────────────────

const app = express();
// JSON および URL エンコード形式のボディをパース
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const getClientIP = req => (req.headers['x-forwarded-for'] || req.ip)
  .split(',')[0].trim();

// ── ロギングミドルウェア ─────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const now = Date.now();
    const ua = req.get('user-agent') || '-';
    const payload = req.token ? extractPayload(req.token) : req.invalidPayload;
    const session = req.token ? SESSIONS.get(req.token) : null;
    const log = {
      timestamp: new Date(start).toISOString(),
      epoch_ms: start,
      user_id: req.user ? req.user.user_id : 'guest',
      session_id: req.token ? req.token.slice(-8) : 'guest',
      user_role: req.user && req.user.role ? req.user.role : '-',
      auth_method: req.user ? 'jwt' : 'none',
      ip: getClientIP(req),
      geo_location: '-',
      user_agent: ua,
      device_type: /mobile/i.test(ua) ? 'mobile' : 'pc',
      platform: /Windows/i.test(ua) ? 'Windows'
               : /Android/i.test(ua) ? 'Android'
               : /Mac/i.test(ua) ? 'Mac'
               : /Linux/i.test(ua) ? 'Linux' : '-',
      method: req.method,
      endpoint: req.path,
      use_case: MAP[req.path]?.use_case || 'unknown',
      type: MAP[req.path]?.type || 'unknown',
      target_id: req.params?.id || req.body?.id || req.query?.id || '',
      endpoint_group: req.path.split('/')[1] || '',
      referrer: req.get('referer') || '',
      api_version: ((req.path.split('/')[1] || '').match(/^v\d+/) || [''])[0],
      status_code: res.statusCode,
      response_time_ms: now - start,
      content_length: res.get('content-length') || 0,
      success: res.statusCode < 400,
      jwt_payload_sub: payload ? (payload.sub || payload.user_id || '') : '',
      jwt_payload_exp: payload ? payload.exp || '' : '',
      token_reuse_detected: !!req.tokenReuse,
      login_state: req.user ? 'logged_in' : 'guest',
      time_since_login: session ? now - session.loginTime : '',
      actions_in_session: session ? session.actionCount : '',
      previous_action: session ? session.lastAction : '',
      next_action_expected: '',
      label: req.logLabel || 'unknown',
      abnormal_type: req.abnormalType || '',
      severity: req.severity || '',
      comment: req.comment || '',
      debug_info: req.debugInfo ? JSON.stringify(req.debugInfo) : ''
    };
    writeLog(log);
    if (session) {
      session.actionCount++;
      session.lastAction = MAP[req.path]?.use_case || req.path;
    }
  });
  next();
});

// ── 2. ログファイル準備 ───────────────────────────────
if (!fs.existsSync(LOG_DIR))  fs.mkdirSync(LOG_DIR, { recursive: true });
if (!fs.existsSync(REQUEST_LOG)) {
  const header = FIELDS.map(f => f[0]).join(',') + '\n';
  fs.writeFileSync(REQUEST_LOG, header, 'utf8');
}

function writeLog(obj) {
  const line = FIELDS.map(([_, key]) =>
    obj[key] !== undefined ? String(obj[key]) : ''
  ).join(',') + '\n';
  fs.appendFile(REQUEST_LOG, line, err => {
    if (err) console.error('Log write error:', err);
  });
}

// ── 3. JWT 認証ミドルウェア ───────────────────────────
function auth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    req.logLabel = 'no_token';
    return res.status(401).json({ error: 'No token supplied' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) {
      req.logLabel = 'invalid_token';
      req.invalidPayload = extractPayload(token) || 'invalid';
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user  = decoded;  // { user_id }
    req.token = token;
    if (REVOKED.has(token)) req.tokenReuse = true;
    next();
  });
}

// ── 4. エンドポイント実装 ─────────────────────────────
// POST /login : JWT 発行
app.post('/login', (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });
  const payload = { user_id, iat: Date.now() };
  const token   = jwt.sign(payload, SECRET, { expiresIn: '1h' });
  SESSIONS.set(token, { loginTime: Date.now(), actionCount: 0, lastAction: 'LOGIN' });
  // ログミドルウェアで正しい値を記録するために設定
  req.user  = payload;
  req.token = token;
  req.logLabel = 'normal';
  res.json({ token });
});

// GET /browse : 認証必須
app.get('/browse', auth, (req, res) => {
  req.logLabel = 'normal';
  res.json({ message: `Welcome, ${req.user.user_id}!` });
});

// POST /edit : 認証必須
app.post('/edit', auth, (req, res) => {
  req.logLabel = 'normal';
  res.json({ message: 'Edit completed (dummy).' });
});

// GET /profile : 認証必須
app.get('/profile', auth, (req, res) => {
  req.logLabel = 'normal';
  res.json({ profile: { user_id: req.user.user_id } });
});

// POST /profile : 認証必須
app.post('/profile', auth, (req, res) => {
  req.logLabel = 'normal';
  res.json({ message: 'Profile updated.' });
});

// GET /search : 認証不要
app.get('/search', (req, res) => {
  req.logLabel = 'normal';
  res.json({ results: [] });
});

// POST /logout : 認証必須
app.post('/logout', auth, (req, res) => {
  req.logLabel = 'normal';
  if (req.token) REVOKED.add(req.token);
  res.json({ message: 'Logged out.' });
});

// ── ログ取得API ─────────────────────────────
async function readChunk(start, end) {
  return new Promise((resolve, reject) => {
    let data = '';
    const s = fs.createReadStream(REQUEST_LOG, { start, end, encoding: 'utf8' });
    s.on('data', c => (data += c));
    s.on('end', () => resolve(data));
    s.on('error', reject);
  });
}

async function tailFile(lines) {
  const { size } = await fs.promises.stat(REQUEST_LOG);
  const chunk = 64 * 1024;
  const ranges = [];
  for (let pos = size; pos > 0 && ranges.length < 100; pos -= chunk) {
    ranges.push({ start: Math.max(0, pos - chunk), end: pos - 1 });
  }
  const parts = await Promise.all(ranges.map(r => readChunk(r.start, r.end)));
  const data = parts.reverse().join('');
  const arr = data.trim().split('\n');
  return arr.slice(-lines);
}

app.get('/logs', async (req, res) => {
  const n = parseInt(req.query.lines || '20', 10);
  try {
    const lines = await tailFile(n);
    res.json({ lines });
  } catch (err) {
    res.status(500).json({ error: 'log_read_failed' });
  }
});

// ── 5. サーバ起動 ────────────────────────────────────
app.listen(PORT, () =>
  console.log(`プレ版サーバ起動 → http://localhost:${PORT}`)
);
