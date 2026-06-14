/**
 * License-key generator / validator CLI.
 *
 * Uses the same LICENSE_SECRET as the running service, so keys minted
 * here validate there and vice-versa.
 *
 *   LICENSE_SECRET=... node keygen.js 25          # mint 25 random keys
 *   LICENSE_SECRET=... node keygen.js --check KEY  # validate one key
 *
 * Deliver one random key per sale (track which you've handed out). For
 * the automatic redirect-based fulfillment you don't need this — see
 * deploy/STRIPE-SETUP.md.
 */
'use strict';

if (!process.env.LICENSE_SECRET) {
  console.error('Set LICENSE_SECRET first, e.g.  LICENSE_SECRET=$(openssl rand -hex 24) node keygen.js 25');
  process.exit(1);
}

var svc = require('./server.js');
var args = process.argv.slice(2);

if (args[0] === '--check') {
  var key = args[1] || '';
  console.log(key + '  ->  ' + (svc.verifyKey(key) ? 'VALID' : 'invalid'));
  process.exit(svc.verifyKey(key) ? 0 : 1);
}

var n = parseInt(args[0] || '10', 10);
if (!(n > 0)) n = 10;
for (var i = 0; i < n; i++) console.log(svc.mintRandomKey());
