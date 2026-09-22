'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CaptchaStore } = require('../srv/lib/captcha');

function createStore(overrides = {}) {
  return new CaptchaStore({
    ttlMs: 1000,
    now: () => 100,
    randomInt: () => 4728,
    randomBytes: () => Buffer.from('captcha-id'),
    ...overrides
  });
}

test('creates and verifies a one-time four-digit challenge', () => {
  const store = createStore();
  const challenge = store.create();

  assert.equal(challenge.id, Buffer.from('captcha-id').toString('base64url'));
  assert.equal(challenge.expiresInSeconds, 1);
  assert.equal(Buffer.isBuffer(challenge.image), true);
  assert.equal(store.verify(challenge.id, '4728'), true);
  assert.equal(store.verify(challenge.id, '4728'), false);
});

test('rejects wrong and expired answers', () => {
  const wrongStore = createStore();
  const wrongChallenge = wrongStore.create();
  assert.equal(wrongStore.verify(wrongChallenge.id, '4729'), false);

  let now = 100;
  const expiredStore = createStore({ now: () => now });
  const expiredChallenge = expiredStore.create();
  now = 1101;
  assert.equal(expiredStore.verify(expiredChallenge.id, '4728'), false);
});
