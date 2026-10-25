import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveCookies, resolveMode, resolveTargets, safeErrorCode } from '../src/safety'

test('diagnostics is the safe default; mode typos never send', () => {
  assert.equal(resolveMode(), 'diagnose')
  assert.equal(resolveMode('test-one'), 'test-one')
  assert.throws(() => resolveMode('test'), /INVALID_RUN_MODE/)
})
test('invalid secrets produce only fixed, redacted codes', () => {
  const secret = 'PRIVATE_COOKIE_OR_FRIEND'
  for (const parse of [resolveCookies, resolveTargets]) {
    try {
      parse(secret)
      assert.fail('must reject')
    } catch (error) {
      assert.equal(safeErrorCode(error).includes(secret), false)
    }
  }
  assert.equal(safeErrorCode(new Error(secret)), 'UNEXPECTED_ERROR_REDACTED')
})
test('targets preserve order; empty, duplicate or malformed targets fail closed', () => {
  assert.deepEqual(resolveTargets('[" first ","second"]'), ['first', 'second'])
  for (const data of ['[]', '[" "]', '["same"," same "]', '[1]']) {
    assert.throws(() => resolveTargets(data))
  }
})
test('cookies cannot be sent to a non-Douyin domain', () => {
  assert.throws(() =>
    resolveCookies('[{"name":"n","value":"v","domain":"example.com","path":"/"}]'),
  )
})
