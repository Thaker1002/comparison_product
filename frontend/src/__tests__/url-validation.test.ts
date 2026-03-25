// ─── Unit Tests: Frontend URL Validation ──────────────────────────────────────
// Run with:  npm test   (or: npx vitest run src/__tests__/url-validation.test.ts)
//
// Uses Vitest — install with: npm install -D vitest

import { describe, test, expect } from "vitest";
import {
  normaliseHref,
  resolveSafeUrl,
  buildSearchFallback,
  isFakePath,
  isPlausibleShopeeUrl,
  isSearchFallbackUrl,
  MARKETPLACE_DOMAINS,
  BLOCKED_DOMAINS,
  FAKE_PATH_RE_LIST,
} from "../lib/url-validation";

// ─── normaliseHref ────────────────────────────────────────────────────────────

describe("normaliseHref", () => {
  test("returns null for null", () => expect(normaliseHref(null)).toBeNull());
  test("returns null for undefined", () => expect(normaliseHref(undefined)).toBeNull());
  test("returns null for empty string", () => expect(normaliseHref("")).toBeNull());
  test("returns null for whitespace-only string", () => expect(normaliseHref("   ")).toBeNull());

  test("passes through https:// URLs unchanged", () => {
    const url = "https://shopee.co.th/Vaseline-i.12345.67890";
    expect(normaliseHref(url)).toBe(url);
  });

  test("passes through http:// URLs unchanged", () => {
    const url = "http://lazada.co.th/products/some-item";
    expect(normaliseHref(url)).toBe(url);
  });

  test("prepends https:// to protocol-relative URLs", () => {
    expect(normaliseHref("//shopee.co.th/some-product")).toBe(
      "https://shopee.co.th/some-product",
    );
  });

  test("prepends https:// to bare hostnames with a dot", () => {
    expect(normaliseHref("shopee.co.th/some-product")).toBe(
      "https://shopee.co.th/some-product",
    );
  });

  test("returns null for relative paths (no base to resolve against)", () => {
    expect(normaliseHref("/products/123")).toBeNull();
    expect(normaliseHref("relative/path")).toBeNull();
  });

  test("trims surrounding whitespace before processing", () => {
    expect(normaliseHref("  https://lazada.co.th/item  ")).toBe(
      "https://lazada.co.th/item",
    );
  });
});

// ─── isFakePath ───────────────────────────────────────────────────────────────

describe("isFakePath — matches fake/hallucinated paths", () => {
  test("/product8", () => expect(isFakePath("/product8")).toBe(true));
  test("/product123", () => expect(isFakePath("/product123")).toBe(true));
  test("/item5", () => expect(isFakePath("/item5")).toBe(true));
  test("/p/12", () => expect(isFakePath("/p/12")).toBe(true));
  test("/products/9", () => expect(isFakePath("/products/9")).toBe(true));
  test("/sku-3", () => expect(isFakePath("/sku-3")).toBe(true));
  test("/sku3", () => expect(isFakePath("/sku3")).toBe(true));
  test("/product-link-1", () => expect(isFakePath("/product-link-1")).toBe(true));
  test("/item-url-2", () => expect(isFakePath("/item-url-2")).toBe(true));
  test("/listing-detail-7", () => expect(isFakePath("/listing-detail-7")).toBe(true));
  test("/vaseline-link-1", () => expect(isFakePath("/vaseline-link-1")).toBe(true));
  test("/vaseline-url-3", () => expect(isFakePath("/vaseline-url-3")).toBe(true));
  test("/product-name-1", () => expect(isFakePath("/product-name-1")).toBe(true));
  test("/item-detail-5", () => expect(isFakePath("/item-detail-5")).toBe(true));
  test("/some-thing-42", () => expect(isFakePath("/some-thing-42")).toBe(true));
});

