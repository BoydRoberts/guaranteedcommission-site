// api/webhook.js - Authoritative webhook fulfillment
// Build: 2026-01-30 (Added subscription handling for Local Pros, Brokers, Service Providers)
//
// Handles:
// 1. checkout.session.completed - New payments (listings OR subscriptions)
// 2. invoice.payment_succeeded - Monthly subscription renewals
// 3. customer.subscription.deleted - Subscription cancellations/expirations

import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export const config = {
  api: {
    bodyParser: false, // Stripe needs the raw body
  },
};

// Initialize Firebase Admin SDK (only once)
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
    firebaseInitError = 'Missing Firebase credentials - set FIREBASE_SERVICE_ACCOUNT_JSON or individual env vars';
  }
} else {
  firebaseInitialized = true;
}

const db = firebaseInitialized ? getFirestore() : null;

// ========================================
// COLLECTION MAPPING
// Maps roleType from metadata to Firestore collection name
// ========================================
const ROLE_TO_COLLECTION = {
  'local_pro': 'localPros',
  'local_broker': 'localBrokers',
  'local_service': 'localServiceProviders'
};

// ========================================
// MAIN HANDLER
// ========================================
export default async function handler(req, res) {
  // Check Firebase initialization
  if (!firebaseInitialized || !db) {
    console.error('[webhook] Firebase not initialized:', firebaseInitError);
    return res.status(500).json({ 
      error: 'Server configuration error', 
      message: firebaseInitError || 'Firebase Admin not initialized'
    });
  }
  
  // Check Stripe keys
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[webhook] Missing STRIPE_SECRET_KEY');
    return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' });
  }
  
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[webhook] Missing STRIPE_WEBHOOK_SECRET');
    return res.status(500).json({ error: 'Missing STRIPE_WEBHOOK_SECRET' });
  }
  
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    console.error('[webhook] Missing stripe-signature header');
    return res.status(400).send('Missing stripe-signature header');
  }
  
  let event;
  
  // Verify Stripe signature
  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  console.log('[webhook] Received event:', event.type);
  
  try {
    // ========================================
    // EVENT: checkout.session.completed
    // New payment - either listing or subscription
    // ========================================
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      console.log('[webhook] Checkout completed:', session.id);
      
      // Only fulfill if actually paid
      if (session.payment_status !== 'paid') {
        console.log('[webhook] Session not paid, skipping:', session.payment_status);
        return res.json({ received: true, skipped: 'not_paid' });
      }
      
      const metadata = session.metadata || {};
      
      // Route to appropriate fulfillment based on metadata
      if (metadata.roleType && ROLE_TO_COLLECTION[metadata.roleType]) {
        // This is a subscription checkout (Local Pro, Broker, or Service Provider)
        await fulfillSubscription(session, stripe);
      } else if (metadata.listingId) {
        // This is a listing payment (existing logic)
        await fulfillCheckout(session);
      } else {
        console.log('[webhook] Unknown checkout type - no roleType or listingId');
        // Record for manual review
        await db.collection('payments').doc(session.id).set({
          sessionId: session.id,
          status: 'needs_manual_review',
          reviewReason: 'unknown_checkout_type',
          amount: session.amount_total,
          currency: session.currency,
          customerEmail: session.customer_details?.email,
          metadata: metadata,
          receivedAt: FieldValue.serverTimestamp()
        });
      }
      
      return res.json({ received: true });
    }
    
    // ========================================
    // EVENT: invoice.payment_succeeded
    // Monthly subscription renewal
    // ========================================
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      
      // Only process subscription invoices (not one-time)
      if (invoice.subscription) {
        console.log('[webhook] Invoice paid for subscription:', invoice.subscription);
        await handleSubscriptionRenewal(invoice, stripe);
      }
      
      return res.json({ received: true });
    }
    
    // ========================================
    // EVENT: customer.subscription.deleted
    // Subscription cancelled or expired
    // ========================================
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      console.log('[webhook] Subscription deleted:', subscription.id);
      await handleSubscriptionCancellation(subscription);
      return res.json({ received: true });
    }
    
    // ========================================
    // EVENT: customer.subscription.updated
    // Subscription changed (e.g., payment failed, then succeeded)
    // ========================================
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object;
      console.log('[webhook] Subscription updated:', subscription.id, 'status:', subscription.status);
      
      // If subscription becomes active again (e.g., after failed payment resolved)
      if (subscription.status === 'active') {
        await reactivateSubscription(subscription);
      }
      // If subscription is past_due or unpaid, mark as inactive
      else if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
        await handleSubscriptionPastDue(subscription);
      }
      
      return res.json({ received: true });
    }
    
    // ========================================
    // EVENT: invoice.payment_failed
    // Payment failed - mark subscription as at-risk
    // ========================================
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      if (invoice.subscription) {
        console.log('[webhook] Payment failed for subscription:', invoice.subscription);
        await handlePaymentFailed(invoice);
      }
      return res.json({ received: true });
    }
    
    // Other event types - acknowledge but don't process
    console.log('[webhook] Unhandled event type:', event.type);
    return res.json({ received: true });
    
  } catch (error) {
    console.error('[webhook] Processing error:', error);
    return res.status(500).json({ error: 'Webhook processing failed', message: error.message });
  }
}

