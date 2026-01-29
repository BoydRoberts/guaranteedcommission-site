// /scripts/app-config.js
// Centralized configuration for Stripe and other app-wide settings
// This file must load BEFORE any scripts that use these values
window.GC_CONFIG = window.GC_CONFIG || {};
// Stripe publishable key (test mode)
// IMPORTANT: Replace with live key when going to production
window.GC_CONFIG.STRIPE_PUBLISHABLE_KEY =
  window.GC_CONFIG.STRIPE_PUBLISHABLE_KEY ||
  "pk_test_51RiGoUPTiT2zuxx0T2Jk2YSvCjeHeQLb8KJnNs8gPwLtGq3AxqydjA4wcHknoee1GMB9zlKLG093DIAIE61KLqyw00hEmYRmhD";
// Stripe Price IDs (test mode)
// IMPORTANT: Replace with live price IDs when going to production
window.GC_CONFIG.PRICE_IDS = window.GC_CONFIG.PRICE_IDS || {
  // One-time listing upgrades
  PLUS:         "price_1RsQFlPTiT2zuxx0414nGtTu",
  FSBO_PLUS:    "price_1RsQJbPTiT2zuxx0w3GUIdxJ",
  BANNER:       "price_1RsQTOPTiT2zuxx0TLCwAthR",
  PREMIUM:      "price_1RsQbjPTiT2zuxx0hA6p5H4h",
  PIN:          "price_1RsQknPTiT2zuxx0Av9skJyW",
  CONFIDENTIAL: "price_1RsRP4PTiT2zuxx0eoOGEDvm",
  CHANGE_COMMISSION_LISTED: "price_1STqWzPTiT2zuxx0ZKLMFpuE",
  CHANGE_COMMISSION_FSBO:   "price_1STqakPTiT2zuxx0zS0nEjDT",
  // ==========================================
  // Subscriptions: Local Ads by ZIP
  // - Local Pro: $5/month per ZIP  -> quantity = # ZIPs
  // - Local Broker: $99/month per ZIP -> quantity = # ZIPs
  // ==========================================
  LOCAL_PRO_MONTHLY:    "price_1SQXeOPTiT2zuxx08ruzwpb6",
  LOCAL_BROKER_MONTHLY: "price_1SQXmVPTiT2zuxx0bIP98lVs"
};
// Log configuration loaded (helps with debugging)
console.log("[app-config] GC_CONFIG loaded - Stripe configured");
