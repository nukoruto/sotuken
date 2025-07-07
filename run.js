const { spawn } = require('child_process');
const path = require('path');

const pythonCmd = process.platform === 'win32' ? 'py' : 'python';

const server = spawn('node', [path.join('resource', 'server.js')], {
  stdio: 'inherit'
});

const attack = spawn(pythonCmd, ['attack.py'], { stdio: 'inherit' });

attack.on('exit', code => {
  server.kill();
  process.exit(code);
});