// ========================================
// SUBSCRIPTION FULFILLMENT
// Activates subscription after successful checkout
// ========================================
async function fulfillSubscription(session, stripe) {
  const sessionId = session.id;
  const metadata = session.metadata || {};
  const roleType = metadata.roleType;
  const collectionName = ROLE_TO_COLLECTION[roleType];
  
  if (!collectionName) {
    console.error('[webhook] Unknown roleType:', roleType);
    throw new Error('Unknown roleType: ' + roleType);
  }
  
  console.log('[webhook] Fulfilling subscription:', { roleType, collectionName, sessionId });
  
  // Idempotency check
  const paymentRef = db.collection('subscription_payments').doc(sessionId);
  const paymentDoc = await paymentRef.get();
  
  if (paymentDoc.exists && paymentDoc.data().status === 'fulfilled') {
    console.log('[webhook] Subscription already fulfilled:', sessionId);
    return;
  }
  
  // Record payment as processing
  await paymentRef.set({
    sessionId: sessionId,
    status: 'processing',
    roleType: roleType,
    receivedAt: FieldValue.serverTimestamp(),
    amount: session.amount_total,
    currency: session.currency,
    customerEmail: session.customer_details?.email,
    metadata: metadata
  }, { merge: true });
  
  // Get subscription details from Stripe
  const subscriptionId = session.subscription;
  let currentPeriodEnd = null;
  
  if (subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      currentPeriodEnd = subscription.current_period_end 
        ? new Date(subscription.current_period_end * 1000) 
        : null;
      console.log('[webhook] Subscription period end:', currentPeriodEnd);
    } catch (err) {
      console.warn('[webhook] Could not retrieve subscription details:', err.message);
    }
  }
  
  // Parse ZIP codes from metadata
  const zipCodes = metadata.zipCodes ? metadata.zipCodes.split(',').map(z => z.trim()) : [];
  
  // Find the draft document by draftId
  const draftId = metadata.draftId;
  
  if (draftId) {
    // Update the existing draft document
    const docRef = db.collection(collectionName).doc(draftId);
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
      await docRef.update({
        status: 'active',
        stripeCustomerId: session.customer,
        stripeSubscriptionId: subscriptionId,
        stripeSessionId: sessionId,
        currentPeriodEnd: currentPeriodEnd,
        activatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      console.log('[webhook] Activated existing draft:', draftId, 'in', collectionName);
    } else {
      console.warn('[webhook] Draft not found, creating new document:', draftId);
      await createSubscriptionDocument(collectionName, session, metadata, subscriptionId, currentPeriodEnd, zipCodes);
    }
  } else {
    // No draftId - create new document (fallback)
    console.log('[webhook] No draftId, creating new document');
    await createSubscriptionDocument(collectionName, session, metadata, subscriptionId, currentPeriodEnd, zipCodes);
  }
  
  // Mark payment as fulfilled
  await paymentRef.update({
    status: 'fulfilled',
    fulfilledAt: FieldValue.serverTimestamp()
  });
  
  console.log('[webhook] Subscription fulfillment complete:', sessionId);
}

// ========================================
// CREATE NEW SUBSCRIPTION DOCUMENT
// Fallback when no draftId exists
// ========================================
async function createSubscriptionDocument(collectionName, session, metadata, subscriptionId, currentPeriodEnd, zipCodes) {
  const email = (session.customer_details?.email || metadata.email || '').toLowerCase();
  
  const newDoc = {
    email: email,
    emailLower: email,
    name: metadata.name || metadata.personalName || '',
    company: metadata.company || metadata.name || '',
    phone: metadata.phone || '',
    license: metadata.license || '',
    role: metadata.role || '',
    zips: zipCodes,
    status: 'active',
    stripeCustomerId: session.customer,
    stripeSubscriptionId: subscriptionId,
    stripeSessionId: session.id,
    currentPeriodEnd: currentPeriodEnd,
    createdAt: FieldValue.serverTimestamp(),
    activatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };
  
  const docRef = await db.collection(collectionName).add(newDoc);
  console.log('[webhook] Created new subscription document:', docRef.id, 'in', collectionName);
}

