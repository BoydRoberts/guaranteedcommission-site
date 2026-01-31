/**
 * Vercel API Route: Create Stripe Customer Portal Session
 * Endpoint: POST /api/createPortalSession
 * 
 * This allows users to manage their subscriptions (cancel, update card, view invoices)
 * via the Stripe Customer Portal.
 */

const Stripe = require('stripe');

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    console.log('[createPortalSession] Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Initialize Stripe
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const { email, returnUrl } = req.body;

    // Validate email
    if (!email || typeof email !== 'string') {
      console.log('[createPortalSession] Missing email');
      return res.status(400).json({ error: 'Email is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log('[createPortalSession] Looking up customer:', normalizedEmail);

    // Find Stripe customer by email
    const customers = await stripe.customers.list({
      email: normalizedEmail,
      limit: 1,
    });

    if (!customers.data || customers.data.length === 0) {
      console.log('[createPortalSession] No customer found for:', normalizedEmail);
      return res.status(404).json({
        error: 'No subscription found for this email. If you recently subscribed, please wait a few minutes and try again.',
      });
    }

    const customerId = customers.data[0].id;
    console.log('[createPortalSession] Found customer:', customerId);

    // Create Stripe Customer Portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || 'https://guaranteedcommission.com/welcome.html',
    });

    console.log('[createPortalSession] Portal session created:', portalSession.id);

    return res.status(200).json({
      url: portalSession.url,
      customerId: customerId,
    });

  } catch (error) {
    console.error('[createPortalSession] Error:', error.message);
    
    // Handle Stripe-specific errors
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ error: error.message });
    }

    return res.status(500).json({
      error: 'Failed to create portal session. Please try again later.',
    });
  }
}
