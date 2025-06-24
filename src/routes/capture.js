const r = require('express').Router();
const c = require('../controllers/captureController');
r.put('/:type', c.storeScenario);
r.post('/:type/:name', c.runScenario);
module.exports = r;
