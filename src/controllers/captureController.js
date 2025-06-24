const fs = require('fs');
const path = require('path');

exports.storeScenario = (req, res) => {
  const { name, steps } = req.body;
  if (!name || !steps) return res.status(400).json({ error: 'invalid' });
  const dir = path.join(__dirname, '../scenarios', req.params.type || 'normal');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(req.body, null, 2));
  res.json({ saved: true });
};

exports.runScenario = async (req, res) => {
  const puppeteer = require('puppeteer');
  const file = path.join(__dirname, '../scenarios', req.params.type, `${req.params.name}.json`);
  if (!fs.existsSync(file)) return res.status(404).end();
  const { steps } = JSON.parse(fs.readFileSync(file));
  const base = `http://localhost:${process.env.PORT || 3000}`;
  const b = await puppeteer.launch({ headless: true });
  const page = await b.newPage();
  for (const s of steps) {
    const opt = {
      method: s.method,
      body: s.body ? JSON.stringify(s.body) : undefined,
      headers: { 'Content-Type': 'application/json' }
    };
    await page.evaluate((u, o) => fetch(u, o), base + s.url, opt);
  }
  await b.close();
  res.json({ executed: true });
};
