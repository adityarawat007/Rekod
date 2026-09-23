// node test-redact.js  — the one check. Redaction is the ship gate.
const assert = require('assert');
const { fjScrub, fjStorable, fjRedact, fjRedactHeaders, fjRedactUrl, fjRedactBody } = require('./extension/redact.js');

// secrets go
assert.ok(!fjScrub('token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dBjftJeZ4CVPmB92K').includes('eyJ'));
assert.ok(!fjScrub('Authorization: Bearer abcdef1234567890xyz').includes('abcdef1234567890'));
assert.ok(!fjScrub('key sk-abcdefghijklmnopqrstuv').includes('sk-abcdef'));
assert.ok(!fjScrub('ghp_abcdefghijklmnopqrst').includes('ghp_abcdef'));
assert.ok(!fjScrub('AKIAIOSFODNN7EXAMPLE').includes('AKIAIOSFODNN7EXAMPLE'));

// denylisted keys go, at any depth
assert.strictEqual(fjRedact({ password: 'hunter2' }).password, '[redacted]');
assert.strictEqual(fjRedact({ a: { b: { access_token: 'x' } } }).a.b.access_token, '[redacted]');
assert.strictEqual(fjRedact([{ apiKey: 'x' }])[0].apiKey, '[redacted]');

// headers
const h = fjRedactHeaders({ Authorization: 'Bearer x', Cookie: 'sid=1', 'Content-Type': 'application/json' });
assert.strictEqual(h.Authorization, '[redacted]');
assert.strictEqual(h.Cookie, '[redacted]');
assert.strictEqual(h['Content-Type'], 'application/json');

// url query params
assert.ok(fjRedactUrl('https://api.example/v1/x?token=abc123&page=2').includes('token=%5Bredacted%5D'));
assert.ok(fjRedactUrl('https://api.example/v1/x?token=abc123&page=2').includes('page=2'));

// json bodies: caught by key even when the value looks harmless
assert.ok(!fjRedactBody('{"session":"abc","id":7}').includes('abc'));
assert.ok(fjRedactBody('{"session":"abc","id":7}').includes('7'));

// emails masked, domain kept
assert.strictEqual(fjScrub('user user@example.com not found'), 'user [email]@example.com not found');

// --- the important negative cases: do not eat real debug info ---
assert.strictEqual(fjScrub('GET /v2/render/job_8813 failed with 500'), 'GET /v2/render/job_8813 failed with 500');
assert.strictEqual(fjRedact({ userId: 42, status: 'queued' }).userId, 42);
assert.strictEqual(fjRedact({ tokenCount: 128 }).tokenCount, 128); // 'tokenCount' != 'token'
assert.ok(fjRedactUrl('https://api.example/v1/render?page=2').endsWith('?page=2'));

// --- storability: Postgres rejects NUL and lone surrogates in text/jsonb (22P05) ---
assert.strictEqual(fjScrub('ab\u0000cd'), 'abcd');
assert.strictEqual(fjScrub('a\u0007b\u001Fc\u007F'), 'abc');
assert.strictEqual(fjScrub('keep\tthese\nand\rthose'), 'keep\tthese\nand\rthose');
assert.ok(!JSON.stringify(fjRedact({ body: 'x\u0000y' })).includes('u0000'), 'nested strings are storable');
assert.ok(!JSON.stringify(fjRedact({ 'k\u0000ey': 1 })).includes('u0000'), 'object keys are storable too');
assert.ok(!JSON.stringify(fjRedactBody('{"a":"p\u0000q"}')).includes('u0000'), 'json bodies are storable');
assert.strictEqual(fjStorable('a\uD800b'), 'a\uFFFDb');          // lone high surrogate
assert.strictEqual(fjStorable('a\uDC00b'), 'a\uFFFDb');          // lone low surrogate
assert.strictEqual(fjStorable('ok \u{1F353} pair'), 'ok \u{1F353} pair');   // real pair survives
// and the emoji-bearing payload still round-trips through JSON
assert.strictEqual(JSON.parse(JSON.stringify(fjRedact({ m: 'jam \u{1F353}' }))).m, 'jam \u{1F353}');

console.log('redaction ok');
