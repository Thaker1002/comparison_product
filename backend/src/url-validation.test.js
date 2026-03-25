// ─── Unit Tests: URL Validation ───────────────────────────────────────────────
// Run with:  node --test src/url-validation.test.js
//
// Uses the built-in Node.js test runner (node:test) — no extra packages needed.
// Requires Node 18+.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  normaliseUrl,
  isValidProductUrl,
  isValidImageUrl,
  buildFallbackUrl,
  isPlausibleShopeeUrl,
  BLOCKED_DOMAINS,
  FAKE_PATH_PATTERNS,
} from "./url-validation.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SHOPEE = { domain: "shopee.co.th", searchUrl: (q) => `https://shopee.co.th/search?keyword=${encodeURIComponent(q)}` };
const LAZADA = { domain: "lazada.co.th",  searchUrl: (q) => `https://www.lazada.co.th/catalog/?q=${encodeURIComponent(q)}` };
const BIGC   = { domain: "bigc.co.th",    searchUrl: (q) => `https://www.bigc.co.th/catalogsearch/result/?q=${encodeURIComponent(q)}` };
const MAKRO  = { domain: "makro.pro",     searchUrl: (q) => `https://www.makro.pro/catalogsearch/result/?q=${encodeURIComponent(q)}` };

// ─── normaliseUrl ─────────────────────────────────────────────────────────────

describe("normaliseUrl", () => {
  test("returns null for null/undefined/empty", () => {
    assert.equal(normaliseUrl(null), null);
    assert.equal(normaliseUrl(undefined), null);
    assert.equal(normaliseUrl(""), null);
    assert.equal(normaliseUrl("   "), null);
  });

  test("returns non-string input as null", () => {
    assert.equal(normaliseUrl(42), null);
    assert.equal(normaliseUrl({}), null);
  });

  test("passes through https:// URLs unchanged", () => {
    const url = "https://shopee.co.th/Vaseline-i.12345.67890";
    assert.equal(normaliseUrl(url), url);
  });

  test("passes through http:// URLs unchanged", () => {
    const url = "http://lazada.co.th/products/some-item";
    assert.equal(normaliseUrl(url), url);
  });

  test("prepends https:// to protocol-relative URLs", () => {
    assert.equal(
      normaliseUrl("//shopee.co.th/some-product"),
      "https://shopee.co.th/some-product",
    );
  });

  test("prepends https:// to bare hostnames", () => {
    assert.equal(
      normaliseUrl("shopee.co.th/some-product"),
      "https://shopee.co.th/some-product",
    );
  });

  test("returns null for relative paths (no base available)", () => {
    assert.equal(normaliseUrl("/products/123"), null);
    assert.equal(normaliseUrl("relative/path"), null);
  });

  test("trims whitespace before processing", () => {
    assert.equal(
      normaliseUrl("  https://lazada.co.th/item  "),
      "https://lazada.co.th/item",
    );
  });
});

// ─── isPlausibleShopeeUrl ─────────────────────────────────────────────────────

describe("isPlausibleShopeeUrl", () => {
  const url = (path, search = "") =>
    new URL(`https://shopee.co.th${path}${search}`);

  test("always true for non-Shopee hostnames", () => {
    const parsed = new URL("https://lazada.co.th/product-link-1");
    assert.equal(isPlausibleShopeeUrl(parsed), true);
  });

  test("allows Shopee search pages", () => {
    assert.equal(isPlausibleShopeeUrl(url("/search", "?keyword=vaseline")), true);
  });

  test("allows Shopee keyword query string", () => {
    assert.equal(isPlausibleShopeeUrl(url("/", "?keyword=vaseline")), true);
  });

  test("allows Shopee mall pages", () => {
    assert.equal(isPlausibleShopeeUrl(url("/mall")), true);
  });

  test("allows Shopee shop pages", () => {
    assert.equal(isPlausibleShopeeUrl(url("/shop/12345")), true);
  });

  test("allows real Shopee product URL with .i. pattern", () => {
    assert.equal(
      isPlausibleShopeeUrl(url("/Vaseline-Intensive-Care-i.123456.7890123")),
      true,
    );
  });

  test("allows real Shopee product URL with -i. pattern", () => {
    assert.equal(
      isPlausibleShopeeUrl(url("/Some-Product-i.100000.9999999")),
      true,
    );
  });

  test("rejects a single-segment path without .i. pattern", () => {
    assert.equal(isPlausibleShopeeUrl(url("/product-link-1")), false);
  });

  test("rejects single short segment like /product8", () => {
    assert.equal(isPlausibleShopeeUrl(url("/product8")), false);
  });

  test("allows multi-segment Shopee paths (category-style)", () => {
    // Multi-segment paths are not rejected by the single-segment heuristic
    assert.equal(isPlausibleShopeeUrl(url("/health-beauty/vaseline")), true);
  });
});

