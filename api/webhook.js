// api/webhook.js - Authoritative webhook fulfillment
import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export const config = {
  api: {
    bodyParser: false, // Stripe needs the raw body
  },
};

// Initialize Firebase Admin SDK (only once)
// NOTE: We try to initialize but don't throw - errors are handled in the request handler
let firebaseInitialized = false;
let firebaseInitError = null;

if (!getApps().length) {
  // Option 1: Single JSON string env var (recommended for Vercel)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      initializeApp({
        credential: cert(serviceAccount)
      });
      firebaseInitialized = true;
      console.log('[webhook] Firebase Admin initialized successfully');
    } catch (error) {
      console.error('[webhook] Firebase Admin init error:', error);
      firebaseInitError = 'Failed to initialize Firebase Admin - check FIREBASE_SERVICE_ACCOUNT_JSON: ' + error.message;
    }
  }
  // Option 2: Individual fields (fallback)
  else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    try {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
      firebaseInitialized = true;
      console.log('[webhook] Firebase Admin initialized successfully');
    } catch (error) {
      console.error('[webhook] Firebase Admin init error:', error);
      firebaseInitError = 'Failed to initialize Firebase Admin - check individual env vars: ' + error.message;
    }
  } else {
    // No credentials - record error but don't throw
    firebaseInitError = 'Missing Firebase credentials - set FIREBASE_SERVICE_ACCOUNT_JSON or individual env vars';
  }
} else {
  // Already initialized (e.g., warm function)
  firebaseInitialized = true;
}

const db = firebaseInitialized ? getFirestore() : null;

