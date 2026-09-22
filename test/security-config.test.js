'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const securityDescriptor = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'xs-security.json'), 'utf8')
);

test('administrator role collection grants the ApplicationAdmin scope', () => {
  const adminTemplate = securityDescriptor['role-templates'].find(
    (template) => template.name === 'ApplicationAdmin'
  );
  const adminCollection = securityDescriptor['role-collections'].find(
    (collection) => collection.name === 'HRBewerbung Administrators'
  );

  assert.ok(adminTemplate);
  assert.deepEqual(adminTemplate['scope-references'], ['$XSAPPNAME.ApplicationAdmin']);
  assert.ok(adminCollection);
  assert.deepEqual(adminCollection['role-template-references'], ['$XSAPPNAME.ApplicationAdmin']);
});
