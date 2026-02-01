// /api/create-subscription-session.js
// Build: 2026-01-30 (FIX: Pre-fill customer_email to link subscriptions correctly)
//
// Purpose:
// - Create ONE Stripe subscription checkout session that charges quantity = number of ZIP codes.
// - Supports bulk purchases (e.g., broker buys 99 ZIPs in one checkout).
// - PRE-FILLS customer email to ensure Stripe subscription is linked to correct user.
//
// Request body (POST JSON):
// {
//   "roleType": "local_broker" | "local_pro" | "local_service",
//   "zipCodes": ["92651","92657", ...],
//   "priceId": "price_xxx" (optional - can also use env vars),
//   "successUrl": "https://.../local-brokers.html?status=success",
//   "cancelUrl":  "https://.../local-brokers.html?status=cancel",
//   "metadata": { "draftId": "...", "email": "user@example.com", ... }
// }
//
// Response:
// { "id": "<session_id>", "url": "<session_url>" }

import Stripe from "stripe";

const STRIPE_API_VERSION = "2024-06-20";

// -------- helpers --------
function isPlainObject(x) {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function normalizeZipCodes(input) {
  const zipsRaw = Array.isArray(input) ? input : [];
  const seen = new Set();
  const out = [];

  for (const z of zipsRaw) {
    const s = String(z || "").trim();
    if (!/^\d{5}$/.test(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function safeString(v, maxLen = 500) {
  const s = String(v == null ? "" : v);
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen);
}

function normalizeEmail(email) {
  if (!email || typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

function buildPriceId(roleType, envOrBodyPriceId) {
  // You can optionally pass a priceId from the client, but by default we map by roleType.
  // This keeps the API usable even if you haven't wired app-config into the client yet.
  if (envOrBodyPriceId) return String(envOrBodyPriceId).trim();

  // Map roleType -> env var (recommended for production)
  // Set these in Vercel env:
  // - STRIPE_PRICE_ID_LOCAL_PRO_MONTHLY
  // - STRIPE_PRICE_ID_LOCAL_BROKER_MONTHLY
  // - STRIPE_PRICE_ID_LOCAL_SERVICE_MONTHLY
  const rt = String(roleType || "").trim().toLowerCase();

  if (rt === "local_pro") {
    return process.env.STRIPE_PRICE_ID_LOCAL_PRO_MONTHLY || "";
  }
  if (rt === "local_broker") {
    return process.env.STRIPE_PRICE_ID_LOCAL_BROKER_MONTHLY || "";
  }
  if (rt === "local_service") {
    return process.env.STRIPE_PRICE_ID_LOCAL_SERVICE_MONTHLY || "";
  }
  return "";
}

// Stripe metadata values must be strings
function toStripeMetadata(obj) {
  const meta = {};
  if (!isPlainObject(obj)) return meta;

  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    meta[String(k).slice(0, 40)] = safeString(v, 500);
  }
  return meta;
}

// -------- handler --------
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });
  }

  const stripe = new Stripe(secret, { apiVersion: STRIPE_API_VERSION });

  try {
    const body = req.body || {};
    const roleType = String(body.roleType || "").trim().toLowerCase();
    const zipCodes = normalizeZipCodes(body.zipCodes);

    const successUrl = String(body.successUrl || "").trim();
    const cancelUrl = String(body.cancelUrl || "").trim();

    // ========== CRITICAL: Extract and normalize email ==========
    // Email can come from body.email OR body.metadata.email
    // This ensures Stripe Checkout is pre-filled with the correct email
    const rawEmail = body.email || (body.metadata && body.metadata.email) || "";
    const customerEmail = normalizeEmail(rawEmail);
    
    console.log("[create-subscription-session] Customer email:", customerEmail || "(not provided)");
    console.log("[create-subscription-session] Role type:", roleType);
    console.log("[create-subscription-session] ZIP count:", zipCodes.length);

    // Optional override: allow caller to specify priceId directly (MVP flexibility)
    const priceIdOverride = body.priceId ? String(body.priceId).trim() : "";
    const priceId = buildPriceId(roleType, priceIdOverride);

    // Validate roleType
    const validRoleTypes = ["local_pro", "local_broker", "local_service"];
    if (!roleType || !validRoleTypes.includes(roleType)) {
      return res.status(400).json({ 
        error: "Missing/invalid roleType (use 'local_pro', 'local_broker', or 'local_service')" 
      });
    }

    if (!Array.isArray(body.zipCodes)) {
      return res.status(400).json({ error: "zipCodes must be an array of 5-digit ZIP strings" });
    }

    if (!zipCodes.length) {
      return res.status(400).json({ error: "No valid ZIP codes provided (must be 5 digits)." });
    }

    // Hard cap to prevent abuse / accidental huge billing
    if (zipCodes.length > 99) {
      return res.status(400).json({ error: "Too many ZIP codes (max 99 per checkout)." });
    }

    if (!priceId) {
      // Helpful diagnostics: which env var is missing
      const envVarMap = {
        local_pro: "STRIPE_PRICE_ID_LOCAL_PRO_MONTHLY",
        local_broker: "STRIPE_PRICE_ID_LOCAL_BROKER_MONTHLY",
        local_service: "STRIPE_PRICE_ID_LOCAL_SERVICE_MONTHLY"
      };
      const which = envVarMap[roleType] || "STRIPE_PRICE_ID_*";
      return res.status(500).json({
        error: "Missing Stripe price ID for subscriptions",
        message: "Set the required env var (" + which + ") or pass priceId in the request body."
      });
    }

    if (!successUrl || !cancelUrl) {
      return res.status(400).json({ error: "Missing successUrl/cancelUrl" });
    }

    // Stripe metadata: must be flat strings
    const userMeta = toStripeMetadata(body.metadata || {});
    const meta = {
      ...userMeta,
      roleType: roleType,
      zipCodes: zipCodes.join(","), // comma-separated list for webhook fulfillment
      zipCount: String(zipCodes.length)
    };

    // ========== Create Stripe Checkout Session ==========
    const sessionConfig = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: zipCodes.length }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      billing_address_collection: "auto",
      allow_promotion_codes: true,
      metadata: meta
    };

    // ========== CRITICAL FIX: Pre-fill customer email ==========
    // This ensures the Stripe subscription is linked to the user's login email
    // Without this, users might enter a different email at checkout,
    // breaking the "Manage Subscription" feature
    if (customerEmail) {
      sessionConfig.customer_email = customerEmail;
      console.log("[create-subscription-session] Pre-filling customer_email:", customerEmail);
    } else {
      console.warn("[create-subscription-session] WARNING: No customer email provided - user will enter manually");
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    console.log("[create-subscription-session] Session created:", session.id);

    return res.status(200).json({ id: session.id, url: session.url });
  } catch (err) {
    console.error("[create-subscription-session] Error:", err);
    return res.status(500).json({
      error: "Stripe subscription session failed",
      message: err && err.message ? err.message : String(err)
    });
  }
}
