// /api/create-checkout-session.js
// build 2025-08-14t
//
// SETUP (one-time):
//   1) Vercel → Project Settings → Environment Variables:
//        STRIPE_SECRET_KEY = sk_test_xxx  (or sk_live_xxx in prod)
//   2) Ensure your repo has a package.json that includes "stripe" dependency.
//   3) Redeploy.
//
// This handler ALWAYS returns JSON (even on errors) so the client never chokes
// on an HTML "Server Error" page.

const Stripe = require('stripe');

// Your Stripe Price IDs
const PRICE_IDS = {
  PLUS:         'price_1RsQFlPTiT2zuxx0414nGtTu', // $20 Listed Property Plus
  FSBO_PLUS:    'price_1RsQJbPTiT2zuxx0w3GUIdxJ', // $100 FSBO Plus
  BANNER:       'price_1RsQTOPTiT2zuxx0TLCwAthR', // $10 Banner
  PREMIUM:      'price_1RsQbjPTiT2zuxx0hA6p5H4h', // $10 Premium
  PIN:          'price_1RsQknPTiT2zuxx0Av9skJyW', // $50 Pin
  CONFIDENTIAL: 'price_1RsRP4PTiT2zuxx0eoOGEDvm'  // $100 Confidential FSBO Upgrade
};

function buildLineItems(plan, upgrades = {}) {
  const li = [];
  if (plan === 'FSBO Plus') {
    li.push({ price: PRICE_IDS.FSBO_PLUS, quantity: 1 });
  } else if (plan === 'Listed Property Plus') {
    li.push({ price: PRICE_IDS.PLUS, quantity: 1 });
  } else if (plan === 'Listed Property Basic' && upgrades.upgradeToPlus) {
    li.push({ price: PRICE_IDS.PLUS, quantity: 1 });
  }

  if (upgrades.banner)   li.push({ price: PRICE_IDS.BANNER, quantity: 1 });
  if (upgrades.pin)      li.push({ price: PRICE_IDS.PIN, quantity: 1 });      // includes Premium
  else if (upgrades.premium) li.push({ price: PRICE_IDS.PREMIUM, quantity: 1 });

  if (plan === 'FSBO Plus' && upgrades.confidential) {
    li.push({ price: PRICE_IDS.CONFIDENTIAL, quantity: 1 });
  }
  return li;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end(JSON.stringify({ error: 'Method Not Allowed' }));
  }

  try {
    const sk = process.env.STRIPE_SECRET_KEY;
    if (!sk) {
      return res.status(500).end(JSON.stringify({
        error: 'Missing STRIPE_SECRET_KEY. Set it in Vercel → Project Settings → Environment Variables.'
      }));
    }

    // Vercel body can be object or string
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const plan = body?.plan;
    const upgrades = body?.upgrades || {};

    if (!plan) {
      return res.status(400).end(JSON.stringify({ error: 'Missing required "plan".' }));
    }

    const line_items = buildLineItems(plan, upgrades);
    if (!line_items.length) {
      return res.status(400).end(JSON.stringify({
        error: 'No purchasable items derived from plan/upgrades.',
        debug: { plan, upgrades }
      }));
    }

    const stripe = new Stripe(sk, { apiVersion: '2024-06-20' });

    // Build origin from headers
    const origin =
      (req.headers['x-forwarded-proto'] ? req.headers['x-forwarded-proto'] + '://' : 'https://') +
      (req.headers['x-forwarded-host'] || req.headers.host);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url: `${origin}/signature.html`,
      cancel_url:  `${origin}/checkout.html`,
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: false },
      metadata: { plan }
    });

    return res.status(200).end(JSON.stringify({ id: session.id }));
  } catch (err) {
    console.error('[create-checkout-session] crash:', err);
    return res.status(500).end(JSON.stringify({
      error: err?.message || 'Server error creating checkout session.'
    }));
  }
};
