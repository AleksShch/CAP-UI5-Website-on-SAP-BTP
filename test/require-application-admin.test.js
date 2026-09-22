'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const cds = require('@sap/cds');
const requireApplicationAdmin = require('../srv/lib/require-application-admin');

function responseRecorder() {
  return {
    statusCode: null,
    sendStatus(statusCode) {
      this.statusCode = statusCode;
      return this;
    }
  };
}

test('allows users with the ApplicationAdmin role', () => {
  const req = { user: new cds.User({ id: 'admin', roles: ['ApplicationAdmin'] }) };
  const res = responseRecorder();
  let continued = false;

  requireApplicationAdmin(req, res, () => {
    continued = true;
  });

  assert.equal(continued, true);
  assert.equal(res.statusCode, null);
});

test('rejects authenticated users without the ApplicationAdmin role', () => {
  const req = { user: new cds.User({ id: 'employee', roles: [] }) };
  const res = responseRecorder();

  requireApplicationAdmin(req, res, () => assert.fail('must not continue'));

  assert.equal(res.statusCode, 403);
});

test('requests authentication for anonymous users', () => {
  let loginRequested = false;
  const req = {
    user: cds.User.anonymous,
    _login() {
      loginRequested = true;
    }
  };
  const res = responseRecorder();

  requireApplicationAdmin(req, res, () => assert.fail('must not continue'));

  assert.equal(loginRequested, true);
  assert.equal(res.statusCode, null);
});