describe("isFakePath — does NOT match real paths", () => {
  test("real Shopee product path", () =>
    expect(isFakePath("/Vaseline-Intensive-Care-i.123456.7890123")).toBe(false));
  test("Shopee search path", () =>
    expect(isFakePath("/search")).toBe(false));
  test("Lazada product with real slug+id", () =>
    expect(isFakePath("/products/vaseline-lotion-i12345-s678.html")).toBe(false));
  test("empty root path", () =>
    expect(isFakePath("/")).toBe(false));
  test("catalog path", () =>
    expect(isFakePath("/catalog/")).toBe(false));
  test("multi-segment category path", () =>
    expect(isFakePath("/health-beauty/vaseline")).toBe(false));
  test("Big C search path", () =>
    expect(isFakePath("/catalogsearch/result/")).toBe(false));
});

// ─── isPlausibleShopeeUrl ─────────────────────────────────────────────────────

describe("isPlausibleShopeeUrl", () => {
  const make = (path: string, search = "") =>
    new URL(`https://shopee.co.th${path}${search}`);

  test("returns true for non-Shopee hostnames (no check needed)", () => {
    expect(isPlausibleShopeeUrl(new URL("https://lazada.co.th/product-link-1"))).toBe(true);
    expect(isPlausibleShopeeUrl(new URL("https://bigc.co.th/product8"))).toBe(true);
  });

  test("allows Shopee search pages", () => {
    expect(isPlausibleShopeeUrl(make("/search", "?keyword=vaseline"))).toBe(true);
  });

  test("allows Shopee keyword in query string (any path)", () => {
    expect(isPlausibleShopeeUrl(make("/", "?keyword=vaseline"))).toBe(true);
  });

  test("allows Shopee mall pages", () => {
    expect(isPlausibleShopeeUrl(make("/mall"))).toBe(true);
    expect(isPlausibleShopeeUrl(make("/mall/official-stores"))).toBe(true);
  });

  test("allows Shopee shop pages", () => {
    expect(isPlausibleShopeeUrl(make("/shop/12345"))).toBe(true);
  });

  test("allows real Shopee product URL with -i. pattern", () => {
    expect(isPlausibleShopeeUrl(make("/Vaseline-Intensive-Care-i.123456.7890123"))).toBe(true);
  });

  test("allows real Shopee product URL with .i. pattern", () => {
    expect(isPlausibleShopeeUrl(make("/Some-Product.i.100000.9999999"))).toBe(true);
  });

  test("rejects Shopee single-segment without .i. pattern", () => {
    expect(isPlausibleShopeeUrl(make("/product-link-1"))).toBe(false);
    expect(isPlausibleShopeeUrl(make("/product8"))).toBe(false);
    expect(isPlausibleShopeeUrl(make("/fake-product"))).toBe(false);
  });

  test("allows multi-segment Shopee paths (category-style)", () => {
    // Two or more path segments pass the single-segment heuristic
    expect(isPlausibleShopeeUrl(make("/health-beauty/vaseline"))).toBe(true);
  });
});

// ─── resolveSafeUrl ───────────────────────────────────────────────────────────

