function extractPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('invalid');
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload);
  } catch (_) {
    return null;
  }
}

module.exports = { extractPayload };