// ========================================
// HANDLE SUBSCRIPTION RENEWAL
// Updates currentPeriodEnd on monthly invoice payment
// ========================================
async function handleSubscriptionRenewal(invoice, stripe) {
  const subscriptionId = invoice.subscription;
  
  if (!subscriptionId) {
    console.log('[webhook] No subscription ID in invoice');
    return;
  }
  
  // Get updated subscription details
  let currentPeriodEnd = null;
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    currentPeriodEnd = subscription.current_period_end 
      ? new Date(subscription.current_period_end * 1000) 
      : null;
  } catch (err) {
    console.warn('[webhook] Could not retrieve subscription:', err.message);
    return;
  }
  
  // Find and update the subscription document across all collections
  const collections = Object.values(ROLE_TO_COLLECTION);
  let found = false;
  
  for (const colName of collections) {
    const snapshot = await db.collection(colName)
      .where('stripeSubscriptionId', '==', subscriptionId)
      .limit(1)
      .get();
    
    if (!snapshot.empty) {
      const docRef = snapshot.docs[0].ref;
      await docRef.update({
        status: 'active',
        currentPeriodEnd: currentPeriodEnd,
        lastRenewalAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      console.log('[webhook] Renewed subscription:', subscriptionId, 'in', colName);
      found = true;
      break;
    }
  }
  
  if (!found) {
    console.warn('[webhook] Could not find subscription to renew:', subscriptionId);
  }
}

// ========================================
// HANDLE SUBSCRIPTION CANCELLATION
// Sets status to 'cancelled' so ads stop displaying
// ========================================
async function handleSubscriptionCancellation(subscription) {
  const subscriptionId = subscription.id;
  
  const collections = Object.values(ROLE_TO_COLLECTION);
  let found = false;
  
  for (const colName of collections) {
    const snapshot = await db.collection(colName)
      .where('stripeSubscriptionId', '==', subscriptionId)
      .limit(1)
      .get();
    
    if (!snapshot.empty) {
      const docRef = snapshot.docs[0].ref;
      await docRef.update({
        status: 'cancelled',
        cancelledAt: FieldValue.serverTimestamp(),
        cancellationReason: subscription.cancellation_details?.reason || 'unknown',
        updatedAt: FieldValue.serverTimestamp()
      });
      console.log('[webhook] Cancelled subscription:', subscriptionId, 'in', colName);
      found = true;
      break;
    }
  }
  
  if (!found) {
    console.warn('[webhook] Could not find subscription to cancel:', subscriptionId);
  }
}

// ========================================
// HANDLE SUBSCRIPTION PAST DUE
// Marks subscription as inactive when payment fails
// ========================================
async function handleSubscriptionPastDue(subscription) {
  const subscriptionId = subscription.id;
  
  const collections = Object.values(ROLE_TO_COLLECTION);
  
  for (const colName of collections) {
    const snapshot = await db.collection(colName)
      .where('stripeSubscriptionId', '==', subscriptionId)
      .limit(1)
      .get();
    
    if (!snapshot.empty) {
      const docRef = snapshot.docs[0].ref;
      await docRef.update({
        status: 'past_due',
        updatedAt: FieldValue.serverTimestamp()
      });
      console.log('[webhook] Marked subscription as past_due:', subscriptionId, 'in', colName);
      break;
    }
  }
}

// ========================================
// REACTIVATE SUBSCRIPTION
// When a past_due subscription becomes active again
// ========================================
async function reactivateSubscription(subscription) {
  const subscriptionId = subscription.id;
  const currentPeriodEnd = subscription.current_period_end 
    ? new Date(subscription.current_period_end * 1000) 
    : null;
  
  const collections = Object.values(ROLE_TO_COLLECTION);
  
  for (const colName of collections) {
    const snapshot = await db.collection(colName)
      .where('stripeSubscriptionId', '==', subscriptionId)
      .limit(1)
      .get();
    
    if (!snapshot.empty) {
      const docRef = snapshot.docs[0].ref;
      await docRef.update({
        status: 'active',
        currentPeriodEnd: currentPeriodEnd,
        reactivatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      console.log('[webhook] Reactivated subscription:', subscriptionId, 'in', colName);
      break;
    }
  }
}

// ========================================
// HANDLE PAYMENT FAILED
// Log payment failure for monitoring
// ========================================
async function handlePaymentFailed(invoice) {
  const subscriptionId = invoice.subscription;
  const customerEmail = invoice.customer_email;
  
  // Log the failure
  await db.collection('payment_failures').add({
    subscriptionId: subscriptionId,
    invoiceId: invoice.id,
    customerEmail: customerEmail,
    amount: invoice.amount_due,
    currency: invoice.currency,
    attemptCount: invoice.attempt_count,
    failedAt: FieldValue.serverTimestamp()
  });
  
  console.log('[webhook] Logged payment failure for:', subscriptionId, 'attempt:', invoice.attempt_count);
}

// ========================================
// LISTING FULFILLMENT (UNCHANGED)
// Original logic for property listing payments
// ========================================
async function fulfillCheckout(session) {
  const sessionId = session.id;
  const metadata = session.metadata || {};
  
  // Idempotency check
  const paymentRef = db.collection('payments').doc(sessionId);
  const paymentDoc = await paymentRef.get();
  
  if (paymentDoc.exists) {
    const paymentData = paymentDoc.data();
    if (paymentData.status === 'fulfilled') {
      console.log('[webhook] Session already fulfilled:', sessionId);
      return;
    }
    console.log('[webhook] Session exists but not fulfilled, retrying:', sessionId);
  }
  
  // Record payment as processing
  await paymentRef.set({
    sessionId: sessionId,
    status: 'processing',
    receivedAt: FieldValue.serverTimestamp(),
    amount: session.amount_total,
    currency: session.currency,
    customerEmail: session.customer_details?.email,
    listingId: metadata.listingId || null,
    payer: metadata.payer || 'seller',
    plan: metadata.plan || 'Listed Property Basic',
    flow: metadata.flow || 'initial_checkout',
    metadata: metadata
  }, { merge: true });
  
  const listingId = metadata.listingId;
  if (!listingId) {
    console.log('[webhook] No listingId in metadata, marking for manual review');
    await paymentRef.update({ 
      status: 'needs_manual_review',
      reviewReason: 'missing_listingId',
      reviewedAt: FieldValue.serverTimestamp()
    });
    return;
  }
  
  const listingRef = db.collection('listings').doc(listingId);
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
  
  // Build upgrades object
  const upgrades = {
    banner: metadata.banner === 'true',
    premium: metadata.premium === 'true',
    pin: metadata.pin === 'true',
    confidential: metadata.confidential === 'true'
  };
  
  const isCommissionChange = metadata.changeCommission === 'true';
  
  let finalPlan = metadata.plan || 'Listed Property Basic';
  if (metadata.upgradeToPlus === 'true') {
    finalPlan = 'Listed Property Plus';
  }
  
  const updateData = {
    paymentStatus: 'paid',
    lastPaidSessionId: sessionId,
    paidAt: FieldValue.serverTimestamp(),
    plan: finalPlan
  };
  
  // Update listing in transaction
  await db.runTransaction(async (transaction) => {
    const listingDocInTx = await transaction.get(listingRef);
    
    if (!listingDocInTx.exists) {
      throw new Error('Listing disappeared during transaction');
    }
    
    const existingData = listingDocInTx.data();
    const existingUpgrades = existingData.paidUpgrades || {};
    
    const mergedUpgrades = { ...existingUpgrades };
    if (upgrades.banner) mergedUpgrades.banner = true;
    if (upgrades.premium) mergedUpgrades.premium = true;
    if (upgrades.pin) mergedUpgrades.pin = true;
    if (upgrades.confidential) mergedUpgrades.confidential = true;
    
    updateData.paidUpgrades = mergedUpgrades;
    
    if (isCommissionChange) {
      updateData.commissionChangePaid = true;
      if (metadata.newCommission) {
        updateData.pendingCommission = metadata.newCommission;
        updateData.pendingCommissionType = metadata.newCommissionType || '%';
      }
    }
    
    transaction.update(listingRef, updateData);
    console.log('[webhook] Updated listing:', listingId, 'with plan:', finalPlan, ', upgrades:', mergedUpgrades);
  });
  
  // Mark as fulfilled
  await paymentRef.update({ 
    status: 'fulfilled',
    fulfilledAt: FieldValue.serverTimestamp()
  });
}

// ========================================
// HELPER: Read raw request body
// ========================================
async function buffer(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}
