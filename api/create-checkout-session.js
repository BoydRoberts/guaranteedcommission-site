// /api/create-checkout-session.js
import Stripe from "stripe";

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    // If you see this in logs, your env var is still not configured for this deployment
    return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });
  }

  const stripe = new Stripe(secret, { apiVersion: "2024-06-20" });

  try {
    const { lineItems, successUrl, cancelUrl } = req.body || {};
    if (!Array.isArray(lineItems) || !lineItems.length) {
      return res.status(400).json({ error: "No line items" });
    }
    if (!successUrl || !cancelUrl) {
      return res.status(400).json({ error: "Missing successUrl/cancelUrl" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      billing_address_collection: "auto"
    });

    return res.status(200).json({ id: session.id, url: session.url });
  } catch (err) {
    console.error("[stripe] create session error", err);
    return res.status(500).json({ error: "Stripe create session failed" });
  }
}
