#!/usr/bin/env node
import path from 'node:path';
import { readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';

// Node's built-in test runner requires explicit file paths and does not expand
// globs in a cross-platform way when invoked from npm scripts. We compile the
// TypeScript tests ahead of time, gather the resulting `.test.js` files, and
// pass them directly to `node --test` so contributors on any shell get a
// consistent experience.
const variant = process.argv[2] ?? 'unit';
const root = path.resolve('build', 'tests', 'tests', variant);

function collectTests(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectTests(fullPath);
    }
    if (entry.isFile() && entry.name.endsWith('.test.js')) {
      return [fullPath];
    }
    return [];
  });
}

let files = [];
try {
  files = collectTests(root);
} catch (error) {
  console.error(`Failed to read tests from "${root}": ${error.message}`);
  process.exit(1);
}

if (files.length === 0) {
  console.error(`No compiled tests were found under "${root}".`);
  process.exit(1);
}

const child = spawn(process.execPath, ['--expose-gc', '--test', '--test-reporter=spec', ...files], {
  stdio: 'inherit',
});

child.on('close', (code) => {
  process.exit(code);
});
