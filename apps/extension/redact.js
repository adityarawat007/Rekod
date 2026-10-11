// Runs in MAIN world before capture.js. Also require()-able from node for the test.
// Ship gate: nothing leaves the tab unredacted.
//
// `var`, not `const`: worker.js re-injects into tabs that already have the
// manifest's copy, and a re-declared `const` throws before capture.js can read
// these. capture.js shares this top-level scope, so an IIFE guard is not an
// option. Re-running is a no-op — every binding here is a literal.

var FJ_DENY_HEADERS = new Set([
  'authorization', 'cookie', 'set-cookie', 'x-api-key', 'x-auth-token',
  'proxy-authorization', 'x-csrf-token', 'x-supabase-auth',
]);

// Matched against object keys AND url query params.
var FJ_DENY_KEY = /^(pass(word|wd)?|token|access_token|refresh_token|id_token|secret|client_secret|api_?key|authorization|auth|session|jwt|otp|pin|cvv|card(_?number)?|ssn|aadhaar|pan)$/i;
// ...and any key that merely CONTAINS one of these (newPassword, x-api-key,
// stripe_signature). The exact list above catches the short ones (pin, otp)
// that would over-match as substrings.
var FJ_DENY_CONTAINS = /(password|passwd|secret|token|api[_-]?key|signature|credential|private[_-]?key|session[_-]?id)/i;
// URL params only, never JSON keys: an API's own `code` / `state` fields are
// worth reading, but the same names in a URL are OAuth and signed-URL secrets.
var FJ_DENY_URL_KEY = /^(code|state|sig|signature|x-amz-signature|x-amz-credential|x-goog-signature|x-goog-credential)$/i;
var fjDenyKey = (k) => FJ_DENY_KEY.test(k) || FJ_DENY_CONTAINS.test(k);

var FJ_REDACT_EMAILS = true; // ponytail: flip off if masked emails start hiding real bugs.

var FJ_PATTERNS = [
  /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, // JWT
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g,                 // stripe-style
  /\bsk-[A-Za-z0-9]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g,                                 // github
  /\bAKIA[0-9A-Z]{16}\b/g,                                           // aws
  /\bAIza[0-9A-Za-z_-]{35}/g,                                        // google api key
];
var FJ_EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// Postgres text/jsonb cannot hold a NUL, and JSON.stringify would emit it as a
// literal \u0000 escape that PostgREST rejects with 22P05. Lone surrogates break
// it the same way. Strip both here, so every captured string is storable.
var FJ_CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
var FJ_LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function fjStorable(s) {
  return typeof s === 'string' ? s.replace(FJ_CTRL, '').replace(FJ_LONE, '\uFFFD') : s;
}

function fjScrub(s) {
  if (typeof s !== 'string') return s;
  let out = fjStorable(s);
  for (const rx of FJ_PATTERNS) out = out.replace(rx, '[redacted]');
  if (FJ_REDACT_EMAILS) out = out.replace(FJ_EMAIL, (m) => '[email]@' + m.split('@')[1]);
  return out;
}

function fjRedact(v, depth = 0) {
  if (depth > 6) return '[deep]';
  if (typeof v === 'string') return fjScrub(v);
  if (Array.isArray(v)) return v.map((x) => fjRedact(x, depth + 1));
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      out[fjStorable(k)] = fjDenyKey(k) ? '[redacted]' : fjRedact(val, depth + 1);
    }
    return out;
  }
  return v;
}

function fjRedactHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h || {})) {
    out[k] = FJ_DENY_HEADERS.has(k.toLowerCase()) ? '[redacted]' : fjScrub(v);
  }
  return out;
}

// ?token=abc is the most common leak of all.
function fjRedactUrl(u) {
  try {
    const base = typeof location !== 'undefined' ? location.href : 'https://local.invalid';
    const url = new URL(u, base);
    const hit = (k) => fjDenyKey(k) || FJ_DENY_URL_KEY.test(k);
    for (const k of [...url.searchParams.keys()]) {
      if (hit(k)) url.searchParams.set(k, '[redacted]');
    }
    // #access_token=… — an implicit-flow redirect carries its secret in the
    // fragment, which never reaches a server but does reach the console.
    if (url.hash.includes('=')) {
      const frag = new URLSearchParams(url.hash.slice(1));
      for (const k of [...frag.keys()]) if (hit(k)) frag.set(k, '[redacted]');
      url.hash = frag.toString();
    }
    return fjScrub(url.toString());
  } catch {
    return fjScrub(String(u));
  }
}

// a=b&c=d with no whitespace: an application/x-www-form-urlencoded body.
var FJ_FORM = /^[^\s=&{}[\]]+=[^\s]*$/;

// Parse-then-redact so denylisted keys inside JSON bodies are caught by key, not just by pattern.
function fjRedactBody(text) {
  if (typeof text !== 'string') return text;
  try {
    return JSON.stringify(fjRedact(JSON.parse(text)));
  } catch {
    if (FJ_FORM.test(text)) {
      const f = new URLSearchParams(text);
      for (const k of [...f.keys()]) if (fjDenyKey(k)) f.set(k, '[redacted]');
      return fjScrub(f.toString());
    }
    return fjScrub(text);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fjScrub, fjStorable, fjRedact, fjRedactHeaders, fjRedactUrl, fjRedactBody };
}
