import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import Module from 'node:module'
import test from 'node:test'
import ts from 'typescript'

// Load the production policy without Next's server runtime or a real login.
const filename = fileURLToPath(new URL('../lib/authPolicy.ts', import.meta.url))
const policyModule = new Module(filename)
policyModule._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, filename)
const { safeNextPath, canAccessWorkspace } = policyModule.exports
const master = '00000000-0000-0000-0000-000000000001'
const staff = '00000000-0000-0000-0000-000000000002'
const claims = (sub, kind, methods) => ({ sub, growth_desk_access: kind, amr: methods.map(method => ({ method })) })

test('preserves an internal destination and query string', () => {
  assert.equal(safeNextPath('/quotes?status=issued#register'), '/quotes?status=issued#register')
})
test('rejects external, protocol-relative and backslash redirects', () => {
  for (const value of ['https://example.org', '//example.org', '/\\example.org', '/foo\nbar', 'quotes', null]) {
    assert.equal(safeNextPath(value), '/')
  }
})
test('avoids redirect loops after path normalisation', () => {
  for (const value of ['/login?next=/quotes', '/auth/callback', '/quotes/../login']) assert.equal(safeNextPath(value), '/')
})
test('allows the configured master with a verified password claim', () => {
  assert.equal(canAccessWorkspace(claims(master, 'master', ['password']), master), true)
})
test('rejects another user claiming master access', () => {
  assert.equal(canAccessWorkspace(claims(staff, 'master', ['password']), master), false)
})
test('requires Microsoft staff to have an OAuth session and signed workspace claim', () => {
  assert.equal(canAccessWorkspace(claims(staff, 'm365', ['oauth']), master), true)
  assert.equal(canAccessWorkspace(claims(staff, undefined, ['oauth']), master), false)
  assert.equal(canAccessWorkspace(claims(staff, 'm365', ['password']), master), false)
})
test('does not let Microsoft OAuth substitute for master password access', () => {
  assert.equal(canAccessWorkspace(claims(master, 'master', ['oauth']), master), false)
  assert.equal(canAccessWorkspace(claims(master, 'm365', ['oauth']), master), false)
})
test('fails closed when master configuration or authentication methods are missing', () => {
  assert.equal(canAccessWorkspace(claims(staff, 'm365', ['oauth']), ''), false)
  assert.equal(canAccessWorkspace({ sub: master, growth_desk_access: 'master' }, master), false)
})
test('keeps staff and master sessions valid after adding an MFA method', () => {
  assert.equal(canAccessWorkspace(claims(staff, 'm365', ['oauth', 'totp']), master), true)
  assert.equal(canAccessWorkspace(claims(master, 'master', ['password', 'totp']), master), true)
})
test('rejects mixed password/OAuth sessions and recovery-only sessions', () => {
  assert.equal(canAccessWorkspace(claims(staff, 'm365', ['password', 'oauth']), master), false)
  assert.equal(canAccessWorkspace(claims(master, 'master', ['password', 'oauth']), master), false)
  assert.equal(canAccessWorkspace(claims(master, 'master', ['recovery']), master), false)
})
