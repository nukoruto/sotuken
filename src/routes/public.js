const r = require('express').Router();
r.get('/', (_, res) => res.json({ ok: true }));
module.exports = r;
