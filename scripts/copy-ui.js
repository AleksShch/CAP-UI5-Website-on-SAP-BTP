'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const source = path.join(projectRoot, 'app', 'job-application', 'webapp');
const destination = path.join(projectRoot, 'gen', 'srv', 'app', 'job-application', 'webapp');
const generatedDb = path.join(projectRoot, 'gen', 'db');

if (!fs.existsSync(path.join(projectRoot, 'gen', 'srv', 'package.json'))) {
  throw new Error('CAP build output is missing. Run cds build before copying the UI.');
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.cpSync(source, destination, { recursive: true });

for (const name of fs.readdirSync(generatedDb)) {
  if (name === '.local-schema-state' || /\.sqlite(?:-(?:shm|wal))?$/.test(name)) {
    fs.rmSync(path.join(generatedDb, name), { force: true });
  }
}

console.log(`Copied UI resources to ${path.relative(projectRoot, destination)} and removed local SQLite build artifacts`);
