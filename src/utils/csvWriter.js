const fs = require('fs');
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');

function getCsvWriter() {
  const dir = process.env.LOG_DIR || './logs';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const file = path.join(dir, `${new Date().toISOString().slice(0,10)}.csv`);
  return createObjectCsvWriter({
    path: file,
    header: [
      { id: 'ts',         title: 'ts' },
      { id: 'session_id', title: 'session_id' },
      { id: 'user_agent', title: 'user_agent' },
      { id: 'jwt',        title: 'jwt' },
      { id: 'method',     title: 'method' },
      { id: 'url',        title: 'url' },
      { id: 'referer',    title: 'referer' }
    ],
    append: fs.existsSync(file)
  });
}

module.exports = getCsvWriter();
