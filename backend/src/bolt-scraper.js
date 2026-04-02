// ============================================================
//  BOLT SCRAPER — Playwright API interception
//  Intercepts Bolt's booking price API via their ride page.
//  URL: bolt.eu/${locale}/ride/?startLat=&startLng=&endLat=&endLng=
//  No login required — passes coords as URL params directly.
// ============================================================
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";

chromium.use(stealth());

const BOLT_LOCALE = {
  TH: "en-th", SG: "en-sg", MY: "en-my", ID: "en-id",
  IN: "en-in", AE: "en-ae", US: "en-us", CA: "en-ca",
  UK: "en-gb", TR: "en-tr",
};

const CURRENCY = {
  TH: "THB", SG: "SGD", MY: "MYR", ID: "IDR",
  IN: "INR", AE: "AED", US: "USD", CA: "CAD",
  UK: "GBP", TR: "TRY",
};

const TIMEOUT = parseInt(process.env.SCRAPER_TIMEOUT_MS) || 18000;
const HEADLESS = process.env.SCRAPER_HEADLESS !== "false";

export async function scrapeBoltFares({ pickup, dropoff, country }) {
  const locale = BOLT_LOCALE[country];
  if (!locale) {
    console.warn(`[Bolt] No locale mapping for country: ${country}`);
    return null;
  }

  console.log(`⚡ Bolt scrape: ${country} (${locale})`);
  let browser = null;

  try {
    browser = await chromium.launch({
      headless: HEADLESS,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=390,844",
      ],
    });

    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      locale: "en-US",
      geolocation: { latitude: pickup.lat, longitude: pickup.lng },
      permissions: ["geolocation"],
      viewport: { width: 390, height: 844 },
    });

    const page = await context.newPage();
    let capturedFares = null;

    // Bolt has changed its API shape several times — intercept all known patterns
    const boltPatterns = [
      "**/booking/v1/price**",
      "**/booking/v2/price**",
      "**/ride/v1/search**",
      "**/price/v1**",
      "**bolt.eu/booking/**",
    ];

    for (const pattern of boltPatterns) {
      await page.route(pattern, async (route) => {
        try {
          const response = await route.fetch();
          const json = await response.json().catch(() => null);
          if (json && !capturedFares) {
            const prices =
              json.data?.categories ||
              json.categories       ||
              json.data?.products   ||
              json.products         ||
              (Array.isArray(json) ? json : null);
            if (prices?.length > 0) {
              capturedFares = prices;
              console.log(`⚡ Bolt: captured ${prices.length} fare types from ${pattern}`);
            }
          }
          await route.fulfill({ response });
        } catch {
          await route.continue();
        }
      });
    }

    // Navigate with coords in URL params — most reliable, avoids form-fill complexity
    const boltUrl =
      `https://bolt.eu/${locale}/ride/?` +
      `startLat=${pickup.lat}&startLng=${pickup.lng}` +
      `&endLat=${dropoff.lat}&endLng=${dropoff.lng}`;

    await page.goto(boltUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });

    // Wait up to 12 s for price API response
    const startWait = Date.now();
    while (!capturedFares && Date.now() - startWait < 12000) {
      await page.waitForTimeout(300);
    }

    await browser.close();
    browser = null;

    if (!capturedFares) {
      console.warn("⚡ Bolt: no fares intercepted");
      return null;
    }

    const currency = CURRENCY[country] || "EUR";
    const fares = capturedFares
      .filter((p) => p && (p.price || p.total_price || p.fare))
      .map((p) => {
        const name  = p.name || p.display_name || p.category_name || "Bolt Car";
        const price = p.price || p.total_price || p.fare || {};
        const low   = price.min_price ?? price.min ?? price.value ?? price;
        const high  = price.max_price ?? price.max ?? price.value ?? price;
        if (!low || !high) return null;
        return {
          app:      "bolt",
          service:  name,
          low:      Math.round(typeof low  === "number" ? low  : low  / 100),
          high:     Math.round(typeof high === "number" ? high : high / 100),
          currency,
          source:   "live",
        };
      })
      .filter(Boolean);

    return fares.length > 0 ? { fares, source: "bolt_live" } : null;
  } catch (err) {
    console.error(`⚡ Bolt scraper error: ${err.message}`);
    if (browser) await browser.close().catch(() => {});
    return null;
  }
}
