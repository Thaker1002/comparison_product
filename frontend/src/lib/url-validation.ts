// ─── URL Validation Utilities ─────────────────────────────────────────────────
// Mirrors the backend validation logic so the frontend never navigates to
// hallucinated / placeholder product URLs produced by the AI scraper.
//
// Exported so they can be imported by both ProductCard.tsx and unit tests.

// ─── Constants ────────────────────────────────────────────────────────────────

export const MARKETPLACE_DOMAINS = [
  "shopee.co.th",
  "lazada.co.th",
  "jdcentral.co.th",
  "jd.co.th",
  "bigc.co.th",
  "central.co.th",
  "makro.pro",
  "makro.co.th",
] as const;

// Domains the AI commonly hallucinates — block navigation to these
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

// Placeholder-style path patterns that signal a fabricated URL
export const FAKE_PATH_RE_LIST: RegExp[] = [
  /^\/?(product|item|listing|sku|p)s?[-_]?\d+\/?$/i, // /product8  /sku-3  /ps-4
  /^\/p\/\d+\/?$/i, // /p/12  (short numeric sub-path)
  /^\/products\/\d+\/?$/i, // /products/9
  /^\/?(?:product|item|listing|sku)[-_](?:link|url|detail|page|info|id)[-_]\d+\/?$/i, // /product-link-1  /item-url-2
  /^\/[a-z]+-link-\d+\/?$/i, // /vaseline-link-1
  /^\/[a-z]+-url-\d+\/?$/i, // /vaseline-url-3
  /^\/?(?:product|item|listing)[-_][a-z]+[-_]\d+\/?$/i, // /product-name-1  /item-detail-5
  /^\/[a-z]+(?:[-_][a-z]+)?[-_]\d+\/?$/, // /some-thing-42
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true when the pathname matches a known placeholder/fake-URL pattern.
 */
export function isFakePath(pathname: string): boolean {
  return FAKE_PATH_RE_LIST.some((re) => re.test(pathname));
}

/**
 * Returns true when a shopee.co.th URL looks structurally valid.
 *
 * Real Shopee product URLs always contain "-i.<shopId>.<itemId>" in their path.
 * Search/category/mall/shop pages are explicitly allowed.
 * A single short segment without the ".i." pattern is almost certainly fabricated.
 */
export function isPlausibleShopeeUrl(parsed: URL): boolean {
  if (!parsed.hostname.includes("shopee")) return true; // not Shopee — skip

  const path = parsed.pathname;

  // Explicit allow-list: search, category, mall, shop pages
  if (
    path.startsWith("/search") ||
    path.startsWith("/mall") ||
    path.startsWith("/shop") ||
    parsed.search.includes("keyword")
  )
    return true;

  // Real Shopee product paths contain "-i." followed by numeric IDs
  // e.g. /Vaseline-Intensive-Care-i.123456.7890123
  if (/[-.]i\.\d{4,}\.\d{4,}/.test(path)) return true;

  // A single short segment without ".i." is almost certainly fabricated
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 1) return false;

  return true;
}

/**
 * Normalise a raw URL string so it can be parsed with `new URL()`.
 * Prepends https:// when the scheme is missing.
 * Returns null when the string cannot be made into an absolute URL.
 */
export function normaliseHref(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const href = raw.trim();
  if (!href) return null;

  if (/^https?:\/\//i.test(href)) return href; // already absolute
  if (href.startsWith("//")) return `https:${href}`; // protocol-relative

  // Bare hostname (has a dot, no spaces, not a relative path)
  if (!href.startsWith("/") && href.includes(".") && !/\s/.test(href)) {
    return `https://${href}`;
  }

  return null; // relative path — cannot validate without a base
}

/**
 * Returns the URL if it is a real, openable marketplace URL; otherwise null.
 *
 * Validation order:
 *  1. Normalise to an absolute URL.
 *  2. Reject blocked/hallucinated domains.
 *  3. Reject bare IP addresses.
 *  4. Reject placeholder-style paths.
 *  5. Shopee-specific structural check.
 *  6. Must be from a known marketplace domain.
 */
export function resolveSafeUrl(raw: string | null | undefined): string | null {
  const href = normaliseHref(raw);
  if (!href) return null;

  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();

  // Block hallucinated / placeholder domains
  for (const blocked of BLOCKED_DOMAINS) {
    if (host === blocked || host.endsWith(`.${blocked}`)) return null;
  }

  // Block bare IP addresses
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;

  // Block placeholder-style paths
  if (isFakePath(parsed.pathname)) return null;

  // Marketplace-specific structural checks
  if (!isPlausibleShopeeUrl(parsed)) return null;

  // Must be from a known marketplace domain
  const fromMarketplace = MARKETPLACE_DOMAINS.some(
    (d) => host === d || host.endsWith(`.${d}`),
  );
  if (!fromMarketplace) return null;

  return href;
}

/**
 * Build a marketplace search URL as a guaranteed-safe fallback.
 * Always produces a URL that will show real search results rather than 404.
 */
export function buildSearchFallback(
  marketplaceDomain: string,
  productName: string,
): string {
  const q = encodeURIComponent(productName.slice(0, 120));
  switch (true) {
    case marketplaceDomain.includes("shopee"):
      return `https://shopee.co.th/search?keyword=${q}&sortBy=relevancy`;
    case marketplaceDomain.includes("lazada"):
      return `https://www.lazada.co.th/catalog/?q=${q}`;
    case marketplaceDomain.includes("jdcentral") ||
      marketplaceDomain.includes("jd.co"):
      return `https://www.jdcentral.co.th/c/search?keyword=${q}`;
    case marketplaceDomain.includes("bigc"):
      return `https://www.bigc.co.th/catalogsearch/result/?q=${q}`;
    case marketplaceDomain.includes("central"):
      return `https://www.central.co.th/en/search?q=${q}`;
    case marketplaceDomain.includes("makro"):
      return `https://www.makro.pro/catalogsearch/result/?q=${q}`;
    default:
      return `https://www.google.com/search?q=${q}+site:${marketplaceDomain}`;
  }
}

/**
 * Detect whether a URL is a search-results page (fallback) rather than a
 * direct product page.
 */
export function isSearchFallbackUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    return (
      path.includes("/search") ||
      path.includes("/catalog") ||
      path.includes("/catalogsearch") ||
      path.includes("/c/search") ||
      u.searchParams.has("keyword") ||
      u.searchParams.has("q") ||
      u.searchParams.has("query")
    );
  } catch {
    return false;
  }
}