// ─── isValidProductUrl ────────────────────────────────────────────────────────

describe("isValidProductUrl — rejects invalid/fake URLs", () => {
  test("rejects null", () => {
    assert.equal(isValidProductUrl(null, SHOPEE), false);
  });

  test("rejects empty string", () => {
    assert.equal(isValidProductUrl("", SHOPEE), false);
  });

  test("rejects relative paths", () => {
    assert.equal(isValidProductUrl("/products/9", SHOPEE), false);
  });

  // Blocked domains
  test("rejects example.com", () => {
    assert.equal(isValidProductUrl("https://example.com/product8", SHOPEE), false);
  });

  test("rejects sub.example.com", () => {
    assert.equal(isValidProductUrl("https://sub.example.com/thing", SHOPEE), false);
  });

  test("rejects localhost", () => {
    assert.equal(isValidProductUrl("http://localhost:3000/item", SHOPEE), false);
  });

  test("rejects placeholder.com", () => {
    assert.equal(isValidProductUrl("https://placeholder.com/item1", LAZADA), false);
  });

  // IP addresses
  test("rejects bare IP addresses", () => {
    assert.equal(isValidProductUrl("http://192.168.1.1/product", SHOPEE), false);
    assert.equal(isValidProductUrl("http://127.0.0.1/item", LAZADA), false);
  });

  // Wrong marketplace
  test("rejects URL from wrong marketplace domain", () => {
    assert.equal(
      isValidProductUrl("https://lazada.co.th/product/123", SHOPEE),
      false,
    );
  });

  test("rejects google.com when marketplace is Shopee", () => {
    assert.equal(
      isValidProductUrl("https://www.google.com/search?q=vaseline", SHOPEE),
      false,
    );
  });

  // Fake path patterns
  test("rejects /product8", () => {
    assert.equal(
      isValidProductUrl("https://shopee.co.th/product8", SHOPEE),
      false,
    );
  });

  test("rejects /item5", () => {
    assert.equal(
      isValidProductUrl("https://shopee.co.th/item5", SHOPEE),
      false,
    );
  });

  test("rejects /product-link-1 (classic hallucination)", () => {
    assert.equal(
      isValidProductUrl("https://shopee.co.th/product-link-1", SHOPEE),
      false,
    );
  });

  test("rejects /item-url-2", () => {
    assert.equal(
      isValidProductUrl("https://shopee.co.th/item-url-2", SHOPEE),
      false,
    );
  });

  test("rejects /sku-3", () => {
    assert.equal(
      isValidProductUrl("https://shopee.co.th/sku-3", SHOPEE),
      false,
    );
  });

  test("rejects /product-name-1", () => {
    assert.equal(
      isValidProductUrl("https://shopee.co.th/product-name-1", SHOPEE),
      false,
    );
  });

  test("rejects /anything-link-1", () => {
    assert.equal(
      isValidProductUrl("https://shopee.co.th/vaseline-link-1", SHOPEE),
      false,
    );
  });

  test("rejects /anything-url-3", () => {
    assert.equal(
      isValidProductUrl("https://lazada.co.th/vaseline-url-3", LAZADA),
      false,
    );
  });

  test("rejects Shopee single-segment without .i. pattern (structural check)", () => {
    assert.equal(
      isValidProductUrl("https://shopee.co.th/fake-product-42", SHOPEE),
      false,
    );
  });
});

