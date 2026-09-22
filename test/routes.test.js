'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFields } = require('../srv/routes');

test('accepts a valid recipient email for an application', () => {
  const fields = parseFields(JSON.stringify({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    recipientEmail: 'hr@example.com',
    consent: true
  }));

  assert.equal(fields.recipientEmail, 'hr@example.com');
});

test('rejects an invalid recipient email for an application', () => {
  assert.throws(() => parseFields(JSON.stringify({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    recipientEmail: 'not-an-email',
    consent: true
  })), /Empfänger-E-Mail-Adresse/);
});
