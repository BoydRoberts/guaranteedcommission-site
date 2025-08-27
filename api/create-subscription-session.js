// /api/create-subscription-session.js
import Stripe from "stripe";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });
  }

  const stripe = new Stripe(secret, { apiVersion: "2024-06-20" });

  try {
    const { priceId, quantity, successUrl, cancelUrl } = req.body || {};
    if (!priceId) return res.status(400).json({ error: "Missing priceId" });
    const qty = Number(quantity || 1);
    if (!successUrl || !cancelUrl) {
      return res.status(400).json({ error: "Missing successUrl/cancelUrl" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: qty }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      billing_address_collection: "auto",
      allow_promotion_codes: true
    });

    return res.status(200).json({ id: session.id, url: session.url });
  } catch (err) {
    console.error("[stripe] create subscription session error", err);
    return res.status(500).json({ error: "Stripe subscription session failed" });
  }
}
