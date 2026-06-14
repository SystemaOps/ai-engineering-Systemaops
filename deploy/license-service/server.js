/**
 * License service — real server-side access enforcement.
 *
 * Zero npm dependencies (Node stdlib only) so it is trivial to self-host.
 * Runs behind Caddy, which uses /auth/check as a forward_auth target to
 * gate /content/* and reverse-proxies /api/* to this service.
 *
 * Endpoints
 *   GET  /healthz          → 200 (liveness)
 *   GET  /auth/check       → 200 if a valid aifs_lic cookie is present,
 *                            else 401. Caddy calls this before serving
 *                            paid content.
 *   POST /api/activate     → body {"key":"AIFS-...."}. Verifies the key's
 *                            HMAC, sets the aifs_lic cookie, returns
 *                            {ok:true}. Works on any device.
 *   POST /api/issue        → body {"session_id":"cs_..."}. Verifies the
 *                            Stripe Checkout Session is paid (live call to
 *                            the Stripe API), sets the cookie, and returns
 *                            {ok:true, key} so the buyer can reactivate on
 *                            other devices. Used by the post-payment
 *                            redirect. Needs STRIPE_SECRET_KEY.
 *
 * Secrets (env, never in code — see deploy/STRIPE-SETUP.md):
 *   LICENSE_SECRET       required. Signs license keys + cookies.
 *   STRIPE_SECRET_KEY    optional. Enables /api/issue (sk_live_… / sk_test_…).
 *   COOKIE_SECURE        "1" in production (HTTPS). Default off for local.
 *   COOKIE_DOMAIN        optional. e.g. ".example.com".
 *   TOKEN_TTL_DAYS       cookie lifetime. Default 3650 (lifetime access).
 *   PORT                 default 8787.
 */
'use strict';

var http = require('http');
var https = require('https');
var crypto = require('crypto');

var SECRET = process.env.LICENSE_SECRET || '';
var STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
var COOKIE_SECURE = process.env.COOKIE_SECURE === '1';
var COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || '';
var TOKEN_TTL_DAYS = parseInt(process.env.TOKEN_TTL_DAYS || '3650', 10);
var PORT = parseInt(process.env.PORT || '8787', 10);
var COOKIE_NAME = 'aifs_lic';

