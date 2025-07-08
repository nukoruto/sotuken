const assert = require('assert');
const { sessions, tokenMap, cleanupStale, EXPIRE_MS } = require('../src/middlewares/recordSession');

const now = Date.now();

sessions.set('old', { start: now - 2 * EXPIRE_MS, last: now - 2 * EXPIRE_MS });
sessions.set('new', { start: now, last: now });

tokenMap.set('oldToken', { ip: '1.1.1.1', ua: 'test', last: now - 2 * EXPIRE_MS });
tokenMap.set('newToken', { ip: '1.1.1.1', ua: 'test', last: now });

cleanupStale();

assert.strictEqual(sessions.has('old'), false);
assert.strictEqual(sessions.has('new'), true);
assert.strictEqual(tokenMap.has('oldToken'), false);
assert.strictEqual(tokenMap.has('newToken'), true);

console.log('cleanupStale test passed');