describe("isValidProductUrl — accepts valid URLs", () => {
  test("accepts real Shopee product URL", () => {
    assert.equal(
      isValidProductUrl(
        "https://shopee.co.th/Vaseline-Intensive-Care-i.123456.7890123",
        SHOPEE,
      ),
      true,
    );
  });

  test("accepts www-prefixed marketplace domain", () => {
    assert.equal(
      isValidProductUrl(
        "https://www.lazada.co.th/products/vaseline-lotion-i123-s456.html",
        LAZADA,
      ),
      true,
    );
  });

  test("accepts Shopee search fallback URL", () => {
    assert.equal(
      isValidProductUrl(
        "https://shopee.co.th/search?keyword=vaseline&sortBy=relevancy",
        SHOPEE,
      ),
      true,
    );
  });

  test("accepts Lazada catalog search URL", () => {
    assert.equal(
      isValidProductUrl(
        "https://www.lazada.co.th/catalog/?q=vaseline",
        LAZADA,
      ),
      true,
    );
  });

  test("accepts Big C search URL", () => {
    assert.equal(
      isValidProductUrl(
        "https://www.bigc.co.th/catalogsearch/result/?q=vaseline",
        BIGC,
      ),
      true,
    );
  });

  test("accepts Makro search URL", () => {
    assert.equal(
      isValidProductUrl(
        "https://www.makro.pro/catalogsearch/result/?q=vaseline",
        MAKRO,
      ),
      true,
    );
  });

  test("normalises bare hostname before validating", () => {
    // Without scheme — normaliseUrl should prepend https://
    assert.equal(
      isValidProductUrl(
        "shopee.co.th/Vaseline-Intensive-Care-i.123456.7890123",
        SHOPEE,
      ),
      true,
    );
  });

  test("normalises protocol-relative URL", () => {
    assert.equal(
      isValidProductUrl(
        "//shopee.co.th/search?keyword=vaseline",
        SHOPEE,
      ),
      true,
    );
  });
});

// ─── isValidImageUrl ──────────────────────────────────────────────────────────

describe("isValidImageUrl", () => {
  test("rejects null", () => {
    assert.equal(isValidImageUrl(null), false);
  });

  test("rejects empty string", () => {
    assert.equal(isValidImageUrl(""), false);
  });

  test("rejects relative paths", () => {
    assert.equal(isValidImageUrl("/images/product.jpg"), false);
  });

  test("rejects example.com image URLs", () => {
    assert.equal(isValidImageUrl("https://example.com/img.jpg"), false);
  });

  test("rejects bare IP images", () => {
    assert.equal(isValidImageUrl("https://192.168.0.1/img.jpg"), false);
  });

  test("accepts a real Shopee CDN image", () => {
    assert.equal(
      isValidImageUrl(
        "https://cf.shopee.co.th/file/sg-11134201-7qvdc-abc123def456",
      ),
      true,
    );
  });

  test("accepts a Lazada CDN image URL", () => {
    assert.equal(
      isValidImageUrl(
        "https://lzd-img-global.slatic.net/g/ff/kf/S93/some-image.jpg",
      ),
      true,
    );
  });

  test("accepts any https CDN image not on a blocked domain", () => {
    assert.equal(
      isValidImageUrl("https://images.unsplash.com/photo-123?w=400"),
      true,
    );
  });

  test("accepts http image URLs (lenient)", () => {
    assert.equal(
      isValidImageUrl("http://cdn.example-store.com/product.jpg"),
      true,
    );
  });
});

// ─── buildFallbackUrl ─────────────────────────────────────────────────────────

