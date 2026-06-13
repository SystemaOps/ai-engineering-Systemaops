# Stripe payment setup

This site sells one product: lifetime access to the curriculum. Checkout
runs through **Stripe Payment Links** (no backend required), and buyers
unlock the site with a **license key** they enter on `access.html`.

> **You must do the account steps yourself** — creating the Stripe
> account and handling secret keys is not something the assistant does.
> Nothing below asks you to paste a secret into the website; the only
> value the site needs is your public Payment Link URL.

---

## 1. One-time Stripe setup (≈15 min)

1. Create / log into your Stripe account at <https://dashboard.stripe.com>.
2. **Product** → *Add product*: name it (e.g. "AI Engineering from
   SystemaOps — Lifetime"), set a **one-time** price in your currency.
3. **Payment Links** → *Create link* → select that product.
4. Under the link's **After payment** settings, choose
   *Don't show confirmation page → Redirect customers to your website*
   and set the URL to:

   ```
   https://YOUR-DOMAIN/access.html?purchase=success
   ```

5. Copy the Payment Link URL (looks like `https://buy.stripe.com/xxxxxxxx`).

## 2. Wire it into the site

Edit **`site/checkout.js`** → the `CONFIG` block at the top:

```js
var CONFIG = {
  paymentLink: 'https://buy.stripe.com/xxxxxxxx',  // ← your link
  price: '$149',                                   // ← display price
  supportEmail: 'info@systemaops.com',
  afterActivate: 'catalog.html'
};
```

Bump the asset version (the `?v=` query in the HTML `<script>`/`<link>`
tags) so visitors fetch the new file, redeploy, done. The "Buy with
Stripe" button now appears on `access.html`; until `paymentLink` is set
the page stays in graceful "notify me at launch" mode.

## 3. Deliver the license key to buyers

A key looks like `AIFS-XXXX-XXXX-XXXX-XXXX`. Generate a batch (each is
single-use by convention — you track that yourself for now) and deliver
one per sale. Two common ways:

- **Stripe receipt / email:** Stripe's automatic payment receipt can't
  carry a per-order custom key, so the simplest manual flow is: enable
  email receipts, and when a sale notification arrives, reply with a key
  from your batch. Fine for low volume.
- **Stripe "After payment" custom message:** you can show a fixed block
  of text after payment, but a *fixed* key shared by all buyers is the
  honor-system model — acceptable only if you accept sharing.

### Generate keys

Run this in any browser console **on your live site** (it reuses the same
checksum the site validates against), or in Node:

```js
(function () {
  var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function checksum(b){var h=2166136261;for(var i=0;i<b.length;i++){h^=b.charCodeAt(i);h=(h*16777619)>>>0;}var o='';for(var j=0;j<4;j++){o+=A.charAt(h&31);h=h>>>5;}return o;}
  function grp(){var s='';for(var i=0;i<4;i++)s+=A.charAt(Math.floor(Math.random()*32));return s;}
  function key(){var body='AIFS-'+grp()+'-'+grp()+'-'+grp();return body+'-'+checksum(body);}
  var out=[]; for(var i=0;i<25;i++) out.push(key());
  console.log(out.join('\n'));
})();
```

Validate a key the same way the site does:
`AIFSCheckout.validateKey('AIFS-….')` in the console on `access.html`.

---

## Security model — know what you're shipping

The current gate is **client-side**:

- Key validation runs in the browser, so the checksum can be reverse-
  engineered from `checkout.js` by a determined person.
- The lesson content under `/content/` is still served openly; the lock
  is enforced by JavaScript in `lesson.html`, not by the server.

This **stops casual freeloading, not piracy.** For most solo digital
courses that is an acceptable launch posture. If you want real
enforcement, do the hardening below.

## Hardening: the fulfillment backend (optional, later)

Add a small service container to `docker-compose.yml` that turns the
honor-system into a real gate:

1. **Checkout:** keep the Payment Link, or move to Stripe Checkout
   Sessions created by the service.
2. **Webhook:** Stripe → your service on `checkout.session.completed`.
   The service mints a **signed** key (HMAC/JWT with a server-only
   secret) and emails it to the buyer automatically.
3. **Activation:** `access.html` posts the key to the service, which
   verifies the signature and sets a signed cookie.
4. **Enforcement:** Caddy checks that cookie (via `forward_auth` to the
   service) before serving `/content/*`. No cookie → 403.

Only two things change in this repo for the upgrade: `validateKey()` in
`checkout.js` becomes a fetch to the service, and the `/content/*` route
in `deploy/Caddyfile` gains a `forward_auth` directive. The buyer-facing
UI on `access.html` stays exactly as it is now.

---

## Tax note

With Stripe, **you are the merchant of record** — you're responsible for
collecting and remitting any applicable tax (India GST, EU VAT, etc.).
Stripe Tax can automate calculation but you still file. If you'd rather
offload that entirely, a merchant-of-record processor (Lemon Squeezy,
Paddle) handles tax filing for you at a higher fee — the `access.html`
buy button would just point at their checkout instead.
