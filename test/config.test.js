'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('environment template never contains assigned secret-looking values', () => {
  const fs = require('fs');
  const path = require('path');
  const template = fs.readFileSync(path.resolve(__dirname, '..', '.env.example'), 'utf8');

  assert.doesNotMatch(template, /-----BEGIN (?:RSA )?PRIVATE KEY-----/);
  assert.doesNotMatch(template, /\bsk_(?:live|test)_[A-Za-z0-9]+/);
});
