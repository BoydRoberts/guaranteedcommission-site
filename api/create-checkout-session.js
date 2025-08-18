// /api/create-checkout-session.js
// build 2025-08-14s
//
// REQUIREMENTS
// - In Vercel Project Settings > Environment Variables, add:
//     STRIPE_SECRET_KEY = sk_test_... (your Secret Key)
// - Re-deploy.
// - Make sure the price IDs below match your Stripe account (test mode if testing).
//
// NOTES
// - This uses the official Stripe Node SDK (server function).
// - If your repo doesn’t have a package.json yet, add one with "stripe" as a dependency
//   (see sample package.json at the bottom of this file’s comment).

const Stripe = require('stripe');

const PRICE_IDS = {
  PLUS:         'price_1RsQFlPTiT2zuxx0414nGtTu', // $20 Listed Property Plus
  FSBO_PLUS:    'price_1RsQJbPTiT2zuxx0w3GUIdxJ', // $100 FSBO Plus
  BANNER:       'price_1RsQTOPTiT2zuxx0TLCwAthR', // $10 Banner
  PREMIUM:      'price_1RsQbjPTiT2zuxx0hA6p5H4h', // $10 Premium
  PIN:          'price_1RsQknPTiT2zuxx0Av9skJyW', // $50 Pin
  CONFIDENTIAL: 'price_1RsRP4PTiT2zuxx0eoOGEDvm'  // $100 Confidential FSBO Upgrade
};

function buildLineItems({ plan, upgrades, prices }) {
  const li = [];

  // Base (plan)
  if (plan === 'FSBO Plus') {
    li.push({ price: PRICE_IDS.FSBO_PLUS, quantity: 1 });
  } else if (plan === 'Listed Property Plus') {
    li.push({ price: PRICE_IDS.PLUS, quantity: 1 });
  } else if (plan === 'Listed Property Basic' && upgrades?.upgradeToPlus) {
    li.push({ price: PRICE_IDS.PLUS, quantity: 1 });
  }

  // Upsells
  if (upgrades?.banner) {
    li.push({ price: PRICE_IDS.BANNER, quantity: 1 });
  }
  if (upgrades?.pin) {
    li.push({ price: PRICE_IDS.PIN, quantity: 1 });     // includes Premium
  } else if (upgrades?.premium) {
    li.push({ price: PRICE_IDS.PREMIUM, quantity: 1 });
  }

  // FSBO-only
  if (plan === 'FSBO Plus' && upgrades?.confidential) {
    li.push({ price: PRICE_IDS.CONFIDENTIAL, quantity: 1 });
  }

  return li;
}

module.exports = async (req, res) => {
  // Enforce POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const sk = process.env.STRIPE_SECRET_KEY;
    if (!sk) {
      return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY env var.' });
    }

    const stripe = new Stripe(sk, { apiVersion: '2024-06-20' });

    // Parse input
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { plan, upgrades } = body || {};

    if (!plan) return res.status(400).json({ error: 'Missing plan.' });

    const line_items = buildLineItems({ plan, upgrades });

    if (!line_items.length) {
      return res.status(400).json({ error: 'No purchasable items derived from plan/upgrades.' });
    }

    // Success/Cancel URLs (derive from request host)
    const origin =
      (req.headers['x-forwarded-proto'] ? req.headers['x-forwarded-proto'] + '://' : 'https://') +
      (req.headers['x-forwarded-host'] || req.headers.host);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url: `${origin}/signature.html`,
      cancel_url: `${origin}/checkout.html`,
      // Optional niceties:
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: false },
      metadata: { plan },
      // automatic_tax: { enabled: true }, // enable if you’ve configured tax settings
    });

    return res.status(200).json({ id: session.id });
  } catch (err) {
    console.error('[create-checkout-session] error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};

/*
If you don't already have a package.json in your repo, add one like:

{
  "name": "guaranteedcommission",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "stripe": "^16.6.0"
  }
}

Vercel will detect the serverless function and install dependencies on deploy.
*/
