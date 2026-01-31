/**
 * Firebase Cloud Functions for GuaranteedCommission.com
 * Build: 2026-01-30
 * 
 * Functions:
 * - createPortalSession: Generate Stripe Customer Portal link for subscription management
 * - createSubscriptionSession: Create Stripe Checkout session for new subscriptions (if needed)
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize Firebase Admin (only once)
if (!admin.apps.length) {
  admin.initializeApp();
}

// Initialize Stripe with secret key from Firebase config
// Set via: firebase functions:config:set stripe.secret_key="sk_live_xxx"
const stripe = require("stripe")(functions.config().stripe?.secret_key || process.env.STRIPE_SECRET_KEY);

// ========================================
// CORS Configuration
// ========================================
const cors = require("cors")({ origin: true });

// ========================================
// createPortalSession
// Generates a Stripe Customer Portal link for subscription management
// ========================================
exports.createPortalSession = functions.https.onCall(async (data, context) => {
  try {
    const { email, returnUrl } = data;

    // ========== INPUT VALIDATION ==========
    if (!email || typeof email !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Email is required."
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // ========== AUTH CHECK (MVP: Trust email, but log for audit) ==========
    // In production with Firebase Auth, you would verify:
    // if (!context.auth) { throw new HttpsError("unauthenticated", "..."); }
    // if (context.auth.token.email !== normalizedEmail) { throw ... }
    
    // For MVP with simulated auth, we trust the email passed
    // but log for audit purposes
    console.log("[createPortalSession] Request for email:", normalizedEmail);
    console.log("[createPortalSession] Auth context:", context.auth ? "authenticated" : "unauthenticated");

    // ========== FIND STRIPE CUSTOMER ==========
    const customers = await stripe.customers.list({
      email: normalizedEmail,
      limit: 1,
    });

    if (!customers.data || customers.data.length === 0) {
      throw new functions.https.HttpsError(
        "not-found",
        "No subscription found for this email. If you recently subscribed, please wait a few minutes and try again."
      );
    }

    const customerId = customers.data[0].id;
    console.log("[createPortalSession] Found Stripe customer:", customerId);

    // ========== CREATE PORTAL SESSION ==========
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || "https://guaranteedcommission.com/welcome.html",
    });

    console.log("[createPortalSession] Portal session created:", portalSession.id);

    return {
      url: portalSession.url,
      customerId: customerId,
    };

  } catch (error) {
    console.error("[createPortalSession] Error:", error);

    // Re-throw HttpsErrors as-is
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    // Wrap Stripe errors
    if (error.type === "StripeInvalidRequestError") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        error.message
      );
    }

    // Generic error
    throw new functions.https.HttpsError(
      "internal",
      "Failed to create portal session. Please try again later."
    );
  }
});

// ========================================
// createPortalSessionHttp (HTTP endpoint alternative)
// For direct fetch() calls without Firebase SDK
// ========================================
exports.createPortalSessionHttp = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Only allow POST
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const { email, returnUrl } = req.body;

      // Validate email
      if (!email || typeof email !== "string") {
        res.status(400).json({ error: "Email is required." });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      console.log("[createPortalSessionHttp] Request for email:", normalizedEmail);

      // Find Stripe customer
      const customers = await stripe.customers.list({
        email: normalizedEmail,
        limit: 1,
      });

      if (!customers.data || customers.data.length === 0) {
        res.status(404).json({
          error: "No subscription found for this email. If you recently subscribed, please wait a few minutes and try again.",
        });
        return;
      }

      const customerId = customers.data[0].id;

      // Create portal session
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl || "https://guaranteedcommission.com/welcome.html",
      });

      console.log("[createPortalSessionHttp] Portal session created for:", customerId);

      res.status(200).json({
        url: portalSession.url,
        customerId: customerId,
      });

    } catch (error) {
      console.error("[createPortalSessionHttp] Error:", error);
      res.status(500).json({
        error: "Failed to create portal session. Please try again later.",
      });
    }
  });
});

// ========================================
// createSubscriptionSession
// Creates a Stripe Checkout session for new subscriptions
// (Alternative to direct Stripe links - provides more control)
// ========================================
exports.createSubscriptionSession = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const {
        roleType,        // "local_pro", "local_broker", "local_service"
        zipCodes,        // Array of ZIP codes
        priceId,         // Stripe Price ID
        successUrl,
        cancelUrl,
        metadata,        // { email, name, draftId, etc. }
      } = req.body;

      // Validate required fields
      if (!priceId || !successUrl || !cancelUrl) {
        res.status(400).json({ error: "Missing required fields: priceId, successUrl, cancelUrl" });
        return;
      }

      const email = metadata?.email || "";
      const quantity = Array.isArray(zipCodes) ? zipCodes.length : 1;

      console.log("[createSubscriptionSession] Creating session:", {
        roleType,
        priceId,
        quantity,
        email,
      });

      // Create Stripe Checkout session
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        customer_email: email || undefined,
        line_items: [
          {
            price: priceId,
            quantity: quantity,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          roleType: roleType || "",
          zipCodes: Array.isArray(zipCodes) ? zipCodes.join(",") : "",
          draftId: metadata?.draftId || "",
          ...metadata,
        },
        subscription_data: {
          metadata: {
            roleType: roleType || "",
            zipCodes: Array.isArray(zipCodes) ? zipCodes.join(",") : "",
            draftId: metadata?.draftId || "",
          },
        },
      });

      console.log("[createSubscriptionSession] Session created:", session.id);

      res.status(200).json({
        sessionId: session.id,
        url: session.url,
      });

    } catch (error) {
      console.error("[createSubscriptionSession] Error:", error);
      res.status(500).json({
        error: error.message || "Failed to create checkout session.",
      });
    }
  });
});

// ========================================
// stripeWebhook
// Handles Stripe webhook events (subscription created, cancelled, etc.)
// ========================================
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = functions.config().stripe?.webhook_secret || process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[stripeWebhook] Signature verification failed:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  console.log("[stripeWebhook] Received event:", event.type);

  const db = admin.firestore();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const { roleType, draftId, zipCodes } = session.metadata || {};

        console.log("[stripeWebhook] Checkout completed:", { roleType, draftId });

        // Activate the pending subscription document
        if (draftId && roleType) {
          const collectionMap = {
            local_pro: "localPros",
            local_broker: "localBrokers",
            local_service: "localServiceProviders",
          };

          const collectionName = collectionMap[roleType];
          if (collectionName) {
            await db.collection(collectionName).doc(draftId).update({
              status: "active",
              stripeCustomerId: session.customer,
              stripeSubscriptionId: session.subscription,
              activatedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log("[stripeWebhook] Activated:", collectionName, draftId);
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        console.log("[stripeWebhook] Subscription cancelled:", subscription.id);

        // Find and deactivate the subscription in Firestore
        // This is a simplified approach - in production you might want to
        // store the subscription ID directly in the document
        const collections = ["localPros", "localBrokers", "localServiceProviders"];
        for (const col of collections) {
          const snapshot = await db.collection(col)
            .where("stripeSubscriptionId", "==", subscription.id)
            .get();

          for (const doc of snapshot.docs) {
            await doc.ref.update({
              status: "cancelled",
              cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log("[stripeWebhook] Deactivated:", col, doc.id);
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        console.log("[stripeWebhook] Payment failed for customer:", invoice.customer);
        // Could send email notification or update status to "payment_failed"
        break;
      }

      default:
        console.log("[stripeWebhook] Unhandled event type:", event.type);
    }

    res.status(200).json({ received: true });

  } catch (error) {
    console.error("[stripeWebhook] Processing error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});
