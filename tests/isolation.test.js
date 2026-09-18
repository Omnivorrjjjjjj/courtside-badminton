import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cloudConfig, adminUid, tournamentId } from '../dist/config.js';

test('frontend and Firebase CLI target the dedicated badminton project', () => {
  const expected = 'courtside-badminton-20260919';
  const rc = JSON.parse(fs.readFileSync(new URL('../.firebaserc', import.meta.url)));
  assert.equal(cloudConfig.projectId, expected);
  assert.equal(rc.projects.default, expected);
  assert.equal(cloudConfig.authDomain, `${expected}.firebaseapp.com`);
  assert.equal(Object.values(rc.projects).every(id => id === expected), true);
});
test('deployed rules use the configured owner and event; credential files are excluded', () => {
  const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.ok(rules.includes(`request.auth.uid == '${adminUid}'`));
  assert.ok(rules.includes(`/badmintonEvents/${tournamentId}`));
  assert.equal(rules.includes('REPLACE_WITH_ADMIN_UID'), false);
  const ignore = fs.readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.ok(ignore.split('\n').includes('.private/'));
});
