const crypto = require('crypto');
const csv = require('../utils/csvWriter');
const { v4: uuid } = require('uuid');

module.exports = function recordSession(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const bodyHash = crypto.createHash('md5')
                           .update(JSON.stringify(req.body || {}))
                           .digest('hex');

    csv.writeRecords([{
      ts: new Date().toISOString(),
      session_id: req.sessionID || uuid(),
      user_id:    req.user ? req.user.id : 'guest',
      ip:         req.ip,
      method:     req.method,
      url:        req.originalUrl,
      status:     res.statusCode,
      jwt_valid:  req.user ? 1 : 0,
      body_hash:  bodyHash
    }]).catch(console.error);
  });
  next();
};
