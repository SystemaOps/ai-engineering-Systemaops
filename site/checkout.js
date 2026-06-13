/**
 * Stripe checkout + license activation (client-side).
 *
 * ── How money + access flow here ─────────────────────────────────────
 *  1. The "Buy with Stripe" button sends the buyer to your Stripe
 *     Payment Link (CONFIG.paymentLink). You create that link once in the
 *     Stripe Dashboard → Payment Links and point its post-payment
 *     redirect at:   https://YOUR-DOMAIN/access.html?purchase=success
 *  2. After paying, the buyer receives a license key (see STRIPE-SETUP.md
 *     for the delivery options) and enters it on this page.
 *  3. A valid key sets  localStorage 'aifs:access' = 'granted'  — the same
 *     flag lesson.html checks before rendering paid content.
 *
 * ── SECURITY MODEL — read before launch ──────────────────────────────
 *  This is a CLIENT-SIDE gate. Key validation runs in the browser, so a
 *  determined person who reads this file could forge a key, and the
 *  content bundle under /content/ is still served openly. This stops
 *  casual freeloading, NOT piracy.
 *
 *  For hard enforcement (signed keys issued by a Stripe webhook, Caddy
 *  blocking /content/* without a valid token) see STRIPE-SETUP.md →
 *  "Hardening: the fulfillment backend". This file is written so that
 *  upgrade only swaps validateKey() + the fetch in lesson.html; the UI
 *  here stays the same.
 */
(function () {
  'use strict';

  /* ── CONFIG — edit these four values, nothing else ───────────────────── */
  var CONFIG = {
    // Paste your Stripe Payment Link URL (Dashboard → Payment Links).
    // Leave '' to keep the page in "notify me at launch" mode.
    paymentLink: '',

    // Display price only. The real charge is whatever you set in Stripe.
    // e.g. '$149' or '₹12,000'.
    price: '',

    // Support address shown for activation problems.
    supportEmail: 'info@systemaops.com',

    // Where to send the buyer once their key activates.
    afterActivate: 'catalog.html'
  };

  /* ── License keys ────────────────────────────────────────────────────
   * Format:  AIFS-XXXX-XXXX-XXXX-CCCC
   * The last group CCCC is a checksum of the first three. validateKey()
   * recomputes it. Generate valid keys with the snippet in STRIPE-SETUP.md
   * (the same checksum function). Interim scheme — see security note above.
   */
  var KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1

  function checksum(body) {
    var h = 2166136261;
    for (var i = 0; i < body.length; i++) {
      h ^= body.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    var out = '';
    for (var j = 0; j < 4; j++) {
      out += KEY_ALPHABET.charAt(h & 31);
      h = h >>> 5;
    }
    return out;
  }

  function validateKey(raw) {
    var k = String(raw || '').toUpperCase().replace(/\s+/g, '');
    var m = k.match(/^AIFS-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/);
    if (!m) return false;
    var body = 'AIFS-' + m[1] + '-' + m[2] + '-' + m[3];
    return checksum(body) === m[4];
  }

  function grantAccess() {
    try { localStorage.setItem('aifs:access', 'granted'); } catch (e) {}
  }

  function hasAccess() {
    try { return localStorage.getItem('aifs:access') === 'granted'; }
    catch (e) { return false; }
  }

  /* ── Rendering ───────────────────────────────────────────────────────── */

  function renderBuyCard(el) {
    if (hasAccess()) {
      el.innerHTML =
        '<span class="price-soon">✓ Access active</span>' +
        '<p>This device already has full access. Jump back in any time.</p>' +
        '<a class="access-btn" href="' + CONFIG.afterActivate + '">Go to the catalog</a>';
      return;
    }
    if (CONFIG.paymentLink) {
      el.innerHTML =
        (CONFIG.price ? '<span class="price-soon">' + CONFIG.price + '</span>' : '') +
        '<p>One-time purchase. Lifetime access, including every future lesson and ' +
        'update. 7-day money-back guarantee.</p>' +
        '<a class="access-btn" href="' + CONFIG.paymentLink + '" rel="noopener">' +
        'Buy with Stripe →</a>' +
        '<p style="margin-top:14px;font-size:0.8rem">Secure checkout by Stripe. ' +
        'After paying you\'ll get a license key to activate below.</p>';
    } else {
      // Not configured yet — graceful "launching soon" fallback.
      el.innerHTML =
        '<span class="price-soon">Launching soon</span>' +
        '<p>One-time purchase. Lifetime access, including every future lesson and ' +
        'update. 7-day money-back guarantee.</p>' +
        '<a class="access-btn" href="mailto:' + CONFIG.supportEmail +
        '?subject=Notify%20me%20at%20launch%20%E2%80%94%20AI%20Engineering%20from%20SystemaOps">' +
        'Get notified at launch</a>';
    }
  }

  function renderActivation(el) {
    if (hasAccess()) {
      el.innerHTML =
        '<p>✓ Your license is active on this device. ' +
        '<a href="' + CONFIG.afterActivate + '">Open the catalog</a>. ' +
        'To deactivate, clear this site\'s data in your browser.</p>';
      return;
    }
    el.innerHTML =
      '<p>Enter the license key from your purchase email to unlock all 502 lessons ' +
      'on this device.</p>' +
      '<form class="activate-form" novalidate>' +
      '<input class="activate-input" type="text" inputmode="latin" autocomplete="off" ' +
      'spellcheck="false" placeholder="AIFS-XXXX-XXXX-XXXX-XXXX" ' +
      'aria-label="License key" maxlength="24">' +
      '<button class="access-btn activate-btn" type="submit">Activate</button>' +
      '</form>' +
      '<p class="activate-msg" role="status" aria-live="polite"></p>' +
      '<p style="font-size:0.82rem;margin-top:10px">Trouble activating? Email ' +
      '<a href="mailto:' + CONFIG.supportEmail + '">' + CONFIG.supportEmail + '</a> ' +
      'with your Stripe receipt.</p>';

    var form = el.querySelector('.activate-form');
    var input = el.querySelector('.activate-input');
    var msg = el.querySelector('.activate-msg');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var val = input.value.trim();
      if (!val) { msg.textContent = 'Enter your license key.'; msg.className = 'activate-msg is-error'; return; }
      if (validateKey(val)) {
        grantAccess();
        msg.textContent = '✓ Activated! Taking you to the catalog…';
        msg.className = 'activate-msg is-ok';
        setTimeout(function () { window.location.href = CONFIG.afterActivate; }, 900);
      } else {
        msg.textContent = 'That key doesn\'t look right. Check for typos, or email ' +
          CONFIG.supportEmail + '.';
        msg.className = 'activate-msg is-error';
      }
    });
  }

  function showPurchaseThanks(el) {
    if (!el) return;
    var params = new URLSearchParams(window.location.search);
    if (params.get('purchase') === 'success') {
      el.style.display = '';
      el.innerHTML =
        '<strong>Thanks for your purchase!</strong> Your license key is in your ' +
        'email receipt from Stripe. Enter it below to unlock the full curriculum.';
    }
  }

  function boot() {
    var buy = document.getElementById('buyCard');
    var activate = document.getElementById('activateBox');
    var thanks = document.getElementById('purchaseThanks');
    if (buy) renderBuyCard(buy);
    if (activate) renderActivation(activate);
    showPurchaseThanks(thanks);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Expose validate/checksum so the setup doc's key generator can be run
  // in the browser console against the live build.
  window.AIFSCheckout = { validateKey: validateKey, checksum: checksum, config: CONFIG };
})();
