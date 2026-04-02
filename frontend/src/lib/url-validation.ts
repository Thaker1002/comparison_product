// ─── URL Validation Utilities ─────────────────────────────────────────────────
// Mirrors the backend validation logic so the frontend never navigates to
// hallucinated / placeholder product URLs produced by the AI scraper.
//
// Exported so they can be imported by both ProductCard.tsx and unit tests.

// ─── Constants ────────────────────────────────────────────────────────────────

export const MARKETPLACE_DOMAINS = [
  // Thailand
  "shopee.co.th",
  "lazada.co.th",
  "jdcentral.co.th",
  "jd.co.th",
  "bigc.co.th",
  "central.co.th",
  "makro.pro",
  "makro.co.th",
  // India
  "amazon.in",
  "flipkart.com",
  "myntra.com",
  "jiomart.com",
  "snapdeal.com",
  "croma.com",
  // United States
  "amazon.com",
  "walmart.com",
  "bestbuy.com",
  "target.com",
  "ebay.com",
  "costco.com",
  // United Kingdom
  "amazon.co.uk",
  "argos.co.uk",
  "currys.co.uk",
  "tesco.com",
  "johnlewis.com",
  "ebay.co.uk",
  // Singapore
  "shopee.sg",
  "lazada.sg",
  "amazon.sg",
  "fairprice.com.sg",
  "courts.com.sg",
  // Malaysia
  "shopee.com.my",
  "lazada.com.my",
  "pgmall.my",
  // Japan
  "amazon.co.jp",
  "rakuten.co.jp",
  "search.rakuten.co.jp",
  "shopping.yahoo.co.jp",
  "yodobashi.com",
  // UAE
  "amazon.ae",
  "noon.com",
  "carrefouruae.com",
  "luluhypermarket.com",
  // Canada
  "amazon.ca",
  "walmart.ca",
  "bestbuy.ca",
  "canadiantire.ca",
  // Turkey
  "trendyol.com",
  "hepsiburada.com",
  "n11.com",
  "amazon.com.tr",
  "ciceksepeti.com",
  // Indonesia
  "shopee.co.id",
  "tokopedia.com",
  "lazada.co.id",
  "bukalapak.com",
  "blibli.com",
  // Philippines
  "shopee.com.ph",
  "lazada.com.ph",
  "zalora.com.ph",
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
// NOTE: keep these conservative — international marketplace URLs vary widely
export const FAKE_PATH_RE_LIST: RegExp[] = [
  /^\/?(product|item|listing|sku|p)s?[-_]?\d{1,8}\/?$/i, // /product8  /sku-3  (single segment, short numeric suffix)
  /^\/p\/\d+\/?$/i, // /p/12  (short numeric sub-path only)
  /^\/products\/\d{1,8}\/?$/i, // /products/9
  /^\/?(?:product|item|listing|sku)[-_](?:link|url|detail|page|info|id)[-_]\d+\/?$/i, // /product-link-1
  /^\/[a-z]+-link-\d+\/?$/i, // /vaseline-link-1
  /^\/[a-z]+-url-\d+\/?$/i, // /vaseline-url-3
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
 * Returns the URL if it is safe to navigate to.
 *
 * Validation order:
 *  1. Normalise to an absolute URL.
 *  2. Reject blocked/hallucinated domains.
 *  3. Reject bare IP addresses.
 *  4. Reject placeholder-style paths.
 *  5. Shopee-specific structural check.
 *
 * NOTE: We do NOT require the domain to be in a known-marketplace allowlist.
 * The backend already validates product URLs before sending them. Removing this
 * gate prevents false positives where real marketplace pages get blocked and
 * fall back to Google search.
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

  // Must be http(s) — no javascript:, data:, etc.
  if (!href.startsWith("http://") && !href.startsWith("https://")) return null;

  // Block hallucinated / placeholder domains
  for (const blocked of BLOCKED_DOMAINS) {
    if (host === blocked || host.endsWith(`.${blocked}`)) return null;
  }

  // Block bare IP addresses
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;

  // Block Google redirect wrappers (google.com/url?q=...) — extract real URL instead
  if (host.includes("google.") && parsed.searchParams.has("q")) {
    const inner = parsed.searchParams.get("q");
    if (inner && inner.startsWith("http")) {
      return resolveSafeUrl(inner);
    }
    return null;
  }

  // Block placeholder-style paths
  if (isFakePath(parsed.pathname)) return null;

  // Marketplace-specific structural checks
  if (!isPlausibleShopeeUrl(parsed)) return null;

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
  const d = marketplaceDomain.toLowerCase().replace(/^www\./, "");
  switch (true) {
    // ── Amazon (check specific regions before generic) ──────────────────────
    case d.includes("amazon.ca"):
      return `https://www.amazon.ca/s?k=${q}`;
    case d.includes("amazon.co.uk"):
      return `https://www.amazon.co.uk/s?k=${q}`;
    case d.includes("amazon.co.jp"):
      return `https://www.amazon.co.jp/s?k=${q}`;
    case d.includes("amazon.com.tr"):
      return `https://www.amazon.com.tr/s?k=${q}`;
    case d.includes("amazon.com.au"):
      return `https://www.amazon.com.au/s?k=${q}`;
    case d.includes("amazon.in"):
      return `https://www.amazon.in/s?k=${q}`;
    case d.includes("amazon.ae"):
      return `https://www.amazon.ae/s?k=${q}`;
    case d.includes("amazon.sg"):
      return `https://www.amazon.sg/s?k=${q}`;
    case d.includes("amazon.com"):
      return `https://www.amazon.com/s?k=${q}`;
    case d.includes("amazon"):
      return `https://www.amazon.com/s?k=${q}`;
    // ── Walmart ─────────────────────────────────────────────────────────────
    case d.includes("walmart.ca"):
      return `https://www.walmart.ca/search?q=${q}`;
    case d.includes("walmart"):
      return `https://www.walmart.com/search?q=${q}`;
    // ── Best Buy ─────────────────────────────────────────────────────────────
    case d.includes("bestbuy.ca"):
      return `https://www.bestbuy.ca/en-ca/search?search=${q}`;
    case d.includes("bestbuy"):
      return `https://www.bestbuy.com/site/searchpage.jsp?st=${q}`;
    // ── Shopee (check specific regions before generic) ────────────────────
    case d.includes("shopee.sg"):
      return `https://shopee.sg/search?keyword=${q}`;
    case d.includes("shopee.com.my"):
      return `https://shopee.com.my/search?keyword=${q}`;
    case d.includes("shopee.co.id"):
      return `https://shopee.co.id/search?keyword=${q}`;
    case d.includes("shopee.com.ph"):
      return `https://shopee.com.ph/search?keyword=${q}`;
    case d.includes("shopee.co.th") || d.includes("shopee"):
      return `https://shopee.co.th/search?keyword=${q}&sortBy=relevancy`;
    // ── Lazada ────────────────────────────────────────────────────────────
    case d.includes("lazada.sg"):
      return `https://www.lazada.sg/catalog/?q=${q}`;
    case d.includes("lazada.com.my"):
      return `https://www.lazada.com.my/catalog/?q=${q}`;
    case d.includes("lazada.co.id"):
      return `https://www.lazada.co.id/catalog/?q=${q}`;
    case d.includes("lazada.com.ph"):
      return `https://www.lazada.com.ph/catalog/?q=${q}`;
    case d.includes("lazada.co.th") || d.includes("lazada"):
      return `https://www.lazada.co.th/catalog/?q=${q}`;
    // ── Thailand others ────────────────────────────────────────────────────
    case d.includes("jdcentral") || d.includes("jd.co.th"):
      return `https://www.jdcentral.co.th/c/search?keyword=${q}`;
    case d.includes("bigc"):
      return `https://www.bigc.co.th/catalogsearch/result/?q=${q}`;
    case d.includes("central.co.th"):
      return `https://www.central.co.th/en/search?q=${q}`;
    case d.includes("makro"):
      return `https://www.makro.pro/catalogsearch/result/?q=${q}`;
    // ── Indonesia ─────────────────────────────────────────────────────────
    case d.includes("tokopedia"):
      return `https://www.tokopedia.com/search?st=${q}`;
    case d.includes("blibli"):
      return `https://www.blibli.com/search/${q}`;
    case d.includes("bukalapak"):
      return `https://www.bukalapak.com/products?search[keywords]=${q}`;
    // ── India ─────────────────────────────────────────────────────────────
    case d.includes("flipkart"):
      return `https://www.flipkart.com/search?q=${q}`;
    case d.includes("myntra"):
      return `https://www.myntra.com/${q}`;
    case d.includes("jiomart"):
      return `https://www.jiomart.com/search/${q}`;
    case d.includes("snapdeal"):
      return `https://www.snapdeal.com/search?keyword=${q}`;
    case d.includes("croma"):
      return `https://www.croma.com/searchB?q=${q}`;
    // ── UAE ───────────────────────────────────────────────────────────────
    case d.includes("noon"):
      return `https://www.noon.com/uae-en/search/?q=${q}`;
    case d.includes("carrefouruae"):
      return `https://www.carrefouruae.com/mafuae/en/v4/search?keyword=${q}`;
    case d.includes("luluhypermarket"):
      return `https://www.luluhypermarket.com/en-ae/search?q=${q}`;
    // ── UK ────────────────────────────────────────────────────────────────
    case d.includes("ebay.co.uk"):
      return `https://www.ebay.co.uk/sch/i.html?_nkw=${q}`;
    case d.includes("argos"):
      return `https://www.argos.co.uk/search/${q}/`;
    case d.includes("currys"):
      return `https://www.currys.co.uk/search/${q}`;
    case d.includes("tesco"):
      return `https://www.tesco.com/groceries/en-GB/search?query=${q}`;
    case d.includes("johnlewis"):
      return `https://www.johnlewis.com/search?search-term=${q}`;
    // ── Singapore ─────────────────────────────────────────────────────────
    case d.includes("fairprice"):
      return `https://www.fairprice.com.sg/search?query=${q}`;
    case d.includes("courts"):
      return `https://www.courts.com.sg/catalogsearch/result/?q=${q}`;
    // ── Malaysia ──────────────────────────────────────────────────────────
    case d.includes("pgmall"):
      return `https://www.pgmall.my/search?keyword=${q}`;
    // ── Philippines ───────────────────────────────────────────────────────
    case d.includes("zalora"):
      return `https://www.zalora.com.ph/search/?q=${q}`;
    // ── Japan ─────────────────────────────────────────────────────────────
    case d.includes("rakuten"):
      return `https://search.rakuten.co.jp/search/mall/${q}/`;
    case d.includes("shopping.yahoo.co.jp"):
      return `https://shopping.yahoo.co.jp/search?p=${q}`;
    case d.includes("yodobashi"):
      return `https://www.yodobashi.com/search/?word=${q}`;
    // ── US others ─────────────────────────────────────────────────────────
    case d.includes("target"):
      return `https://www.target.com/s?searchTerm=${q}`;
    case d.includes("ebay"):
      return `https://www.ebay.com/sch/i.html?_nkw=${q}`;
    case d.includes("costco"):
      return `https://www.costco.com/CatalogSearch?keyword=${q}`;
    // ── Canada others ─────────────────────────────────────────────────────
    case d.includes("canadiantire"):
      return `https://www.canadiantire.ca/en/search-results.html?q=${q}`;
    // ── Turkey ────────────────────────────────────────────────────────────
    case d.includes("trendyol"):
      return `https://www.trendyol.com/sr?q=${q}`;
    case d.includes("hepsiburada"):
      return `https://www.hepsiburada.com/ara?q=${q}`;
    case d.includes("n11"):
      return `https://www.n11.com/arama?q=${q}`;
    case d.includes("ciceksepeti"):
      return `https://www.ciceksepeti.com/arama?q=${q}`;
    default:
      // Last resort: Google Shopping (never returns a site: Google search)
      return `https://www.google.com/search?tbm=shop&q=${q}`;
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