export default async function handler(req, res) {
  // Check Firebase initialization before processing
  if (!firebaseInitialized || !db) {
    console.error('[webhook] Firebase not initialized:', firebaseInitError);
    return res.status(500).json({ 
      error: 'Server configuration error', 
      message: firebaseInitError || 'Firebase Admin not initialized'
    });
  }
  
  // Check Stripe secret key
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[webhook] Missing STRIPE_SECRET_KEY');
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'Missing STRIPE_SECRET_KEY'
    });
  }
  
  // Check Stripe webhook secret
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[webhook] Missing STRIPE_WEBHOOK_SECRET');
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'Missing STRIPE_WEBHOOK_SECRET'
    });
  }
  
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  
  if (req.method === 'POST') {
    const sig = req.headers['stripe-signature'];
    
    // Check signature header exists
    if (!sig) {
      console.error('[webhook] Missing stripe-signature header');
      return res.status(400).send('Missing stripe-signature header');
    }
    
    let event;
    
    // Step 1: Verify Stripe signature
    try {
      const buf = await buffer(req);
      event = stripe.webhooks.constructEvent(
        buf,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('[webhook] Signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    // Step 2: Handle checkout.session.completed (payment succeeded)
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      console.log('[webhook] Payment received for session:', session.id);
      
      // Critical: Only fulfill if actually paid
      if (session.payment_status !== 'paid') {
        console.log('[webhook] Session not paid, skipping fulfillment:', session.id, 'status:', session.payment_status);
        return res.json({ received: true, skipped: 'not_paid' });
      }
      
      try {
        await fulfillCheckout(session);
        console.log('[webhook] Fulfillment complete for session:', session.id);
        return res.json({ received: true });
      } catch (error) {
        console.error('[webhook] Fulfillment error:', error);
        // Return 500 so Stripe retries this webhook
        return res.status(500).json({ 
          error: 'Fulfillment failed', 
          message: error.message 
        });
      }
    }
    
    // Other event types (not fulfillment-critical)
    res.json({ received: true });
  } else {
    res.setHeader('Allow', 'POST');
    res.status(405).end('Method Not Allowed');
  }
}

/**
 * Fulfill the checkout by updating Firestore with payment info and upgrades
 * This is the authoritative source of truth for what was paid for
 */
async function fulfillCheckout(session) {
  const sessionId = session.id;
  const metadata = session.metadata || {};
  
  // Step 1: Idempotency check - have we already FULFILLED this session?
  const paymentRef = db.collection('payments').doc(sessionId);
  const paymentDoc = await paymentRef.get();
  
  if (paymentDoc.exists) {
    const paymentData = paymentDoc.data();
    if (paymentData.status === 'fulfilled') {
      console.log('[webhook] Session already fulfilled:', sessionId);
      return; // Already fulfilled, skip
    }
    // If status is "processing" or anything else, we retry fulfillment
    console.log('[webhook] Session exists but not fulfilled, retrying:', sessionId);
  }
  
  // Step 2: Record this payment as processing (idempotency marker)
  // Use merge: true to preserve any existing fields
  await paymentRef.set({
    sessionId: sessionId,
    status: 'processing', // Mark as processing, not fulfilled yet
    receivedAt: FieldValue.serverTimestamp(),
    amount: session.amount_total,
    currency: session.currency,
    customerEmail: session.customer_details?.email,
    listingId: metadata.listingId || null,
    payer: metadata.payer || 'seller',
    plan: metadata.plan || 'Listed Property Basic',
    flow: metadata.flow || 'initial_checkout',
    metadata: metadata
  }, { merge: true }); // Merge instead of overwrite
  
  // Step 3: If there's a listing, update it with payment info
  const listingId = metadata.listingId;
  if (!listingId) {
    console.log('[webhook] No listingId in metadata, marking for manual review');
    // No listing to update - mark as needs manual review, NOT fulfilled
    await paymentRef.update({ 
      status: 'needs_manual_review',
      reviewReason: 'missing_listingId',
      reviewedAt: FieldValue.serverTimestamp()
    });
    return;
  }
  
  const listingRef = db.collection('listings').doc(listingId);
  
  // Check if listing exists BEFORE transaction
  const listingDoc = await listingRef.get();
  if (!listingDoc.exists) {
    console.log('[webhook] Listing not found:', listingId);
    await paymentRef.update({ 
      status: 'needs_manual_review',
      reviewReason: 'listing_not_found',
      reviewedAt: FieldValue.serverTimestamp()
    });
    return;
  }
  
  // Step 4: Build the upgrades object from metadata
  const upgrades = {
    banner: metadata.banner === 'true',
    premium: metadata.premium === 'true',
    pin: metadata.pin === 'true',
    confidential: metadata.confidential === 'true'
    // Note: changeCommission is NOT in paidUpgrades - it's a separate event
  };
  
  // Track commission change separately
  const isCommissionChange = metadata.changeCommission === 'true';
  
  // Step 5: Determine final plan
  let finalPlan = metadata.plan || 'Listed Property Basic';
  if (metadata.upgradeToPlus === 'true') {
    finalPlan = 'Listed Property Plus';
  }
  
  // Step 6: Build update object
  const updateData = {
    paymentStatus: 'paid',
    lastPaidSessionId: sessionId,
    paidAt: FieldValue.serverTimestamp(),
    plan: finalPlan
  };
  
  // Step 7: Update listing in transaction
  // If transaction throws, it will propagate up and handler will return 500 (Stripe retries)
  await db.runTransaction(async (transaction) => {
    // Re-read listing in transaction for consistency
    const listingDocInTx = await transaction.get(listingRef);
    
    if (!listingDocInTx.exists) {
      // Shouldn't happen since we checked above, but be safe
      throw new Error('Listing disappeared during transaction');
    }
    
    const existingData = listingDocInTx.data();
    const existingUpgrades = existingData.paidUpgrades || {};
    
    // Merge upgrades: existing + new (new ones override if explicitly true)
    // Note: changeCommission is NOT in this object - it's stored separately
    const mergedUpgrades = { ...existingUpgrades };
    if (upgrades.banner) mergedUpgrades.banner = true;
    if (upgrades.premium) mergedUpgrades.premium = true;
    if (upgrades.pin) mergedUpgrades.pin = true;
    if (upgrades.confidential) mergedUpgrades.confidential = true;
    
    updateData.paidUpgrades = mergedUpgrades;
    
    // Step 8: Handle commission change separately (not an "upgrade")
    if (isCommissionChange) {
      updateData.commissionChangePaid = true;
      
      if (metadata.newCommission) {
        // Store the new commission that will be used in the ISC
        updateData.pendingCommission = metadata.newCommission;
        updateData.pendingCommissionType = metadata.newCommissionType || '%';
      }
    }
    
    // Step 9: Apply the update
    transaction.update(listingRef, updateData);
    
    const changeInfo = isCommissionChange ? `, commission change paid` : '';
    console.log('[webhook] Updated listing:', listingId, 'with plan:', finalPlan, ', upgrades:', mergedUpgrades, changeInfo);
  });
  
  // Step 10: Transaction succeeded - mark payment as fulfilled
  await paymentRef.update({ 
    status: 'fulfilled',
    fulfilledAt: FieldValue.serverTimestamp()
  });
}

/**
 * Helper to read raw request body
 */
async function buffer(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}
