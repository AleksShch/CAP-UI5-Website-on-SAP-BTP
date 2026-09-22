'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const databaseFile = path.join(projectRoot, 'db', 'applications.sqlite');
const stateFile = path.join(projectRoot, 'db', '.local-schema-state');
const requiredLandingBlockColumns = [
  'menuItems', 'menuOrientation', 'menuGap', 'menuFontSize', 'menuTextColor', 'menuTextEffect',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'buttonHeight', 'buttonBorderRadius'
];

function hasRequiredColumns() {
  if (!fs.existsSync(databaseFile)) return false;
  try {
    const { DatabaseSync } = require('node:sqlite');
    const database = new DatabaseSync(databaseFile, { readOnly: true });
    const columns = new Set(
      database.prepare('PRAGMA table_info(job_application_LandingBlocks)').all().map((row) => row.name)
    );
    database.close();
    return requiredLandingBlockColumns.every((column) => columns.has(column));
  } catch {
    return false;
  }
}

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(entryPath);
    return /\.(?:cds|csv)$/.test(entry.name) ? [entryPath] : [];
  });
}

const modelFiles = [
  ...collectFiles(path.join(projectRoot, 'db')),
  ...collectFiles(path.join(projectRoot, 'srv'))
].sort();
const hash = crypto.createHash('sha256');
for (const file of modelFiles) {
  hash.update(path.relative(projectRoot, file));
  hash.update(fs.readFileSync(file));
}
const expectedState = hash.digest('hex');
const currentState = fs.existsSync(stateFile) ? fs.readFileSync(stateFile, 'utf8').trim() : '';

if (fs.existsSync(databaseFile) && currentState === expectedState && hasRequiredColumns()) {
  console.log('Local SQLite schema is current.');
  process.exit(0);
}

const cdsCli = path.join(projectRoot, 'node_modules', '@sap', 'cds-dk', 'bin', 'cds.js');
const result = spawnSync(process.execPath, [cdsCli, 'deploy'], {
  cwd: projectRoot,
  stdio: 'inherit'
});
if (result.status !== 0) process.exit(result.status || 1);

fs.writeFileSync(stateFile, `${expectedState}\n`, 'utf8');
console.log('Local SQLite schema was updated.');