describe("buildFallbackUrl", () => {
  test("builds Shopee search URL from query alone", () => {
    const url = buildFallbackUrl(SHOPEE, "vaseline", null);
    assert.ok(url.startsWith("https://shopee.co.th/search?keyword="));
    assert.ok(url.includes("vaseline"));
  });

  test("builds Shopee search URL combining productName + query", () => {
    const url = buildFallbackUrl(SHOPEE, "vaseline", "Intensive Care Lotion");
    assert.ok(url.includes("Intensive+Care+Lotion") || url.includes("Intensive%20Care%20Lotion") || url.includes("vaseline"));
  });

  test("truncates very long search terms to 120 chars", () => {
    const longName = "A".repeat(200);
    const url = buildFallbackUrl(SHOPEE, "vaseline", longName);
    // The combined search term should be truncated to 120 chars before encoding
    const keyword = new URL(url).searchParams.get("keyword");
    assert.ok(keyword !== null && keyword.length <= 120);
  });

  test("builds Lazada catalog URL", () => {
    const url = buildFallbackUrl(LAZADA, "vaseline", null);
    assert.ok(url.startsWith("https://www.lazada.co.th/catalog/"));
    assert.ok(url.includes("vaseline"));
  });

  test("uses productName when provided instead of bare query", () => {
    const url = buildFallbackUrl(LAZADA, "lotion", "Vaseline Petroleum Jelly");
    assert.ok(url.includes("Vaseline") || url.includes("vaseline"));
  });
});

// ─── FAKE_PATH_PATTERNS (spot-check the regex list directly) ─────────────────

describe("FAKE_PATH_PATTERNS", () => {
  const isFake = (path) => FAKE_PATH_PATTERNS.some((re) => re.test(path));

  test("matches /product8", () => assert.ok(isFake("/product8")));
  test("matches /item5", () => assert.ok(isFake("/item5")));
  test("matches /p/12", () => assert.ok(isFake("/p/12")));
  test("matches /products/9", () => assert.ok(isFake("/products/9")));
  test("matches /sku-3", () => assert.ok(isFake("/sku-3")));
  test("matches /product-link-1", () => assert.ok(isFake("/product-link-1")));
  test("matches /item-url-2", () => assert.ok(isFake("/item-url-2")));
  test("matches /vaseline-link-1", () => assert.ok(isFake("/vaseline-link-1")));
  test("matches /product-name-1", () => assert.ok(isFake("/product-name-1")));
  test("matches /item-detail-5", () => assert.ok(isFake("/item-detail-5")));
  test("matches /some-thing-42", () => assert.ok(isFake("/some-thing-42")));

  test("does NOT match real Shopee product path", () =>
    assert.ok(!isFake("/Vaseline-Intensive-Care-i.123456.7890123")));
  test("does NOT match Shopee search path", () =>
    assert.ok(!isFake("/search")));
  test("does NOT match Lazada product path with real slug", () =>
    assert.ok(!isFake("/products/vaseline-intensive-care-lotion-i12345-s678.html")));
  test("does NOT match empty path", () =>
    assert.ok(!isFake("/")));
  test("does NOT match Lazada catalog path", () =>
    assert.ok(!isFake("/catalog/")));
});

// ─── BLOCKED_DOMAINS spot-checks ─────────────────────────────────────────────

describe("BLOCKED_DOMAINS", () => {
  test("contains example.com", () => assert.ok(BLOCKED_DOMAINS.has("example.com")));
  test("contains localhost", () => assert.ok(BLOCKED_DOMAINS.has("localhost")));
  test("contains placeholder.com", () => assert.ok(BLOCKED_DOMAINS.has("placeholder.com")));
  test("does NOT contain shopee.co.th", () => assert.ok(!BLOCKED_DOMAINS.has("shopee.co.th")));
  test("does NOT contain lazada.co.th", () => assert.ok(!BLOCKED_DOMAINS.has("lazada.co.th")));
});
