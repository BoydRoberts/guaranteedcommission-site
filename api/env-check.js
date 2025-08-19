// /api/env-check.js  (temporary; remove after testing)
export default function handler(req, res) {
  const hasSecret = !!process.env.STRIPE_SECRET_KEY;
  const hasPublic = !!process.env.STRIPE_PUBLIC_KEY;
  res.status(200).json({ hasSecret, hasPublic });
}
