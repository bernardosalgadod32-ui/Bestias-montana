import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authErrorMessage, cleanAuthUrl, EXPIRED_LINK_MESSAGE, passwordValidation, readAuthLink, recoveryUserAfterEvent } from '../lib/auth-flow';

test('captures recovery intent without retaining credentials from callback URLs', () => {
  const state = readAuthLink('https://app.example/#access_token=private-access&refresh_token=private-refresh&type=recovery');
  assert.deepEqual(state, { recovery: true, callback: true, error: '' });
  assert.ok(!JSON.stringify(state).includes('private'));
  assert.deepEqual(readAuthLink('https://app.example/'), { recovery: false, callback: false, error: '' });
  assert.equal(readAuthLink('https://app.example/#type=recovery').recovery, false);
});

test('an expired or reused callback cannot activate recovery, and error text is not trusted', () => {
  const state = readAuthLink('https://app.example/#type=recovery&error=access_denied&error_code=otp_expired&error_description=untrusted-content');
  assert.equal(state.recovery, false);
  assert.equal(state.error, EXPIRED_LINK_MESSAGE);
  assert.equal(authErrorMessage({ code: 'otp_expired', message: 'untrusted-content' }), EXPIRED_LINK_MESSAGE);
  assert.ok(!authErrorMessage({ message: 'private-token' }).includes('private-token'));
});

test('recovery survives session initialization, refresh and user update until explicitly completed', () => {
  let user: string | null = recoveryUserAfterEvent('INITIAL_SESSION', 'pending', 'user-a');
  for (const event of ['PASSWORD_RECOVERY', 'TOKEN_REFRESHED', 'SIGNED_IN', 'USER_UPDATED']) {
    user = recoveryUserAfterEvent(event, user, 'user-a');
    assert.equal(user, 'user-a');
  }
  assert.equal(recoveryUserAfterEvent('INITIAL_SESSION', user, 'user-a'), 'user-a');
  assert.equal(recoveryUserAfterEvent('SIGNED_IN', user, 'user-b'), null);
  assert.equal(recoveryUserAfterEvent('SIGNED_OUT', user, null), null);
  assert.equal(recoveryUserAfterEvent('INITIAL_SESSION', null, 'user-a'), null);
});

test('callback cleanup removes authentication data while preserving unrelated search parameters', () => {
  assert.equal(cleanAuthUrl('https://app.example/?view=team&error=access_denied&error_description=private#access_token=private&type=recovery'), '/?view=team');
});

test('new passwords require length and an exact confirmation', () => {
  assert.ok(passwordValidation('short', 'short'));
  assert.ok(passwordValidation('long-password', 'Long-password'));
  assert.ok(passwordValidation('long-password ', 'long-password'));
  assert.equal(passwordValidation('long-password', 'long-password'), '');
});