describe("resolveSafeUrl — rejects unsafe / hallucinated URLs", () => {
  test("rejects null", () => expect(resolveSafeUrl(null)).toBeNull());
  test("rejects undefined", () => expect(resolveSafeUrl(undefined)).toBeNull());
  test("rejects empty string", () => expect(resolveSafeUrl("")).toBeNull());
  test("rejects relative paths", () => expect(resolveSafeUrl("/products/9")).toBeNull());

  // Blocked domains
  test("rejects example.com", () =>
    expect(resolveSafeUrl("https://example.com/product8")).toBeNull());
  test("rejects sub.example.com", () =>
    expect(resolveSafeUrl("https://sub.example.com/thing")).toBeNull());
  test("rejects localhost", () =>
    expect(resolveSafeUrl("http://localhost:3000/item")).toBeNull());
  test("rejects placeholder.com", () =>
    expect(resolveSafeUrl("https://placeholder.com/item1")).toBeNull());
  test("rejects test.com", () =>
    expect(resolveSafeUrl("https://test.com/product")).toBeNull());

  // IP addresses
  test("rejects bare 192.168.x.x", () =>
    expect(resolveSafeUrl("http://192.168.1.1/product")).toBeNull());
  test("rejects 127.0.0.1", () =>
    expect(resolveSafeUrl("http://127.0.0.1/item")).toBeNull());

  // Non-marketplace domains
  test("rejects google.com", () =>
    expect(resolveSafeUrl("https://www.google.com/search?q=vaseline")).toBeNull());
  test("rejects amazon.com", () =>
    expect(resolveSafeUrl("https://www.amazon.com/dp/B0001234")).toBeNull());

  // Fake path patterns
  test("rejects /product8 on Shopee", () =>
    expect(resolveSafeUrl("https://shopee.co.th/product8")).toBeNull());
  test("rejects /item5 on Shopee", () =>
    expect(resolveSafeUrl("https://shopee.co.th/item5")).toBeNull());
  test("rejects /product-link-1 (classic hallucination)", () =>
    expect(resolveSafeUrl("https://shopee.co.th/product-link-1")).toBeNull());
  test("rejects /item-url-2", () =>
    expect(resolveSafeUrl("https://shopee.co.th/item-url-2")).toBeNull());
  test("rejects /vaseline-link-1", () =>
    expect(resolveSafeUrl("https://shopee.co.th/vaseline-link-1")).toBeNull());
  test("rejects /vaseline-url-3 on Lazada", () =>
    expect(resolveSafeUrl("https://lazada.co.th/vaseline-url-3")).toBeNull());
  test("rejects /sku-3", () =>
    expect(resolveSafeUrl("https://shopee.co.th/sku-3")).toBeNull());
  test("rejects /product-name-1", () =>
    expect(resolveSafeUrl("https://shopee.co.th/product-name-1")).toBeNull());

  // Shopee-specific structural check
  test("rejects Shopee single-segment without .i. pattern", () =>
    expect(resolveSafeUrl("https://shopee.co.th/fake-product-42")).toBeNull());
});

describe("resolveSafeUrl — accepts valid marketplace URLs", () => {
  test("accepts real Shopee product URL", () => {
    const url = "https://shopee.co.th/Vaseline-Intensive-Care-i.123456.7890123";
    expect(resolveSafeUrl(url)).toBe(url);
  });

  test("accepts www-prefixed Shopee URL", () => {
    const url = "https://www.shopee.co.th/Vaseline-i.111111.2222222";
    expect(resolveSafeUrl(url)).toBe(url);
  });

  test("accepts Shopee search fallback URL", () => {
    const url = "https://shopee.co.th/search?keyword=vaseline&sortBy=relevancy";
    expect(resolveSafeUrl(url)).toBe(url);
  });

  test("accepts Lazada catalog search URL", () => {
    const url = "https://www.lazada.co.th/catalog/?q=vaseline";
    expect(resolveSafeUrl(url)).toBe(url);
  });

  test("accepts Lazada product URL with real slug", () => {
    const url = "https://www.lazada.co.th/products/vaseline-lotion-i12345-s678.html";
    expect(resolveSafeUrl(url)).toBe(url);
  });

  test("accepts Big C search URL", () => {
    const url = "https://www.bigc.co.th/catalogsearch/result/?q=vaseline";
    expect(resolveSafeUrl(url)).toBe(url);
  });

  test("accepts Central search URL", () => {
    const url = "https://www.central.co.th/en/search?q=vaseline";
    expect(resolveSafeUrl(url)).toBe(url);
  });

  test("accepts Makro search URL", () => {
    const url = "https://www.makro.pro/catalogsearch/result/?q=vaseline";
    expect(resolveSafeUrl(url)).toBe(url);
  });

  test("accepts JD Central search URL", () => {
    const url = "https://www.jdcentral.co.th/c/search?keyword=vaseline";
    expect(resolveSafeUrl(url)).toBe(url);
  });

  test("normalises bare hostname (prepends https://)", () => {
    const result = resolveSafeUrl("shopee.co.th/search?keyword=vaseline");
    expect(result).toBe("https://shopee.co.th/search?keyword=vaseline");
  });

  test("normalises protocol-relative URL", () => {
    const result = resolveSafeUrl("//shopee.co.th/search?keyword=vaseline");
    expect(result).toBe("https://shopee.co.th/search?keyword=vaseline");
  });
});