/* ── base32 (RFC 4648, no padding) ───────────────────────────────────── */
var B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32encode(buf) {
  var bits = 0, value = 0, out = '';
  for (var i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32decode(str) {
  var clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  var bits = 0, value = 0, out = [];
  for (var i = 0; i < clean.length; i++) {
    var idx = B32.indexOf(clean[i]);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

/* ── crypto helpers ──────────────────────────────────────────────────── */
function hmac(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest();
}

function timingEqual(a, b) {
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch (e) { return false; }
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ── license keys: AIFS-XXXX-XXXX-XXXX-XXXX ──────────────────────────── */
// 10 bytes (5 payload + 5 signature) → 16 base32 chars → four 4-char groups.

function keyFromPayload(payload) {
  var sig = hmac(payload).slice(0, 5);
  var combined = Buffer.concat([payload, sig]);              // 10 bytes
  var b32 = base32encode(combined);                          // 16 chars
  return 'AIFS-' + b32.slice(0, 4) + '-' + b32.slice(4, 8) +
    '-' + b32.slice(8, 12) + '-' + b32.slice(12, 16);
}

function mintRandomKey() {
  return keyFromPayload(crypto.randomBytes(5));
}

// Deterministic key for a Stripe customer/session so it can be regenerated.
function mintKeyForSeed(seed) {
  return keyFromPayload(hmac('seed:' + seed).slice(0, 5));
}

function verifyKey(raw) {
  // Drop the "AIFS-" prefix first — its letters are all valid base32, so a
  // blind base32 filter would keep them and break the length check.
  var s = String(raw || '').toUpperCase().replace(/\s+/g, '').replace(/^AIFS-?/, '');
  var b32 = s.replace(/[^A-Z2-7]/g, '');
  if (b32.length !== 16) return false;
  var combined = base32decode(b32);
  if (combined.length !== 10) return false;
  var payload = combined.slice(0, 5);
  var sig = combined.slice(5, 10);
  return timingEqual(sig, hmac(payload).slice(0, 5));
}

/* ── cookie token ────────────────────────────────────────────────────── */
function mintToken() {
  var body = b64url(JSON.stringify({ exp: Date.now() + TOKEN_TTL_DAYS * 86400000 }));
  var sig = b64url(hmac(body));
  return body + '.' + sig;
}

function verifyToken(token) {
  if (!token || token.indexOf('.') < 0) return false;
  var parts = token.split('.');
  if (parts.length !== 2) return false;
  var expected = b64url(hmac(parts[0]));
  if (!timingEqual(Buffer.from(parts[1]), Buffer.from(expected))) return false;
  try {
    var data = JSON.parse(Buffer.from(parts[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    return data.exp && Date.now() < data.exp;
  } catch (e) { return false; }
}

function cookieHeader() {
  var bits = [COOKIE_NAME + '=' + mintToken(), 'HttpOnly', 'Path=/',
    'Max-Age=' + (TOKEN_TTL_DAYS * 86400), 'SameSite=Lax'];
  if (COOKIE_SECURE) bits.push('Secure');
  if (COOKIE_DOMAIN) bits.push('Domain=' + COOKIE_DOMAIN);
  return bits.join('; ');
}

function getCookie(req, name) {
  var raw = req.headers.cookie || '';
  var m = raw.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

/* ── Stripe session verification (stdlib HTTPS) ──────────────────────── */
function verifyStripeSession(sessionId) {
  return new Promise(function (resolve, reject) {
    if (!STRIPE_SECRET_KEY) return reject(new Error('stripe-not-configured'));
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId || '')) return reject(new Error('bad-session-id'));
    var opts = {
      hostname: 'api.stripe.com',
      path: '/v1/checkout/sessions/' + encodeURIComponent(sessionId),
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + STRIPE_SECRET_KEY }
    };
    var r = https.request(opts, function (res) {
      var body = '';
      res.on('data', function (c) { body += c; });
      res.on('end', function () {
        try {
          var s = JSON.parse(body);
          if (res.statusCode !== 200) return reject(new Error('stripe-' + res.statusCode));
          resolve(s);
        } catch (e) { reject(new Error('stripe-parse')); }
      });
    });
    r.on('error', reject);
    r.setTimeout(10000, function () { r.destroy(new Error('stripe-timeout')); });
    r.end();
  });
}

/* ── HTTP ────────────────────────────────────────────────────────────── */
function send(res, code, obj, extraHeaders) {
  var headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (extraHeaders) for (var k in extraHeaders) headers[k] = extraHeaders[k];
  res.writeHead(code, headers);
  res.end(obj === null ? '' : JSON.stringify(obj));
}

function readBody(req) {
  return new Promise(function (resolve) {
    var data = '';
    req.on('data', function (c) { data += c; if (data.length > 1e5) req.destroy(); });
    req.on('end', function () { try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); } });
  });
}

var server = http.createServer(function (req, res) {
  var url = req.url.split('?')[0];

  if (url === '/healthz') return send(res, 200, { ok: true });

  // Caddy forward_auth target.
  if (url === '/auth/check') {
    return verifyToken(getCookie(req, COOKIE_NAME))
      ? send(res, 200, { ok: true })
      : send(res, 401, { ok: false });
  }

  if (url === '/api/activate' && req.method === 'POST') {
    return readBody(req).then(function (body) {
      if (verifyKey(body.key)) {
        send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader() });
      } else {
        send(res, 400, { ok: false, error: 'invalid-key' });
      }
    });
  }

  if (url === '/api/issue' && req.method === 'POST') {
    return readBody(req).then(function (body) {
      verifyStripeSession(body.session_id).then(function (s) {
        var paid = s.payment_status === 'paid' || s.status === 'complete';
        if (!paid) return send(res, 402, { ok: false, error: 'not-paid' });
        var seed = s.customer || s.customer_details && s.customer_details.email || s.id;
        var key = mintKeyForSeed(seed);
        send(res, 200, { ok: true, key: key }, { 'Set-Cookie': cookieHeader() });
      }).catch(function (e) {
        var code = e.message === 'stripe-not-configured' ? 501 : 400;
        send(res, code, { ok: false, error: e.message });
      });
    });
  }

  send(res, 404, { ok: false, error: 'not-found' });
});

// Exported for keygen.js / tests.
module.exports = { mintRandomKey: mintRandomKey, mintKeyForSeed: mintKeyForSeed, verifyKey: verifyKey };

if (require.main === module) {
  if (!SECRET || SECRET.length < 16) {
    console.error('FATAL: LICENSE_SECRET is missing or too short (need >=16 chars).');
    process.exit(1);
  }
  server.listen(PORT, function () {
    console.log('license-service on :' + PORT +
      ' (stripe ' + (STRIPE_SECRET_KEY ? 'configured' : 'OFF') +
      ', secure-cookie ' + (COOKIE_SECURE ? 'on' : 'off') + ')');
  });
}
