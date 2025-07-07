const crypto = require('crypto');
const csv = require('../utils/csvWriter');
const { v4: uuid } = require('uuid');

function lookupRegion(ip) {
  if (!ip) return '-';
  const first = parseInt(ip.split('.')[0], 10);
  if (first <= 126) return 'NA';
  if (first <= 191) return 'EU';
  if (first <= 223) return 'AP';
  return '-';
}

// セッションおよびトークン単位の状態保存
const sessions = new Map(); // session_id -> {start,last,prev,repeat}
const tokenMap = new Map(); // token -> {ip, ua}

module.exports = function recordSession(req, res, next) {
  // セッションIDの取得・生成
  let sid = req.cookies && req.cookies.sid;
  if (!sid) {
    sid = uuid();
    res.cookie('sid', sid, { httpOnly: true });
  }

  // セッション情報の取得・初期化
  let info = sessions.get(sid);
  if (!info) {
    info = { start: Date.now(), last: null, prev: '-', repeat: 0, lastBodyKeys: {} };
    sessions.set(sid, info);
  }

  res.on('finish', () => {
    const now = Date.now();
    const delta   = info.last ? now - info.last : 0;
    const elapsed = now - info.start;
    const rapid   = delta > 0 && delta < 1000 ? 1 : 0;

    const bodyStr = JSON.stringify(req.body || {});
    const bodyHash = crypto.createHash('md5').update(bodyStr).digest('hex');
    const bodyKeys = Object.keys(req.body || {}).sort().join('|');

    const ua   = req.get('user-agent') || '-';
    const ref  = req.get('referer') || '-';
    const ip   = req.ip;
    const regionStr = lookupRegion(ip);

    // JWT 情報抽出
    let jwtValid = 0, jwtIat = '-', jwtExp = '-';
    let tokenAlert = 0;
    const auth = req.get('authorization');
    if (auth && auth.startsWith('Bearer ')) {
      const token = auth.split(' ')[1];
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        jwtValid = 1;
        jwtIat = payload.iat || '-';
        jwtExp = payload.exp || '-';

        const existing = tokenMap.get(token);
        if (!existing) {
          tokenMap.set(token, { ip, ua });
        } else if (existing.ip !== ip || existing.ua !== ua) {
          tokenAlert = 1;
          tokenMap.set(token, { ip, ua });
        }
      } catch (_) {
        jwtValid = 0;
      }
    }

    const current = `${req.method} ${req.originalUrl}`;
    let repeatCnt = 1;
    if (info.prev === current) {
      info.repeat = (info.repeat || 0) + 1;
      repeatCnt = info.repeat;
    } else {
      info.repeat = 1;
      repeatCnt = 1;
    }

    // 簡易パターンチェック: login→logout→login
    let pattern = '-';
    info.ops = info.ops || [];
    info.ops.push(current);
    if (info.ops.length > 3) info.ops.shift();
    if (info.ops.join('>') === 'POST /login>POST /logout>POST /login') {
      pattern = 'login_logout_login';
    }

    csv.writeRecords([{\
      ts: new Date(now).toISOString(),\
      session_id: sid,\
      user_id: req.user ? req.user.id || req.user.user_id : 'guest',\
      ip,\
      region: regionStr,\
      method: req.method,\
      url: req.originalUrl,\
      status: res.statusCode,\
      jwt_valid: jwtValid,\
      jwt_iat: jwtIat,\
      jwt_exp: jwtExp,\
      user_agent: ua,\
      referer: ref,\
      delta,\
      elapsed,\
      rapid,\
      prev: info.prev || '-',\
      repeat_cnt: repeatCnt,\
      pattern,\
      token_alert: tokenAlert,\
      body_hash: bodyHash,\
      body_keys: bodyKeys\
    }]).catch(console.error);

    info.last = now;
    info.prev = current;
    info.lastBodyKeys[req.originalUrl] = bodyKeys;
  });

  next();
};