// ─── buildSearchFallback ──────────────────────────────────────────────────────

describe("buildSearchFallback", () => {
  test("builds Shopee search URL", () => {
    const url = buildSearchFallback("shopee.co.th", "vaseline");
    expect(url).toContain("shopee.co.th/search?keyword=");
    expect(url).toContain("vaseline");
  });

  test("builds Lazada catalog URL", () => {
    const url = buildSearchFallback("lazada.co.th", "vaseline");
    expect(url).toContain("lazada.co.th/catalog/");
    expect(url).toContain("vaseline");
  });

  test("builds JD Central search URL", () => {
    const url = buildSearchFallback("jdcentral.co.th", "vaseline");
    expect(url).toContain("jdcentral.co.th/c/search");
    expect(url).toContain("vaseline");
  });

  test("builds Big C search URL", () => {
    const url = buildSearchFallback("bigc.co.th", "vaseline");
    expect(url).toContain("bigc.co.th/catalogsearch/result/");
    expect(url).toContain("vaseline");
  });

  test("builds Central search URL", () => {
    const url = buildSearchFallback("central.co.th", "vaseline");
    expect(url).toContain("central.co.th/en/search");
    expect(url).toContain("vaseline");
  });

  test("builds Makro search URL", () => {
    const url = buildSearchFallback("makro.pro", "vaseline");
    expect(url).toContain("makro.pro/catalogsearch/result/");
    expect(url).toContain("vaseline");
  });

  test("falls back to Google site-search for unknown domain", () => {
    const url = buildSearchFallback("some-unknown-market.co.th", "vaseline");
    expect(url).toContain("google.com/search");
    expect(url).toContain("some-unknown-market.co.th");
  });

  test("truncates product names longer than 120 characters", () => {
    const longName = "A".repeat(200);
    const url = buildSearchFallback("shopee.co.th", longName);
    const keyword = new URL(url).searchParams.get("keyword");
    expect(keyword).not.toBeNull();
    expect(keyword!.length).toBeLessThanOrEqual(120);
  });

  test("encodes special characters in the product name", () => {
    const url = buildSearchFallback("shopee.co.th", "วาสลีน ครีม");
    expect(url).toContain("shopee.co.th/search?keyword=");
    // Should be URL-encoded and not throw
    expect(() => new URL(url)).not.toThrow();
  });
});

// ─── isSearchFallbackUrl ──────────────────────────────────────────────────────

describe("isSearchFallbackUrl", () => {
  test("returns true for Shopee keyword search URL", () =>
    expect(isSearchFallbackUrl("https://shopee.co.th/search?keyword=vaseline")).toBe(true));

  test("returns true for Lazada catalog search URL", () =>
    expect(isSearchFallbackUrl("https://www.lazada.co.th/catalog/?q=vaseline")).toBe(true));

  test("returns true for Big C catalogsearch URL", () =>
    expect(isSearchFallbackUrl("https://www.bigc.co.th/catalogsearch/result/?q=vaseline")).toBe(true));

  test("returns true for JD Central c/search URL", () =>
    expect(isSearchFallbackUrl("https://www.jdcentral.co.th/c/search?keyword=vaseline")).toBe(true));

  test("returns true for Central /en/search URL", () =>
    expect(isSearchFallbackUrl("https://www.central.co.th/en/search?q=vaseline")).toBe(true));

  test("returns false for a real Shopee product URL", () =>
    expect(isSearchFallbackUrl("https://shopee.co.th/Vaseline-i.123456.7890123")).toBe(false));

  test("returns false for a real Lazada product URL", () =>
    expect(isSearchFallbackUrl("https://www.lazada.co.th/products/vaseline-i12345-s678.html")).toBe(false));

  test("returns false for an empty string (does not throw)", () =>
    expect(isSearchFallbackUrl("")).toBe(false));

  test("returns false for a non-URL string (does not throw)", () =>
    expect(isSearchFallbackUrl("not a url at all")).toBe(false));
});

