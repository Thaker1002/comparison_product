// ─── URL Validation Helpers ────────────────────────────────────────────────
// Extracted into a standalone module so they can be imported by both the
// main server (index.js) and unit tests.

// Domains that the AI commonly hallucinates as product URLs — never navigate there
export const BLOCKED_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "localhost",
  "test.com",
  "test.org",
  "placeholder.com",
  "dummy.com",
  "sample.com",
  "foo.com",
  "bar.com",
  "baz.com",
  "domain.com",
  "yourdomain.com",
  "website.com",
  "mysite.com",
  "yoursite.com",
  "store.com",
  "shop.com",
  "product.com",
  "item.com",
  "url.com",
  "link.com",
  "click.com",
]);

// Generic placeholder path patterns that indicate a fake/hallucinated URL
export const FAKE_PATH_PATTERNS = [
  /^\/product\d+$/i,                                                                 // /product8  /product123
  /^\/item\d+$/i,                                                                    // /item5
  /^\/p\/\d+$/i,                                                                     // /p/12
  /^\/products\/\d+$/i,                                                              // /products/9
  /^\/(product|item|listing|sku|ean|upc)[-_]?\d+$/i,                                // /product_8  /sku-3
  /^\/(product|item|listing|sku)[-_](link|url|detail|page|info|id)[-_]\d+$/i,       // /product-link-1  /item-url-2
  /^\/[a-z]+-link-\d+$/i,                                                            // /anything-link-1
  /^\/[a-z]+-url-\d+$/i,                                                             // /anything-url-3
  /^\/(product|item|listing)[-_][a-z]+[-_]\d+$/i,                                   // /product-name-1  /item-detail-5
  /^\/[a-z]+([-_][a-z]+)?[-_]\d+$/,                                                 // /some-thing-42
];

/**
 * Extra check: real Shopee product URLs always contain ".i." between shop-id
 * and item-id. Any shopee.co.th URL whose path is a single segment without
 * ".i." is almost certainly fake.
 *
 * @param {URL} parsed
 * @returns {boolean}
 */
export function isPlausibleShopeeUrl(parsed) {
  if (!parsed.hostname.includes("shopee")) return true; // not Shopee — skip this check
  const path = parsed.pathname;

  // Explicit allow-list: search, category, mall, shop pages
  if (
    path.startsWith("/search") ||
    path.startsWith("/mall") ||
    path.startsWith("/shop") ||
    parsed.search.includes("keyword")
  )
    return true;

  // Real product paths contain "-i." followed by numeric IDs
  // e.g. /Product-Name-i.123456.7890123
  if (/[-.]i\.\d{4,}\.\d{4,}/.test(path)) return true;

  // Anything else on Shopee with a single short path segment is suspicious
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 1) return false;

  return true;
}

/**
 * Normalise a raw URL string so it can always be parsed with `new URL()`.
 * Prepends https:// when the scheme is missing.
 *
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
export function normaliseUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Already has a scheme
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  // Protocol-relative  //example.com/...
  if (trimmed.startsWith("//")) return `https:${trimmed}`;

  // Looks like a bare hostname (has a dot and no spaces) → prepend https
  if (
    !trimmed.startsWith("/") &&
    trimmed.includes(".") &&
    !/\s/.test(trimmed)
  ) {
    return `https://${trimmed}`;
  }

  // Relative path or un-parseable — cannot validate without a base
  return null;
}

/**
 * Returns true if the URL is a plausibly real product/listing URL on the
 * given marketplace.
 *
 * Validation order:
 *  1. Normalise to an absolute URL — reject if impossible.
 *  2. Reject any URL whose hostname is in BLOCKED_DOMAINS.
 *  3. Reject bare IP addresses.
 *  4. Reject if the hostname does NOT belong to the expected marketplace domain.
 *  5. Reject if the path matches a generic placeholder pattern.
 *  6. Shopee-specific structural check.
 *
 * @param {string | null | undefined} url
 * @param {{ domain: string }} marketplace
 * @returns {boolean}
 */
export function isValidProductUrl(url, marketplace) {
  const normalised = normaliseUrl(url);
  if (!normalised) return false;

  let parsed;
  try {
    parsed = new URL(normalised);
  } catch {
    return false;
  }

  const host = parsed.hostname.toLowerCase();

  // Step 2 — hard-blocked hallucinated domains
  for (const blocked of BLOCKED_DOMAINS) {
    if (host === blocked || host.endsWith(`.${blocked}`)) return false;
  }

  // Step 3 — reject bare IP addresses (127.x, 192.168.x, etc.)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;

  // Step 4 — must belong to the expected marketplace domain
  const allowedDomains = [marketplace.domain, `www.${marketplace.domain}`];
  const fromMarketplace = allowedDomains.some(
    (d) => host === d || host.endsWith(`.${d}`),
  );
  if (!fromMarketplace) return false;

  // Step 5 — reject placeholder-style paths
  const path = parsed.pathname;
  if (FAKE_PATH_PATTERNS.some((re) => re.test(path))) return false;

  // Step 6 — marketplace-specific structural checks
  if (!isPlausibleShopeeUrl(parsed)) return false;

  return true;
}

/**
 * Returns true if an image URL looks plausibly real.
 * We are intentionally lenient — any https URL not from a blocked domain
 * is accepted.
 *
 * @param {string | null | undefined} url
 * @returns {boolean}
 */
export function isValidImageUrl(url) {
  const normalised = normaliseUrl(url);
  if (!normalised) return false;
  if (!/^https?:\/\//i.test(normalised)) return false;

  try {
    const host = new URL(normalised).hostname.toLowerCase();
    for (const blocked of BLOCKED_DOMAINS) {
      if (host === blocked || host.endsWith(`.${blocked}`)) return false;
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a direct marketplace search URL as a guaranteed-safe fallback when
 * no valid product URL is available.
 *
 * @param {{ searchUrl: (q: string) => string }} marketplace
 * @param {string} query   The original user search query
 * @param {string} [productName]  AI-extracted product name (used to refine the search)
 * @returns {string}
 */
export function buildFallbackUrl(marketplace, query, productName) {
  const searchTerm = productName
    ? `${productName} ${query}`.trim().slice(0, 120)
    : query;
  return marketplace.searchUrl(searchTerm);
}
