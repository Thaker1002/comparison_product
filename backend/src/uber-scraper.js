/**
 * Uber fare scraper — uses Playwright API interception (Method 2 from Fare Engine Manual)
 *
 * Strategy: Navigate to uber.com/global/en/price-estimate/, fill in addresses,
 * and intercept the internal JSON API call to *\/v1.2\/estimates\/price* instead
 * of parsing HTML. This is faster, more reliable, and survives UI redesigns.
 *
 * Fallback: If the API call isn't captured within the timeout, returns null
 * so the caller can fall back to the formula engine.
 */

import { chromium } from 'playwright';

const UBER_ESTIMATE_URL = 'https://www.uber.com/global/en/price-estimate/';
const INTERCEPT_PATTERN = '**/v1.2/estimates/price**';
const TIMEOUT_MS = 20000;

// Human-like random delay
const delay = (ms) => new Promise(r => setTimeout(r, ms));
const humanDelay = () => delay(400 + Math.random() * 900);

/**
 * Fills an address field on the Uber estimate page and selects the first suggestion.
 * @param {import('playwright').Page} page
 * @param {string} selector  CSS selector for the input field
 * @param {string} address   Address string to type
 */
async function fillAddress(page, selector, address) {
  try {
    const input = await page.waitForSelector(selector, { timeout: 8000 });
    await input.click();
    await humanDelay();
    await input.fill('');
    // Type like a human — character by character with small delays
    await input.type(address, { delay: 60 + Math.random() * 40 });
    await humanDelay();
    // Wait for autocomplete suggestions to appear
    await page.waitForSelector(
      '[data-testid="location-suggestions"] li, .sc-autocomplete li, [role="option"]',
      { timeout: 6000 }
    ).catch(() => null); // Don't fail if selector not found — still try arrow/enter
    await page.keyboard.press('ArrowDown');
    await delay(300);
    await page.keyboard.press('Enter');
    await humanDelay();
  } catch (e) {
    console.warn(`⚠️  Uber scraper: could not fill "${selector}":`, e.message);
  }
}

/**
 * Parse raw Uber price estimate API response into a normalised array.
 * Handles both v1.2 /estimates/price and /v2/requests/estimate shapes.
 * @param {any} json
 * @returns {{ type: string; low: number; high: number; currency: string }[]}
 */
function parseUberResponse(json) {
  // Shape: { prices: [{ display_name, low_estimate, high_estimate, currency_code }] }
  if (json?.prices?.length) {
    return json.prices
      .filter(p => p.low_estimate != null)
      .map(p => ({
        type: p.display_name || p.localized_display_name || 'Uber',
        low: Math.round(p.low_estimate),
        high: Math.round(p.high_estimate ?? p.low_estimate * 1.15),
        currency: p.currency_code || 'USD',
      }));
  }
  // Shape: { fare: { value, currency_code, display } } (single product estimate)
  if (json?.fare?.value != null) {
    return [{
      type: 'Uber',
      low: Math.round(json.fare.value * 0.92),
      high: Math.round(json.fare.value * 1.12),
      currency: json.fare.currency_code || 'USD',
    }];
  }
  return [];
}

/**
 * Scrape live Uber fare estimates for a given route.
 *
 * @param {object} params
 * @param {string} params.pickupAddress   Human-readable pickup address
 * @param {string} params.dropoffAddress  Human-readable dropoff address
 * @returns {Promise<{ fares: Array<{type,low,high,currency}>, source: string } | null>}
 *          Returns null on failure so caller can fall back to formula.
 */
export async function scrapeUberFares({ pickupAddress, dropoffAddress }) {
  let browser = null;
  let capturedFares = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1280,800',
      ],
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
    });

    // Remove webdriver flag (basic headless detection bypass)
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();

    // ── API interception — capture Uber's internal price estimate response ──
    await page.route(INTERCEPT_PATTERN, async (route) => {
      const response = await route.fetch();
      try {
        const json = await response.json();
        const fares = parseUberResponse(json);
        if (fares.length > 0) capturedFares = fares;
        console.log(`🚕 Uber intercept: captured ${fares.length} fares`);
      } catch {
        // Couldn't parse — let it fall through
      }
      await route.fulfill({ response });
    });

    console.log(`🌐 Uber scraper: navigating to ${UBER_ESTIMATE_URL}`);
    await page.goto(UBER_ESTIMATE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await humanDelay();

    // Try multiple selector patterns for the pickup input
    const pickupSelectors = [
      '[data-testid="pickup-input"]',
      'input[placeholder*="pickup" i]',
      'input[placeholder*="Pickup" i]',
      'input[aria-label*="pickup" i]',
      '#pickup',
    ];
    const dropoffSelectors = [
      '[data-testid="destination-input"]',
      'input[placeholder*="dropoff" i]',
      'input[placeholder*="destination" i]',
      'input[aria-label*="destination" i]',
      '#destination',
    ];

    let pickupSelector = null;
    for (const sel of pickupSelectors) {
      const el = await page.$(sel);
      if (el) { pickupSelector = sel; break; }
    }
    let dropoffSelector = null;
    for (const sel of dropoffSelectors) {
      const el = await page.$(sel);
      if (el) { dropoffSelector = sel; break; }
    }

    if (!pickupSelector || !dropoffSelector) {
      console.warn('⚠️  Uber scraper: could not find input fields — page structure changed');
      return null;
    }

    await fillAddress(page, pickupSelector, pickupAddress);
    await fillAddress(page, dropoffSelector, dropoffAddress);

    // Wait for the intercepted API call to fire (up to TIMEOUT_MS)
    const deadline = Date.now() + TIMEOUT_MS;
    while (!capturedFares && Date.now() < deadline) {
      await delay(500);
    }

    if (!capturedFares || capturedFares.length === 0) {
      console.warn('⚠️  Uber scraper: API call not captured within timeout');
      return null;
    }

    return { fares: capturedFares, source: 'uber_live' };

  } catch (err) {
    console.error('❌ Uber scraper error:', err.message);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => null);
  }
}