// ─── MARKETPLACE_DOMAINS ──────────────────────────────────────────────────────

describe("MARKETPLACE_DOMAINS", () => {
  test("contains shopee.co.th", () =>
    expect(MARKETPLACE_DOMAINS).toContain("shopee.co.th"));
  test("contains lazada.co.th", () =>
    expect(MARKETPLACE_DOMAINS).toContain("lazada.co.th"));
  test("contains jdcentral.co.th", () =>
    expect(MARKETPLACE_DOMAINS).toContain("jdcentral.co.th"));
  test("contains bigc.co.th", () =>
    expect(MARKETPLACE_DOMAINS).toContain("bigc.co.th"));
  test("contains central.co.th", () =>
    expect(MARKETPLACE_DOMAINS).toContain("central.co.th"));
  test("contains makro.pro", () =>
    expect(MARKETPLACE_DOMAINS).toContain("makro.pro"));
  test("does NOT contain example.com", () =>
    expect(MARKETPLACE_DOMAINS).not.toContain("example.com"));
  test("does NOT contain google.com", () =>
    expect(MARKETPLACE_DOMAINS).not.toContain("google.com"));
});

// ─── BLOCKED_DOMAINS ──────────────────────────────────────────────────────────

describe("BLOCKED_DOMAINS", () => {
  test("contains example.com", () => expect(BLOCKED_DOMAINS.has("example.com")).toBe(true));
  test("contains example.org", () => expect(BLOCKED_DOMAINS.has("example.org")).toBe(true));
  test("contains example.net", () => expect(BLOCKED_DOMAINS.has("example.net")).toBe(true));
  test("contains localhost", () => expect(BLOCKED_DOMAINS.has("localhost")).toBe(true));
  test("contains placeholder.com", () => expect(BLOCKED_DOMAINS.has("placeholder.com")).toBe(true));
  test("contains dummy.com", () => expect(BLOCKED_DOMAINS.has("dummy.com")).toBe(true));
  test("contains test.com", () => expect(BLOCKED_DOMAINS.has("test.com")).toBe(true));

  test("does NOT contain shopee.co.th", () => expect(BLOCKED_DOMAINS.has("shopee.co.th")).toBe(false));
  test("does NOT contain lazada.co.th", () => expect(BLOCKED_DOMAINS.has("lazada.co.th")).toBe(false));
  test("does NOT contain bigc.co.th", () => expect(BLOCKED_DOMAINS.has("bigc.co.th")).toBe(false));
});

// ─── FAKE_PATH_RE_LIST (direct regex checks) ──────────────────────────────────

describe("FAKE_PATH_RE_LIST direct checks", () => {
  const isFakeRaw = (path: string) => FAKE_PATH_RE_LIST.some((re) => re.test(path));

  const fakeOnes = [
    "/product8",
    "/product123",
    "/item5",
    "/p/12",
    "/products/9",
    "/sku3",
    "/sku-3",
    "/listing-4",
    "/product-link-1",
    "/item-url-2",
    "/listing-detail-7",
    "/vaseline-link-1",
    "/anything-url-3",
    "/product-name-1",
    "/item-detail-5",
    "/some-thing-42",
  ];

  const realOnes = [
    "/Vaseline-Intensive-Care-i.123456.7890123",
    "/search",
    "/catalog/",
    "/catalogsearch/result/",
    "/health-beauty/vaseline",
    "/products/vaseline-lotion-i12345-s678.html",
    "/c/search",
    "/en/search",
    "/",
  ];

  fakeOnes.forEach((path) => {
    test(`matches fake path: ${path}`, () => expect(isFakeRaw(path)).toBe(true));
  });

  realOnes.forEach((path) => {
    test(`does NOT match real path: ${path}`, () => expect(isFakeRaw(path)).toBe(false));
  });
});
