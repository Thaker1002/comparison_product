import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import axios from "axios";
import FormData from "form-data";
import path from "path";
import { fileURLToPath } from "url";
import {
  normaliseUrl,
  isValidProductUrl,
  isValidImageUrl,
  buildFallbackUrl,
  BLOCKED_DOMAINS,
  FAKE_PATH_PATTERNS,
  isPlausibleShopeeUrl,
} from "./url-validation.js";
import { COUNTRIES, getCountry, listCountries } from "./countries.js";
import { registerAuthRoutes } from "./auth.js";
import { registerFlightRoutes } from "./flights.js";
import { registerFoodRoutes } from "./food.js";
import { scrapeUberFares } from "./uber-scraper.js";
import { scrapeBoltFares } from "./bolt-scraper.js";
import { getCache, setCache } from "./cache.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
// ─── Translate text using Claude Sonnet 4 (OpenRouter) ─────────────────────
app.post("/api/translate", async (req, res) => {
  const { text, targetLang } = req.body;
  if (!text || !targetLang) {
    return res.status(400).json({ error: "Missing text or targetLang" });
  }
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({ error: "OpenRouter API key not set" });
  }
  try {
    const prompt = [
      `Translate the following product description to ${targetLang}.`,
      `Return ONLY the translated text, no explanation, no quotes.`,
      `Text: ${text}`
    ].join("\n");
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "anthropic/claude-sonnet-4",
        messages: [
          { role: "user", content: prompt }
        ],
        max_tokens: 512,
        temperature: 0.2
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": "http://localhost:5173",
          "X-Title": "Product Comparison"
        },
        timeout: 45000
      }
    );
    // Claude's response is in response.data.choices[0].message.content
    const translated = response.data?.choices?.[0]?.message?.content?.trim();
    if (!translated) {
      return res.status(500).json({ error: "No translation returned" });
    }
    res.json({ translated });
  } catch (err) {
    console.error("Translation error:", err?.response?.data || err.message);
    res.status(500).json({ error: "Translation failed" });
  }
});

// ...existing code...

// ─── Telemetry ────────────────────────────────────────────────────────────────
// In-memory counters reset on each restart. Export via /api/stats.
const telemetry = {
  totalSearches: 0,
  totalProductsReturned: 0,
  urlReplacementsTotal: 0, // cumulative across all searches
  urlReplacementsPerSearch: [], // last 50 per-search counts (ring buffer)
  imageReplacementsTotal: 0,
  errors: 0,
};

function recordUrlReplacement(count) {
  telemetry.urlReplacementsTotal += count;
  telemetry.urlReplacementsPerSearch.push({ ts: Date.now(), count });
  if (telemetry.urlReplacementsPerSearch.length > 50)
    telemetry.urlReplacementsPerSearch.shift();
}

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Multer for image uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

// Tavily client
if (!process.env.TAVILY_API_KEY) {
  console.error(
    "❌ TAVILY_API_KEY is not set. Please add it to backend/.env",
  );
  process.exit(1);
}
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const TAVILY_EXTRACT_URL = "https://api.tavily.com/extract";

// Gemini / Google Vision config
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (GEMINI_API_KEY) {
  console.log("🧠 Gemini Vision: ✓ ready (image recognition enabled)");
  console.log("🔍 Google Lens (Cloud Vision): ✓ ready");
} else {
  console.warn(
    "⚠️  GEMINI_API_KEY not set — image recognition disabled. Get a free key at https://aistudio.google.com/apikey",
  );
}

// SerpAPI config (Google Lens via SerpAPI)
const SERPAPI_KEY = process.env.SERPAPI_KEY;
if (SERPAPI_KEY) {
  console.log("🔍 SerpAPI Google Lens: ✓ ready (visual product matching)");
} else {
  console.warn("⚠️  SERPAPI_KEY not set — SerpAPI Google Lens disabled");
}

// ─── SerpAPI Google Lens (visual product matching) ────────────────────────────
// Uses Google Lens via SerpAPI to find visually similar products.
// Returns: { productName, visualMatches[] } where visualMatches contain
// real product listings with titles, prices, images, and links.
async function serpApiGoogleLens(imageBuffer) {
  if (!SERPAPI_KEY) return null;

  console.log("🔍 Trying SerpAPI Google Lens...");

  // SerpAPI Google Lens needs a publicly accessible URL or a temporary upload.
  // We'll first upload the image to a free image host, then pass the URL.
  // Use imgbb free upload (no key needed for temp images) or tmpfiles.org
  let imageUrl = null;

  // Upload to tmpfiles.org (free, no auth, expires in 1 hour)
  try {
    const form = new FormData();
    form.append("file", imageBuffer, { filename: "product.png", contentType: "image/png" });
    const uploadRes = await axios.post("https://tmpfiles.org/api/v1/upload", form, {
      headers: form.getHeaders(),
      timeout: 15000,
    });
    if (uploadRes.data?.data?.url) {
      // tmpfiles.org returns /123456/product.png — convert to direct link
      imageUrl = uploadRes.data.data.url.replace("tmpfiles.org/", "tmpfiles.org/dl/");
      console.log(`🔍 Image uploaded to tmpfiles.org`);
    }
  } catch (uploadErr) {
    console.warn(`⚠️  tmpfiles.org upload failed: ${uploadErr.message}`);
  }

  if (!imageUrl) {
    console.warn("⚠️  Could not upload image for SerpAPI — skipping");
    return null;
  }

  const params = new URLSearchParams({
    engine: "google_lens",
    api_key: SERPAPI_KEY,
    url: imageUrl,
  });

  const { data } = await axios.get(
    `https://serpapi.com/search.json?${params.toString()}`,
    { timeout: 30000 },
  );

  // Extract product name from knowledge graph or visual matches
  let productName = null;
  const visualMatches = [];

  // Knowledge graph gives the best product identification
  if (data.knowledge_graph) {
    const kg = data.knowledge_graph;
    productName = kg.title || null;
    console.log(`🔍 SerpAPI knowledge graph: "${productName}"`);
  }

  // Visual matches — these are actual product listings from the web
  if (data.visual_matches && data.visual_matches.length > 0) {
    console.log(`🔍 SerpAPI found ${data.visual_matches.length} visual matches`);
    for (const match of data.visual_matches.slice(0, 15)) {
      const vm = {
        title: match.title || "",
        link: match.link || "",
        source: match.source || "",
        price: match.price?.extracted_value || null,
        currency: match.price?.currency || null,
        image: match.thumbnail || "",
      };
      visualMatches.push(vm);

      // If we don't have a product name yet, use the first visual match title
      if (!productName && vm.title.length >= 3) {
        productName = vm.title;
      }
    }
  }

  if (!productName && !visualMatches.length) {
    console.log("🔍 SerpAPI: no matches found");
    return null;
  }

  // Clean the product name: strip site prefixes ("Amazon.com:", "Shopee:", etc.)
  if (productName) {
    productName = productName
      .replace(/^(Amazon\.com|eBay|AliExpress|Alibaba|Walmart|Lazada|Shopee|Temu)\s*[:\-|]\s*/i, "")
      .replace(/\s*[|\-]\s*(Amazon|eBay|AliExpress|Alibaba|Walmart|Shopee|Lazada|Temu).*$/i, "")
      .replace(/,\s*\d+-\d+["']?\s*/g, " ")  // remove dimension specs like "6-15\""
      .replace(/\s+/g, " ")
      .trim();
    // If it's still too long, take first meaningful chunk (before first comma or pipe)
    if (productName.length > 60) {
      const short = productName.split(/[,|]/)[0].trim();
      if (short.length >= 10) productName = short;
    }
    console.log(`🔍 SerpAPI cleaned product name: "${productName}"`);
  }

  console.log(`🔍 SerpAPI product: "${productName}", ${visualMatches.length} visual matches`);
  return { productName, visualMatches };
}
// Uses WEB_DETECTION + LABEL_DETECTION — this is what Google Lens does internally.
// Same API key from AI Studio works if Cloud Vision API is enabled.
async function googleLensIdentify(imageBuffer) {
  if (!GEMINI_API_KEY) return null;

  const base64Image = imageBuffer.toString("base64");
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${GEMINI_API_KEY}`;

  console.log("🔍 Trying Google Lens (Cloud Vision Web Detection)...");
  const { data } = await axios.post(url, {
    requests: [{
      image: { content: base64Image },
      features: [
        { type: "WEB_DETECTION", maxResults: 10 },
        { type: "LABEL_DETECTION", maxResults: 10 },
      ],
    }],
  }, { timeout: 30000 });

  const response = data.responses?.[0];
  if (!response) return null;

  // Best guess label from Google Lens (most reliable)
  const bestGuess = response.webDetection?.bestGuessLabels?.[0]?.label;
  if (bestGuess && bestGuess.length >= 3) {
    console.log(`🔍 Google Lens best guess: "${bestGuess}"`);
    return bestGuess;
  }

  // Web entities (what Google thinks this is)
  const entities = response.webDetection?.webEntities
    ?.filter(e => e.description && e.score > 0.5)
    ?.sort((a, b) => b.score - a.score)
    ?.slice(0, 3)
    ?.map(e => e.description) || [];
  if (entities.length > 0) {
    const entityText = entities.join(" ");
    console.log(`🔍 Google Lens entities: "${entityText}"`);
    return entityText;
  }

  // Label annotations (general product labels)
  const labels = response.labelAnnotations
    ?.filter(l => l.score > 0.7)
    ?.slice(0, 3)
    ?.map(l => l.description) || [];
  if (labels.length > 0) {
    const labelText = labels.join(" ");
    console.log(`🔍 Google Lens labels: "${labelText}"`);
    return labelText;
  }

  return null;
}

// ─── Gemini Vision (generative AI) ───────────────────────────────────────────
const GEMINI_MODELS = [
  { name: "gemini-2.0-flash-lite", api: "v1beta" },
  { name: "gemini-2.0-flash", api: "v1beta" },
  { name: "gemini-2.0-flash-lite", api: "v1" },
  { name: "gemini-2.0-flash", api: "v1" },
];

const VISION_PROMPT = [
  "You are a product identification expert. Look at this image and identify the product.",
  "Return ONLY the product name and key attributes (brand, model, size, color) as a short search-friendly phrase.",
  "Examples of good responses:",
  '  "Logitech MX Master 3S wireless mouse"',
  '  "Samsung Galaxy S24 Ultra 256GB black"',
  '  "Nike Air Max 90 white size 42"',
  '  "Dove body wash 500ml"',
  '  "Betadine gargle mouthwash 150ml"',
  "Do NOT include any explanation, just the product name. If you cannot identify the product, respond with \"unknown\".",
].join("\n");

async function geminiIdentify(imageBuffer, mimeType) {
  if (!GEMINI_API_KEY) return null;

  const base64Image = imageBuffer.toString("base64");
  const body = {
    contents: [{
      parts: [
        { text: VISION_PROMPT },
        { inline_data: { mime_type: mimeType || "image/jpeg", data: base64Image } },
      ],
    }],
  };

  for (const { name: model, api } of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/${api}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      console.log(`🧠 Trying Gemini ${model} (${api})...`);
      const { data } = await axios.post(url, body, {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      });

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().replace(/^"|"$/g, "");
      if (text && text.length >= 3 && text.toLowerCase() !== "unknown") {
        console.log(`🧠 Gemini (${model}) identified: "${text}"`);
        return text;
      }
    } catch (err) {
      const status = err.response?.status;
      console.warn(`⚠️  Gemini ${model} failed (${status || err.message})`);
      continue;
    }
  }
  return null;
}

/**
 * Identify a product from an uploaded image.
 * Chain: Google Lens (Cloud Vision) → Gemini → error
 */
async function identifyProductFromImage(imageBuffer, mimeType) {
  // Resize if too large (> 1MB) to avoid quota/timeout issues
  let buffer = imageBuffer;
  if (buffer.length > 1024 * 1024) {
    console.log(`📐 Image is ${(buffer.length / 1024 / 1024).toFixed(1)}MB (large)`);
  }

  // ── 0. SerpAPI Google Lens — best accuracy, real visual matching ──
  try {
    const serpResult = await serpApiGoogleLens(imageBuffer);
    if (serpResult) {
      // Store visual matches for later use (avoids re-searching)
      identifyProductFromImage._lastSerpMatches = serpResult.visualMatches;
      return serpResult.productName;
    }
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.error || err.message;
    console.warn(`⚠️  SerpAPI Google Lens failed (${status}): ${msg}`);
    identifyProductFromImage._lastSerpMatches = null;
  }

  // ── 1. Google Lens (Cloud Vision API) — best for product identification ──
  try {
    const lensResult = await googleLensIdentify(imageBuffer);
    if (lensResult) return lensResult;
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.error?.message || err.message;
    console.warn(`⚠️  Google Lens failed (${status}): ${msg}`);
    // 403 = Vision API not enabled — tell user
    if (status === 403) {
      console.warn("💡 Enable Cloud Vision API at: https://console.cloud.google.com/apis/library/vision.googleapis.com");
    }
  }

  // ── 2. Gemini Vision (generative AI) ──
  try {
    const geminiResult = await geminiIdentify(imageBuffer, mimeType);
    if (geminiResult) return geminiResult;
  } catch (err) {
    console.warn(`⚠️  Gemini failed: ${err.message}`);
  }

  // ── 3. Groq free vision (llama-4-scout with vision) ──
  try {
    console.log("🚀 Trying Groq free vision model...");
    const base64Image = buffer.toString("base64");
    const dataUrl = `data:${mimeType || "image/jpeg"};base64,${base64Image}`;

    const groqResponse = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: VISION_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        }],
        max_tokens: 100,
        temperature: 0.1,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.GROQ_API_KEY || ""}`,
        },
        timeout: 30000,
      },
    );

    const text = groqResponse.data?.choices?.[0]?.message?.content?.trim().replace(/^"|"$/g, "");
    if (text && text.length >= 3 && text.toLowerCase() !== "unknown") {
      console.log(`🚀 Groq identified: "${text}"`);
      return text;
    }
  } catch (err) {
    console.warn(`⚠️  Groq failed: ${err.response?.status || err.message}`);
  }

  // ── 4. Together AI free inference ──
  try {
    console.log("🔮 Trying Together AI free vision...");
    const base64Image = buffer.toString("base64");
    const dataUrl = `data:${mimeType || "image/jpeg"};base64,${base64Image}`;

    const togetherResponse = await axios.post(
      "https://api.together.xyz/v1/chat/completions",
      {
        model: "meta-llama/Llama-Vision-Free",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: VISION_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        }],
        max_tokens: 100,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.TOGETHER_API_KEY || ""}`,
        },
        timeout: 30000,
      },
    );

    const text = togetherResponse.data?.choices?.[0]?.message?.content?.trim().replace(/^"|"$/g, "");
    if (text && text.length >= 3 && text.toLowerCase() !== "unknown") {
      console.log(`🔮 Together AI identified: "${text}"`);
      return text;
    }
  } catch (err) {
    console.warn(`⚠️  Together AI failed: ${err.response?.status || err.message}`);
  }

  // ── 5. Last resort ──
  throw new Error("All image recognition methods failed. Please type the product name manually.");
}

// Helper to call Tavily Search API
async function tavilySearch(query, options = {}) {
  const { data } = await axios.post(TAVILY_SEARCH_URL, {
    api_key: TAVILY_API_KEY,
    query,
    search_depth: options.search_depth || "basic",
    include_domains: options.include_domains || [],
    max_results: options.max_results || 10,
    include_answer: false,
    include_raw_content: false,
    include_images: true,
  });
  return data;
}

// Helper to call Tavily Extract API
async function tavilyExtract(urls) {
  const urlList = Array.isArray(urls) ? urls : [urls];
  const { data } = await axios.post(TAVILY_EXTRACT_URL, {
    api_key: TAVILY_API_KEY,
    urls: urlList,
  });
  return data;
}

// Default country (Thailand) — kept as legacy fallback
const DEFAULT_COUNTRY = "TH";

// Helper: resolve marketplace list for a country code
function getMarketplaces(countryCode) {
  const country = getCountry(countryCode || DEFAULT_COUNTRY);
  if (!country) return getCountry(DEFAULT_COUNTRY).marketplaces.map(m => ({ ...m, currency: "THB", flag: "🇹🇭" }));
  return country.marketplaces.map(m => ({ ...m, currency: country.currency, flag: country.flag }));
}

// Legacy reference kept for backward-compat (used by url-validation)
const MARKETPLACES = getMarketplaces(DEFAULT_COUNTRY);

// ─── URL helpers imported from ./url-validation.js ────────────────────────
// (BLOCKED_DOMAINS, FAKE_PATH_PATTERNS, isPlausibleShopeeUrl, normaliseUrl,
//  isValidProductUrl, isValidImageUrl, buildFallbackUrl)
// These are re-exported from that module so they can be unit-tested
// independently of the Express server.

// ─── Query simplification ─────────────────────────────────────────────────────

/** Words to strip when simplifying queries for marketplace search. */
const FILLER_WORDS = new Set([
  "super", "heavy", "duty", "ultra", "pro", "max", "premium", "deluxe",
  "mega", "plus", "lite", "extra", "new", "best", "top", "big",
  "small", "large", "great", "good", "high", "low", "long", "short",
  "original", "classic", "standard", "regular", "special",
  // colors
  "black", "white", "red", "blue", "green", "yellow", "pink", "gray", "grey",
  "silver", "gold", "brown", "purple", "orange",
  // site names that creep in from SerpAPI product titles
  "amazon", "com", "ebay", "aliexpress", "alibaba", "walmart", "temu",
  // dimension/spec words
  "height", "adjustable", "portable", "foldable", "flexible", "universal",
  "lightweight", "compact", "waterproof", "wireless", "rechargeable",
  "the", "a", "an", "of", "in", "on", "at", "to", "for", "and", "or", "with", "from",
]);

/**
 * Simplify a long descriptive query into a short marketplace-friendly search.
 * e.g., "UTEBIT Cell Phone Stand Height Adjustable" → "Cell Phone Stand"
 * e.g., "Eveready Super Heavy Duty batteries 2-pack" → "Eveready batteries"
 * Keeps brand names, product types; drops filler adjectives.
 * Final query is capped at 4 words for best marketplace search results.
 */
function simplifyQuery(query) {
  // First strip site prefixes
  let clean = query
    .replace(/^(Amazon\.com|eBay|AliExpress|Alibaba|Walmart|Lazada|Shopee|Temu)\s*[:\-|]\s*/i, "")
    .replace(/\s*[|\-]\s*(Amazon|eBay|AliExpress|Alibaba|Walmart|Shopee|Lazada|Temu).*$/i, "")
    .trim();

  const words = clean.split(/\s+/);
  const kept = words.filter(w => {
    const lower = w.toLowerCase().replace(/[^a-z]/g, "");
    if (lower.length < 2) return false;
    return !FILLER_WORDS.has(lower);
  });

  // Cap at 4 words — marketplace search engines work best with short queries
  const capped = kept.slice(0, 4);
  const simplified = capped.join(" ");
  return simplified.length >= 3 ? simplified : query;
}

/**
 * Phase-1 product discovery: do a broad web search (no domain restriction)
 * to find the canonical product info + determine what the product really is.
 * Returns a refined search query string for marketplace searches.
 */
async function discoverProduct(rawQuery) {
  try {
    console.log(`[Discovery] Broad web search: "${rawQuery}"`);
    const result = await tavilySearch(`${rawQuery} buy price`, {
      max_results: 5,
      search_depth: "basic",
    });

    if (!result.results || result.results.length === 0) {
      console.log(`[Discovery] No results, using simplified query`);
      return simplifyQuery(rawQuery);
    }

    // Count how many title words from our query appear in the top results
    // to validate which words actually matter
    const queryWords = rawQuery.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
    const wordFreq = {};
    for (const w of queryWords) wordFreq[w] = 0;

    for (const item of result.results) {
      const title = (item.title || "").toLowerCase();
      for (const w of queryWords) {
        if (title.includes(w)) wordFreq[w]++;
      }
    }

    // Keep words that appeared in at least 1 result title (validated words)
    // plus any words not in FILLER_WORDS (brand names, product types)
    const validated = queryWords.filter(w =>
      wordFreq[w] >= 1 || !FILLER_WORDS.has(w)
    );

    const refined = validated.join(" ");
    console.log(`[Discovery] Refined query: "${refined}" (from "${rawQuery}")`);
    console.log(`[Discovery] Word freq:`, wordFreq);
    return refined.length >= 3 ? refined : simplifyQuery(rawQuery);
  } catch (err) {
    console.warn(`[Discovery] Failed:`, err.message);
    return simplifyQuery(rawQuery);
  }
}

// ─── Local-language search term generation ────────────────────────────────────

/** Countries where marketplace titles use a non-English language. */
const LANGUAGE_MAP = {
  TH: "Thai",
  JP: "Japanese",
};

/**
 * Use Groq AI to translate a product name into local-language search terms.
 * e.g. "Cell Phone Stand" → "ขาตั้งโทรศัพท์มือถือ" (Thai)
 * This dramatically improves Shopee/Lazada results since their titles are in Thai.
 */
async function generateLocalSearchTerms(productName, countryCode) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return null;

  const language = LANGUAGE_MAP[countryCode];
  if (!language) return null; // English-speaking country — no translation needed

  try {
    console.log(`🌏 Generating ${language} search terms for: "${productName}"`);
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{
          role: "user",
          content: [
            `You help people search for products on Shopee and Lazada in ${language}.`,
            `Translate this product into a short ${language} marketplace search query (2-5 words).`,
            `Do NOT include brand names — only the product type.`,
            `Return ONLY the ${language} text, nothing else. No quotes, no explanation.`,
            ``,
            `Product: "${productName}"`,
          ].join("\n"),
        }],
        max_tokens: 50,
        temperature: 0.1,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`,
        },
        timeout: 15000,
      },
    );

    let text = response.data?.choices?.[0]?.message?.content?.trim();
    if (!text || text.length < 2) return null;

    // Clean common AI quirks
    text = text
      .replace(/^["'\u201c\u201d\u2018\u2019]+|["'\u201c\u201d\u2018\u2019]+$/g, "") // quotes
      .replace(/^.*?:\s*/, "")  // "Thai:" prefix
      .replace(/\(.*?\)/g, "") // parenthetical translations
      .split("\n")[0]          // only first line
      .trim();

    if (text.length >= 2) {
      console.log(`🌏 ${language} search term: "${text}"`);
      return text;
    }
  } catch (err) {
    console.warn(`⚠️ Local search term generation failed: ${err.message}`);
  }
  return null;
}

// ─── Image-based search term generation (OpenRouter Claude / Groq fallback) ──

// OpenRouter config
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (OPENROUTER_API_KEY) {
  console.log("🧠 OpenRouter (Claude Sonnet): ✓ ready (primary vision model)");
} else {
  console.warn("⚠️  OPENROUTER_API_KEY not set — using Groq as primary vision model");
}

/**
 * Look at the uploaded image and return search-optimised marketplace terms.
 * Primary: OpenRouter → Claude Sonnet 4 (best vision quality)
 * Fallback: Groq → Llama 4 Scout
 *
 * Returns: { english: "phone stand adjustable", local: "ขาตั้งโทรศัพท์" | null }
 *          or null on failure.
 */
async function getImageSearchTerms(imageBuffer, mimeType, countryCode) {
  const language = LANGUAGE_MAP[countryCode];
  const base64Image = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType || "image/jpeg"};base64,${base64Image}`;

  const localInstruction = language
    ? `3. "${language.toLowerCase()}": a short ${language} marketplace search phrase (2-5 words) that a buyer would type on Shopee/Lazada. Include transliterated English if commonly used (e.g., "แฮนด์กริป" for hand grip). Be SPECIFIC — use exact product names, not generic categories.`
    : "";
  const altInstruction = language
    ? `4. "alt_${language.toLowerCase()}": an ALTERNATIVE ${language} search phrase using different words/synonyms (e.g., if main is "กริปบีบมือ", alt could be "ที่บีบมือ ออกกำลังกาย")`
    : "";

  const prompt = [
    "You are a product search expert for Southeast Asian online marketplaces (Shopee, Lazada, Big C, Central).",
    "Look at this product image carefully and return a JSON object with search-optimized terms.",
    "",
    "STRICT RULES:",
    "- Do NOT include any brand names, model numbers, or store-specific terms",
    "- Focus on the EXACT product type — be very specific, not generic categories",
    "- Keep phrases short (2-5 words), exactly like someone would type into a Shopee/Lazada search bar",
    "- Be specific about the product type (not just \"battery\" but \"D size battery heavy duty\")",
    "- Describe visible features: size, color, material, quantity if visible",
    language ? "- For local language: use the SPECIFIC product name buyers actually search for" : "",
    language ? "  BAD: \"อุปกรณ์ออกกำลังกาย\" (too generic — matches exercise blogs/articles)" : "",
    language ? "  GOOD: \"กริปบีบมือ แฮนด์กริป\" (specific product + transliterated term)" : "",
    "",
    "Return a JSON object with:",
    '1. "english": short English search phrase for this product type (2-5 words)',
    '2. "features": 2-3 key visible features separated by commas',
    localInstruction,
    altInstruction,
    "",
    "Examples:",
    language
      ? `Phone holder: {"english": "phone stand holder adjustable", "${language.toLowerCase()}": "ขาตั้งโทรศัพท์ ปรับระดับได้", "alt_${language.toLowerCase()}": "ที่วางมือถือ ตั้งโต๊ะ", "features": "adjustable, foldable, black"}`
      : `Phone holder: {"english": "phone stand holder adjustable", "features": "adjustable, foldable, black"}`,
    language
      ? `D batteries: {"english": "D size battery heavy duty", "${language.toLowerCase()}": "ถ่านไฟฉาย ขนาด D", "alt_${language.toLowerCase()}": "ถ่าน D ก้อนใหญ่", "features": "D size, heavy duty, 2 pack"}`
      : `D batteries: {"english": "D size battery heavy duty", "features": "D size, heavy duty, 2 pack"}`,
    language
      ? `Hand grip: {"english": "hand grip strengthener spring", "${language.toLowerCase()}": "กริปบีบมือ แฮนด์กริป สปริง", "alt_${language.toLowerCase()}": "ที่บีบมือ ออกกำลังกาย มือจับ", "features": "spring resistance, foam handles"}`
      : `Hand grip: {"english": "hand grip strengthener spring", "features": "spring resistance, foam handles"}`,
    "",
    "Return ONLY the JSON object, nothing else.",
  ].filter(Boolean).join("\n");

  // ── Try OpenRouter (Claude Sonnet) first ──
  if (OPENROUTER_API_KEY) {
    try {
      console.log(`🧠 Getting search terms via OpenRouter (Claude Sonnet)...`);
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "anthropic/claude-sonnet-4",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          }],
          max_tokens: 300,
          temperature: 0.1,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "Product Comparison",
          },
          timeout: 45000,
        },
      );

      const result = parseSearchTermsResponse(response.data, language, "Claude Sonnet");
      if (result) return result;
    } catch (err) {
      console.warn(`⚠️ OpenRouter Claude failed (${err.response?.status || err.message}): ${err.response?.data?.error?.message || ""}`);
    }
  }

  // ── Fallback: Groq (Llama 4 Scout) ──
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (GROQ_API_KEY) {
    try {
      console.log(`🧠 Falling back to Groq vision...`);
      const response = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          }],
          max_tokens: 200,
          temperature: 0.1,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${GROQ_API_KEY}`,
          },
          timeout: 30000,
        },
      );

      const result = parseSearchTermsResponse(response.data, language, "Groq");
      if (result) return result;
    } catch (err) {
      console.warn(`⚠️ Groq search term generation failed: ${err.message}`);
    }
  }

  return null;
}

/** Parse the chat completion response into { english, local, altLocal, features }. */
function parseSearchTermsResponse(data, language, modelName) {
  let text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) return null;

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    console.warn(`⚠️ ${modelName} search terms: no JSON found in: "${text.slice(0, 100)}"`);
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const english = parsed.english?.trim();
    const local = language ? parsed[language.toLowerCase()]?.trim() : null;
    const altLocal = language ? parsed[`alt_${language.toLowerCase()}`]?.trim() : null;
    const features = parsed.features?.trim();

    if (!english || english.length < 3) return null;

    console.log(`🧠 ${modelName} search terms — english: "${english}" | local: "${local || 'n/a'}" | alt: "${altLocal || 'n/a'}" | features: "${features || 'n/a'}"`);
    return { english, local: local || null, altLocal: altLocal || null, features: features || null };
  } catch (e) {
    console.warn(`⚠️ ${modelName} JSON parse error: ${e.message}`);
    return null;
  }
}

// ─── Relevance helpers ────────────────────────────────────────────────────────

/** Tokenise a query into meaningful keywords (>= 2 chars, lowercased).
 *  Uses Unicode-aware regex so Thai/Japanese characters are preserved. */
function queryKeywords(query) {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

/** Generic modifier words that appear across many product categories. */
const GENERIC_MODIFIERS = new Set([
  "super", "heavy", "duty", "ultra", "pro", "max", "premium", "deluxe",
  "mega", "plus", "lite", "mini", "extra", "new", "best", "top", "big",
  "small", "large", "great", "good", "high", "low", "long", "short",
  "fast", "quick", "easy", "free", "original", "classic", "standard",
  "regular", "special", "pack", "size", "type", "style", "model",
  "series", "version", "set", "kit", "piece", "pair", "unit",
  "black", "white", "red", "blue", "green", "yellow", "pink", "gray", "grey",
  "silver", "gold", "brown", "purple", "orange",
  // site names
  "amazon", "com", "ebay", "aliexpress", "alibaba", "walmart", "temu",
  // spec adjectives
  "height", "adjustable", "portable", "foldable", "flexible", "universal",
  "lightweight", "compact", "waterproof", "wireless", "rechargeable",
  "with", "for", "and", "the", "from",
]);

/**
 * Score how relevant a Tavily result is to the original query.
 * Checks both title and body since Thai titles often use Thai words
 * while body text may contain the English product name.
 * Requires at least 1 core keyword match anywhere (title preferred).
 */
function relevanceScore(item, keywords) {
  if (keywords.length === 0) return 0.5;
  const title = (item.title || "").toLowerCase();
  const body  = ((item.title || "") + " " + (item.content || "")).toLowerCase();

  const core = keywords.filter(kw => !GENERIC_MODIFIERS.has(kw));
  const mods = keywords.filter(kw => GENERIC_MODIFIERS.has(kw));

  // Check core keyword matches in title and body separately
  let coreTitleHit = 0;
  let coreBodyHit = 0;
  for (const kw of core) {
    if (title.includes(kw)) coreTitleHit++;
    else if (body.includes(kw)) coreBodyHit++;
  }
  const totalCoreHit = coreTitleHit + coreBodyHit;

  // Must match at least 1 core keyword in title OR body
  if (core.length > 0 && totalCoreHit === 0) {
    console.log(`  ✗ Rejected "${(item.title || "").slice(0, 60)}" — 0/${core.length} core`);
    return 0;
  }

  // Need at least 1 core in title (body-only matches are too weak)
  if (core.length > 0 && coreTitleHit === 0) {
    // Allow body-only matches at reduced score for very relevant results
    const bodyScore = coreBodyHit / (core.length * 2);
    if (bodyScore >= 0.3) {
      console.log(`  ~ "${(item.title || "").slice(0, 60)}" score=${bodyScore.toFixed(2)} (body-only)`);
      return bodyScore;
    }
    console.log(`  ✗ Rejected "${(item.title || "").slice(0, 60)}" — 0 core in title, body too weak`);
    return 0;
  }

  // Scoring: title matches weighted 2x, body matches 1x, mods 0.5x
  let modHit = 0;
  for (const kw of mods) { if (body.includes(kw)) modHit++; }

  const totalW = core.length * 2 + mods.length;
  const matchW = coreTitleHit * 2 + coreBodyHit * 1 + modHit * 0.5;
  const score = totalW > 0 ? matchW / totalW : 0.5;
  console.log(`  ${score >= 0.2 ? "✓" : "✗"} "${(item.title || "").slice(0, 60)}" score=${score.toFixed(2)} core=${totalCoreHit}/${core.length} (title=${coreTitleHit})`);
  return score;
}

// ─── Price-extraction helpers ─────────────────────────────────────────────────

// Broad currency symbols / codes that may precede or follow a number
const CURRENCY_RE_BEFORE =
  /(?:฿|THB|USD|GBP|JPY|INR|MYR|SGD|AED|EUR|Rs\.?|RM|S\$|\$|£|¥|₹|€)\s*/i;
const CURRENCY_RE_AFTER =
  /\s*(?:฿|THB|USD|GBP|JPY|INR|MYR|SGD|AED|EUR|บาท|baht|Rs\.?|RM|S\$|\$|£|¥|₹|€)/i;
const NUMBER_RE = /[\d,]+(?:\.\d{1,2})?/;

/** Extract all plausible prices from a text blob. */
function extractPrices(text) {
  // Pattern 1: currency BEFORE number  e.g. ฿1,299  $49.99
  const reBefore = new RegExp(
    CURRENCY_RE_BEFORE.source + "(" + NUMBER_RE.source + ")",
    "gi",
  );
  // Pattern 2: number AFTER currency  e.g. 1,299 บาท   49.99 USD
  const reAfter = new RegExp(
    "(" + NUMBER_RE.source + ")" + CURRENCY_RE_AFTER.source,
    "gi",
  );
  // Pattern 3: "price" / "ราคา" context  e.g. "Price: 1,299"
  const reContext = /(?:price|ราคา|cost|priced?\s+at)[:\s]+([\d,]+(?:\.\d{1,2})?)/gi;

  const prices = new Set();
  for (const re of [reBefore, reAfter, reContext]) {
    for (const m of text.matchAll(re)) {
      const v = parseFloat((m[1] || m[0]).replace(/,/g, ""));
      if (v > 0 && v < 100_000_000) prices.add(v);
    }
  }
  return [...prices].sort((a, b) => a - b);
}

// ─── Search marketplace using Tavily Search API ─────────────────────────────
async function searchMarketplace(marketplace, query, country) {
  try {
    // Use the query as-is (already simplified/refined by discoverProduct)
    // Don't quote it — marketplace search works better with loose terms
    const siteQuery = query;
    console.log(
      `[Tavily → ${marketplace.name}] Searching: ${siteQuery} on ${marketplace.domain}`,
    );

    const result = await tavilySearch(siteQuery, {
      include_domains: [marketplace.domain],
      max_results: 10,
      search_depth: "advanced",
    });

    if (!result.results || result.results.length === 0) {
      console.warn(`[Tavily → ${marketplace.name}] No results`);
      return [];
    }

    console.log(
      `[Tavily → ${marketplace.name}] Got ${result.results.length} raw results`,
    );

    // Tavily returns images at top level — collect them for fallback
    const tavilyImages = (result.images || [])
      .filter(img => typeof img === "string" && img.startsWith("http"));

    // Prepare relevance keywords from the original query
    const keywords = queryKeywords(query);

    let imageIndex = 0;
    const products = result.results
      .map((item) => {
        // ── Filter out non-product pages (blogs, articles, category pages) ──
        const url = (item.url || "").toLowerCase();
        const title = (item.title || "").toLowerCase();
        const NON_PRODUCT_PATTERNS = [
          // URL path patterns
          /\/blog\//i, /\/article/i, /\/stories\//i, /\/editorial\//i,
          /\/news\//i, /\/tips\//i, /\/guide/i, /\/review\//i,
          /\/lifestyle/i, /\/inspiration/i, /\/content\//i,
          // Thai blog/article patterns in titles
          /รวม(?:แอพ|ท่า|เทคนิค|วิธี|สูตร|รายการ)/i,  // "collection of" articles
          /ประโยชน์จาก|ข้อดีของ/i,                     // "benefits of"
          /วิธี.*ที่.*ควร/i,                           // "ways you should"
          /ดียังไง|ดีอย่างไร/i,                        // "how is it good"
          /ตอนเช้า.*ดี|ทำไมหลายคน/i,                   // lifestyle articles
          /สายรัก.*สุขภาพ|พลาดไม่ได้/i,                 // "health lovers" / "don't miss"
          /แอพ.*ออกกำลัง|ออกกำลังกาย.*แอพ/i,           // exercise app articles
          // Category/listing/landing pages (NOT individual products)
          /\|\s*สั่งเลย/i,                            // "| สั่งเลย สั่งง่าย" (category CTA)
          /\|\s*สั่งง่าย/i,                            // "| สั่งง่าย ส่งไว" (category CTA)
          /\|\s*ช้อป.*แท้/i,                           // "| ช้อปของแท้" (category page)
          /\|\s*ช้อป.*ลด/i,                            // "| ช้อปลด" (promo page)
          /\|\s*สินค้าจาก.*แบรนด์/i,                   // "| สินค้าจากแบรนด์ของแท้" (brand page)
          /\|\s*Retail\b/i,                            // "| Retail" corporate pages
          /\bCorporate\b/i,                            // corporate pages
          /\bOnline Store\b/i,                         // store landing
          /^.{0,5}(Big C|Shopee|Lazada|Central|Makro)\s*\|/i,  // "Big C | ..." landing pages
          /^.{0,5}(Big C|Shopee|Lazada|Central|Makro)\s*Online\s*$/i, // "Big C Online"
          // English blog/article patterns
          /\b(top|best)\s+\d+\b/i,                    // "top 10" / "best 5"
          /\bhow to\b.*\b(choose|select|pick)\b/i,    // "how to choose"
          /\b(guide|tutorial|review|comparison)\b/i,   // guide/review articles
          // Indian marketplace non-product pages
          /\bunboxed\b/i,                              // "Croma Unboxed" articles
          /\blaunched\b/i,                             // "Product launched" news
          /\blaunch date\b/i,                          // launch date articles
          /\bcoming soon\b/i,                          // pre-launch pages
          /\bvs\b.*\bvs\b/i,                           // "X vs Y vs Z" comparison articles
          /\bspecifications\b.*\bfeatures\b/i,         // spec articles
          /\bunder\s*₹?\d/i,                           // "best phones under ₹10000" articles
          /\bbest\s+.*\b(?:buy|to buy)\b/i,            // "best X to buy" articles
          /\/story\//i,                                // news story URLs
          /\/tech-news\//i,                            // tech news
        ];
        const isNonProduct = NON_PRODUCT_PATTERNS.some(re =>
          re.test(url) || re.test(title)
        );
        if (isNonProduct) {
          console.log(`  ⊘ Skipped non-product: "${(item.title || "").slice(0, 60)}"`);
          return null;
        }

        // ── Relevance gate: skip results without core keyword match ──
        const score = relevanceScore(item, keywords);
        if (score < 0.25) return null;

        // ── Price extraction ──
        const blob = (item.content || "") + " " + (item.title || "");
        const prices = extractPrices(blob);
        const price = prices.length > 0 ? prices[0] : null; // cheapest

        // Original / discount
        let originalPrice = null;
        let discount = null;
        if (prices.length >= 2 && price) {
          const maxPrice = prices[prices.length - 1];
          if (maxPrice > price * 1.05) {
            // at least 5 % gap
            originalPrice = maxPrice;
            discount = Math.round(((maxPrice - price) / maxPrice) * 100);
          }
        }

        // ── Rating ──
        const ratingMatch = blob.match(
          /(\d+(?:\.\d+)?)\s*(?:out of 5|stars?|⭐|ดาว|\/5)/i,
        );
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        // ── Review count ──
        const reviewMatch = blob.match(
          /([\d,]+)\s*(?:reviews?|ratings?|รีวิว|คะแนน)/i,
        );
        const reviewCount = reviewMatch
          ? parseInt(reviewMatch[1].replace(/,/g, ""), 10)
          : null;

        // ── Sold count ──
        const soldMatch = blob.match(
          /([\d,]+(?:\.\d+)?[kK]?)\s*(?:sold|ขายแล้ว|ชิ้น)/i,
        );
        const soldCount = soldMatch ? soldMatch[1] : null;

        // ── URL validation ──
        const rawUrl = normaliseUrl(item.url);
        const urlValid = isValidProductUrl(rawUrl, marketplace);
        const validUrl = urlValid
          ? rawUrl
          : buildFallbackUrl(marketplace, query);
        if (item.url && !urlValid) recordUrlReplacement(1);

        // ── Image ──
        // Try per-result image first, then fall back to Tavily top-level images
        let imageUrl = item.image || null;
        if (!imageUrl && tavilyImages.length > imageIndex) {
          imageUrl = tavilyImages[imageIndex];
        }
        imageIndex++;
        const imageOk = isValidImageUrl(imageUrl);
        const validImage = imageOk ? imageUrl : null;

        // Clean marketplace name from title ("Product - Big C Online" → "Product")
        let cleanName = (item.title || query)
          .replace(/\s*[-|–]\s*(Big C Online|Big C|Shopee|Lazada|Central\.co\.th|Central Online|Makro|JD Central|Tops Online|NocNoc|HomePro|Power Buy).*$/i, "")
          .replace(/\s*[-|–]\s*\S+\.co\.th.*$/i, "")  // generic .co.th suffix
          .replace(/\s*[-|–]\s*\S+\.com.*$/i, "")     // generic .com suffix
          .trim();

        return {
          name: cleanName,
          price,
          originalPrice,
          discount,
          image: validImage,
          url: validUrl,
          rating,
          reviewCount,
          soldCount,
          relevance: score,
          seller: null,
          location: null,
          badge: null,
          quantity: null,
          capacity: null,
          brand: null,
          marketplace: marketplace.id,
          marketplaceName: marketplace.name,
          marketplaceColor: marketplace.color,
          marketplaceDomain: marketplace.domain,
          marketplaceLogo: marketplace.logo,
          currency: marketplace.currency,
          id: `${marketplace.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        };
      })
      .filter((p) => p !== null);

    // ── Deduplicate by title within marketplace ──
    const seenTitles = new Set();
    const dedupedProducts = products.filter(p => {
      const key = (p.name || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (seenTitles.has(key)) {
        console.log(`  ⊘ Dedup: "${(p.name || "").slice(0, 50)}"`);
        return false;
      }
      seenTitles.add(key);
      return true;
    });

    // ── Flag suspiciously low prices as priceless ──
    // (e.g. ₹5 for Galaxy Buds is clearly a bad scrape)
    for (const p of dedupedProducts) {
      if (p.price && p.price > 0 && p.price < 10 && p.originalPrice && p.originalPrice > p.price * 10) {
        console.log(`  ⚠️ Suspicious price ${p.currency} ${p.price} (original ${p.originalPrice}) for "${(p.name || "").slice(0, 50)}" — zeroed`);
        p.price = 0;
        p.originalPrice = null;
        p.discount = null;
      }
    }

    // Separate products with and without prices
    const withPrice = dedupedProducts.filter(p => p.price && p.price > 0);
    const noPrice = products.filter(p => !p.price || p.price <= 0);

    // Only include priceless results if there are ZERO priced results
    const priceless = withPrice.length === 0 ? noPrice.slice(0, 3) : [];
    const finalProducts = [...withPrice, ...priceless];

    console.log(
      `[Tavily → ${marketplace.name}] Found ${withPrice.length} with price, ${noPrice.length} without price → returning ${finalProducts.length}`,
    );
    return finalProducts;
  } catch (err) {
    console.error(`[Tavily → ${marketplace.name}] Error:`, err.message);
    return [];
  }
}

// ─── Extract detailed product info from a URL using Tavily Extract ───────────
async function extractProductDetail(url) {
  try {
    console.log(`[Tavily Extract] ${url}`);
    const result = await tavilyExtract(url);

    if (!result.results || result.results.length === 0) {
      return null;
    }

    const content = result.results[0].raw_content || "";

    // Parse structured data from raw content
    const priceMatch = content.match(
      /(?:฿|THB|\$|USD|£|GBP|¥|JPY|₹|INR|RM|MYR|S\$|SGD|AED|€|EUR)\s*([\d,]+(?:\.\d{1,2})?)/i
    );
    const price = priceMatch
      ? parseFloat(priceMatch[1].replace(/,/g, ""))
      : null;

    const ratingMatch = content.match(
      /(\d+(?:\.\d+)?)\s*(?:out of 5|stars?|⭐|ดาว|\/5)/i
    );
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

    return {
      name: result.results[0].title || null,
      price,
      rating,
      description: content.substring(0, 2000),
      rawContent: content,
    };
  } catch (err) {
    console.error(`[Tavily Extract] Error:`, err.message);
    return null;
  }
}

// ─── Routes ────────────────────────────────────────────────────────────────

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Country endpoints ─────────────────────────────────────────────────────

// List all supported countries
app.get("/api/countries", (req, res) => {
  res.json(listCountries());
});

// Get single country info
app.get("/api/countries/:code", (req, res) => {
  const country = getCountry(req.params.code);
  if (!country) return res.status(404).json({ error: "Country not found" });
  res.json({
    code: country.code,
    name: country.name,
    flag: country.flag,
    currency: country.currency,
    marketplaces: country.marketplaces.map(({ id, name, domain, color, logo }) => ({
      id, name, domain, color, logo,
    })),
  });
});

// Get available marketplaces (supports ?country= query param)
app.get("/api/marketplaces", (req, res) => {
  const countryCode = req.query.country || DEFAULT_COUNTRY;
  const markets = getMarketplaces(countryCode);
  res.json(
    markets.map(({ id, name, domain, color, logo, flag }) => ({
      id,
      name,
      domain,
      color,
      logo,
      flag,
    })),
  );
});

// Telemetry / stats endpoint
app.get("/api/stats", (req, res) => {
  const recent = telemetry.urlReplacementsPerSearch.slice(-10);
  const recentTotal = recent.reduce((s, r) => s + r.count, 0);
  res.json({
    ...telemetry,
    urlReplacementsPerSearch: undefined, // omit raw ring buffer
    recentSearches: recent.length,
    urlReplacementsInRecentSearches: recentTotal,
    replacementRate:
      telemetry.totalSearches > 0
        ? (
            (telemetry.urlReplacementsTotal / telemetry.totalSearches) *
            100
          ).toFixed(1) + "%"
        : "n/a",
  });
});

// Main product search endpoint
app.post("/api/search", upload.single("image"), async (req, res) => {
  try {
    const {
      query,
      marketplaces: selectedMarkets,
      searchMode = "scrape",
      country: countryCode,
    } = req.body;

    // ── Image recognition & search term generation ──
    let imageQuery = null;       // product name from SerpAPI/vision (for display)
    let imageSearchTerms = null; // { english, local, features } from Groq (for marketplace search)
    const resolvedCountry = countryCode || DEFAULT_COUNTRY;

    if (req.file && req.file.buffer) {
      console.log(
        `\n📸 Image uploaded: ${req.file.originalname} (${(req.file.size / 1024).toFixed(0)} KB, ${req.file.mimetype})`,
      );

      // Run BOTH in parallel:
      // 1. identifyProductFromImage → gets SerpAPI visual matches (bonus results)
      // 2. getImageSearchTerms → Groq vision generates generic search terms + Thai keywords
      const [identifyResult, searchTermsResult] = await Promise.allSettled([
        identifyProductFromImage(req.file.buffer, req.file.mimetype),
        getImageSearchTerms(req.file.buffer, req.file.mimetype, resolvedCountry),
      ]);

      // Product name (for display / fallback)
      if (identifyResult.status === "fulfilled" && identifyResult.value) {
        const val = identifyResult.value;
        if (val && val.toLowerCase() !== "unknown" && val.length >= 3) {
          imageQuery = val;
        }
      }
      if (identifyResult.status === "rejected") {
        console.error("Image recognition error:", identifyResult.reason?.message);
      }

      // Groq search terms (PRIMARY for marketplace search)
      if (searchTermsResult.status === "fulfilled" && searchTermsResult.value) {
        imageSearchTerms = searchTermsResult.value;
      }
      if (searchTermsResult.status === "rejected") {
        console.warn("Search term generation error:", searchTermsResult.reason?.message);
      }

      console.log(`📸 Image results — identified: "${imageQuery || 'n/a'}" | groq english: "${imageSearchTerms?.english || 'n/a'}" | groq local: "${imageSearchTerms?.local || 'n/a'}"`);
    }

    // Determine search query:
    // Priority: Groq search terms > simplified SerpAPI name > text query
    const effectiveQuery = imageSearchTerms?.english || imageQuery || (query && query.trim()) || null;

    if (!effectiveQuery || effectiveQuery.length < 2) {
      return res.status(400).json({
        error: "Could not identify the product from the image. Please type the product name in the search box (e.g. \"Betadine gargle\") and try again.",
        imageRecognitionFailed: true,
      });
    }

    let cleanQuery = effectiveQuery.trim();

    // Simplify long queries (especially image-identified products with no Groq terms)
    if (!imageSearchTerms && cleanQuery.split(/\s+/).length > 3) {
      const simplified = simplifyQuery(cleanQuery);
      console.log(`📏 Simplified query: "${cleanQuery}" → "${simplified}"`);
      cleanQuery = simplified;
    }

    // For image searches, set up search tiers:
    // - localQuery: Thai/Japanese from Groq vision (best match for local marketplaces)
    // - cleanQuery: English generic from Groq vision (fallback)
    // - genericQuery: further simplified English (last resort)
    let localQuery = imageSearchTerms?.local || null;
    let altLocalQuery = imageSearchTerms?.altLocal || null;
    let genericQuery = null;
    if (imageQuery || imageSearchTerms) {
      // If Groq gave us English terms, use those. Otherwise simplify SerpAPI name.
      const words = cleanQuery.split(/\s+/);
      if (words.length >= 3) {
        genericQuery = words.slice(1).join(" ");
      }

      // If Groq didn't give local terms, try translation as fallback
      if (!localQuery) {
        localQuery = await generateLocalSearchTerms(cleanQuery, resolvedCountry);
      }

      console.log(`🔎 Image search — local: "${localQuery || 'n/a'}" | alt: "${altLocalQuery || 'n/a'}" | english: "${cleanQuery}" | generic: "${genericQuery || 'n/a'}"`);
    }
    const countryMarkets = getMarketplaces(resolvedCountry);

    // Determine which marketplaces to search
    let marketsToSearch = countryMarkets;
    if (selectedMarkets) {
      const selected = Array.isArray(selectedMarkets)
        ? selectedMarkets
        : selectedMarkets.split(",");
      marketsToSearch = countryMarkets.filter((m) => selected.includes(m.id));
    }

    if (marketsToSearch.length === 0) {
      return res.status(400).json({ error: "No valid marketplaces selected" });
    }

    telemetry.totalSearches++;

    // ── Check for SerpAPI visual matches (real Google Lens product data) ──
    const serpMatches = identifyProductFromImage._lastSerpMatches || [];
    identifyProductFromImage._lastSerpMatches = null; // consume once
    let serpProducts = [];
    if (serpMatches.length > 0 && (imageQuery || imageSearchTerms)) {
      console.log(`🔍 Using ${serpMatches.length} SerpAPI visual matches as direct results`);

      // Get country's currency and known marketplace domains
      const countryInfo = getCountry(resolvedCountry) || getCountry("TH");
      const localDomains = countryInfo.marketplaces.map(m => m.domain);
      const countryCurrency = countryInfo.currency || "THB";

      serpProducts = serpMatches
        .filter(vm => vm.title)
        .map((vm, idx) => {
          // Try to detect the real marketplace from the link URL
          let sourceDomain = vm.source || "";
          let matchedMarket = null;
          if (vm.link) {
            try {
              const linkHost = new URL(vm.link).hostname.replace(/^www\./, "");
              // First try matching by hostname
              matchedMarket = countryInfo.marketplaces.find(m =>
                linkHost === m.domain || linkHost.endsWith(`.${m.domain}`)
              );
              if (matchedMarket) {
                sourceDomain = matchedMarket.domain;
              } else {
                // Google may wrap in a redirect (google.com/url?url=...) — scan all known marketplace domains
                if (linkHost.includes("google.") || !sourceDomain) {
                  matchedMarket = countryInfo.marketplaces.find(m => vm.link.includes(m.domain));
                  if (matchedMarket) sourceDomain = matchedMarket.domain;
                }
                if (!sourceDomain) sourceDomain = linkHost;
              }
            } catch (_) {}
          }
          const isLocal = !!matchedMarket || localDomains.some(d => sourceDomain.includes(d) || (vm.link || "").includes(d));
          const displayCurrency = vm.currency || (isLocal ? countryCurrency : "USD");

          // Clean site prefixes from titles
          let cleanTitle = vm.title
            .replace(/^(Amazon\.com|eBay|AliExpress|Alibaba|Walmart|Lazada|Shopee|Temu|Target|Best Buy|Tokopedia|Bukalapak|Blibli)\s*[:\-|]\s*/i, "")
            .replace(/\s*[|\-]\s*(Amazon|eBay|AliExpress|Alibaba|Walmart|Shopee|Lazada|Temu).*$/i, "")
            .trim();

          return {
            name: cleanTitle,
            price: vm.price || null,
            originalPrice: null,
            discount: null,
            image: vm.image || null,
            url: vm.link || "#",
            rating: null,
            reviewCount: null,
            soldCount: null,
            relevance: isLocal ? 1.0 : 0.8,
            seller: vm.source || sourceDomain || null,
            location: null,
            badge: isLocal ? "🔍 Google Lens" : "🔍 Google Lens",
            quantity: null,
            capacity: null,
            brand: null,
            marketplace: matchedMarket ? matchedMarket.id : "google_lens",
            marketplaceName: matchedMarket ? matchedMarket.name : (isLocal ? `Google Lens (${sourceDomain})` : "Google Lens"),
            marketplaceColor: matchedMarket ? matchedMarket.color : "#4285F4",
            marketplaceDomain: matchedMarket ? matchedMarket.domain : (sourceDomain || "google.com"),
            marketplaceLogo: "🔍",
            currency: displayCurrency,
            id: `serp-${Date.now()}-${idx}`,
          };
        });
      console.log(`🔍 ${serpProducts.length} SerpAPI products (${serpProducts.filter(p => p.price).length} with prices)`);
    }

    // ── Multi-tier marketplace search ──
    // For image searches: local → alt local → English → generic English
    // For text searches: just the query as-is
    // Key: search EACH marketplace with multiple terms and merge results
    const isImageSearch = !!(imageQuery || imageSearchTerms);
    const primaryQuery = (isImageSearch && localQuery) ? localQuery : cleanQuery;

    // Build the query tiers (ordered by priority, deduplicated)
    const queryTiers = [primaryQuery];
    if (altLocalQuery && altLocalQuery !== primaryQuery) queryTiers.push(altLocalQuery);
    if (cleanQuery !== primaryQuery) queryTiers.push(cleanQuery);
    if (genericQuery && !queryTiers.includes(genericQuery)) queryTiers.push(genericQuery);

    console.log(`\n🔍 Search tiers: ${queryTiers.map((q, i) => `[${i + 1}] "${q}"`).join(" → ")}`);
    console.log(`Mode: ${searchMode}`);

    // Search all marketplaces with primary query first
    const tier1Results = await Promise.allSettled(
      marketsToSearch.map(m => searchMarketplace(m, primaryQuery, resolvedCountry)),
    );

    // Track results per marketplace
    const perMarketplace = new Map();
    marketsToSearch.forEach((m, i) => {
      const result = tier1Results[i];
      const products = result.status === "fulfilled" ? result.value : [];
      perMarketplace.set(m.id, products);
    });

    // For marketplaces with few results (< 2 priced), try additional tiers
    for (let tier = 1; tier < queryTiers.length; tier++) {
      const tierQuery = queryTiers[tier];
      const weakMarkets = marketsToSearch.filter(m => {
        const existing = perMarketplace.get(m.id) || [];
        const pricedCount = existing.filter(p => p.price && p.price > 0).length;
        return pricedCount < 2;
      });

      if (weakMarkets.length === 0) break; // all marketplaces have enough results

      console.log(`\n🔄 Tier ${tier + 1}: "${tierQuery}" for ${weakMarkets.length} weak marketplaces: ${weakMarkets.map(m => m.name).join(", ")}`);
      const tierResults = await Promise.allSettled(
        weakMarkets.map(m => searchMarketplace(m, tierQuery, resolvedCountry)),
      );

      weakMarkets.forEach((m, i) => {
        const result = tierResults[i];
        const newProducts = result.status === "fulfilled" ? result.value : [];
        if (newProducts.length > 0) {
          const existing = perMarketplace.get(m.id) || [];
          // Merge: add new products that aren't duplicates (by URL)
          const existingUrls = new Set(existing.map(p => p.url));
          const unique = newProducts.filter(p => !existingUrls.has(p.url));
          perMarketplace.set(m.id, [...existing, ...unique]);
        }
      });
    }

    let marketplaceProducts = [];
    for (const products of perMarketplace.values()) {
      marketplaceProducts.push(...products);
    }

    // ── Cross-marketplace title dedup (keep first seen, which is from higher-priority tier) ──
    {
      const seenNames = new Set();
      marketplaceProducts = marketplaceProducts.filter(p => {
        const key = `${p.marketplace}:${(p.name || "").toLowerCase().replace(/\s+/g, " ").trim()}`;
        if (seenNames.has(key)) return false;
        seenNames.add(key);
        return true;
      });
    }

    // ── Price enrichment: extract prices for priceless products via Tavily Extract ──
    const pricelessProducts = marketplaceProducts.filter(
      p => p && (!p.price || p.price <= 0) && p.url && !p.url.includes("search") && p.marketplace !== "google_lens"
    );
    if (pricelessProducts.length > 0) {
      // Extract up to 5 product pages in parallel to get prices
      const toExtract = pricelessProducts.slice(0, 5);
      console.log(`\n💰 Enriching ${toExtract.length} priceless products via Tavily Extract...`);
      const extractResults = await Promise.allSettled(
        toExtract.map(p => extractProductDetail(p.url)),
      );
      extractResults.forEach((result, i) => {
        if (result.status === "fulfilled" && result.value?.price) {
          const product = toExtract[i];
          product.price = result.value.price;
          if (result.value.rating && !product.rating) product.rating = result.value.rating;
          console.log(`  💰 ${product.marketplaceName}: ฿${result.value.price} for "${product.name?.slice(0, 40)}"`);
        }
      });
    }

    const products = [
      ...serpProducts,
      ...marketplaceProducts,
    ];

    // Sort: local marketplace results first, Google Lens at bottom
    // Within each group: priced items first (cheapest), then unpriced
    const sortedProducts = products
      .filter((p) => p && p.name)
      .sort((a, b) => {
        // Local marketplace products always before Google Lens
        const aIsLens = a.marketplace === "google_lens" ? 1 : 0;
        const bIsLens = b.marketplace === "google_lens" ? 1 : 0;
        if (aIsLens !== bIsLens) return aIsLens - bIsLens;

        // Within same group: products with prices first
        const aHasPrice = a.price && a.price > 0 ? 1 : 0;
        const bHasPrice = b.price && b.price > 0 ? 1 : 0;
        if (aHasPrice !== bHasPrice) return bHasPrice - aHasPrice;

        // Both have prices → cheapest first
        if (aHasPrice && bHasPrice) return a.price - b.price;

        // Same price status → by relevance
        return (b.relevance || 0) - (a.relevance || 0);
      });

    telemetry.totalProductsReturned += sortedProducts.length;

    // Build marketplace summary
    const summary = marketsToSearch.map((m) => {
      const mProducts = sortedProducts.filter((p) => p.marketplace === m.id);
      return {
        marketplaceId: m.id,
        marketplaceName: m.name,
        count: mProducts.length,
        minPrice:
          mProducts.length > 0
            ? Math.min(...mProducts.map((p) => p.price))
            : null,
        maxPrice:
          mProducts.length > 0
            ? Math.max(...mProducts.map((p) => p.price))
            : null,
        avgPrice:
          mProducts.length > 0
            ? Math.round(
                mProducts.reduce((sum, p) => sum + p.price, 0) /
                  mProducts.length,
              )
            : null,
      };
    });

    // How many products in this response use a fallback search URL?
    const fallbackCount = sortedProducts.filter((p) => {
      try {
        const u = new URL(p.url);
        const s = u.pathname + u.search;
        return (
          s.includes("/search") ||
          s.includes("/catalog") ||
          s.includes("/catalogsearch") ||
          s.includes("/c/search") ||
          u.searchParams.has("keyword") ||
          u.searchParams.has("q")
        );
      } catch {
        return false;
      }
    }).length;

    const response = {
      query: cleanQuery,
      country: resolvedCountry,
      totalResults: sortedProducts.length,
      marketplacesSearched: marketsToSearch.length,
      timestamp: new Date().toISOString(),
      summary,
      products: sortedProducts,
      _meta: {
        fallbackUrlCount: fallbackCount,
        fallbackUrlPct:
          sortedProducts.length > 0
            ? Math.round((fallbackCount / sortedProducts.length) * 100)
            : 0,
        imageSearchTerms: imageSearchTerms || undefined,
        serpApiName: imageQuery || undefined,
        localQuery: localQuery || undefined,
      },
    };

    console.log(
      `✅ Search complete: ${sortedProducts.length} products found\n`,
    );
    res.json(response);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed", message: err.message });
  }
});

// Scrape a single product URL for detailed info using Tavily Extract
app.post("/api/product/detail", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    console.log(`\n📦 Fetching product detail: ${url}`);

    const detail = await extractProductDetail(url);

    if (!detail) {
      return res
        .status(404)
        .json({ error: "Could not extract product details" });
    }

    res.json({ url, detail });
  } catch (err) {
    console.error("Product detail error:", err);
    res
      .status(500)
      .json({ error: "Failed to fetch product details", message: err.message });
  }
});

// Error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res
      .status(400)
      .json({ error: "File upload error", message: err.message });
  }
  console.error("Unhandled error:", err);
  res
    .status(500)
    .json({ error: "Internal server error", message: err.message });
});

// ─── Serve frontend in production ─────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "../../frontend/dist");
import fs from "fs";
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path === "/health") return next();
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// ─── RideGuru live price scraping ────────────────────────────────────────────
// Countries where RideGuru has meaningful coverage
const RIDEGURU_COUNTRIES = new Set(['US', 'CA', 'UK', 'IN', 'AU']);

function parseRideGuruPrices(content) {
  const prices = [];
  if (!content) return prices;

  // Match service names followed by a price range like "$12.34 - $15.67" or "£10 – £14"
  const currencyCls = '[$£€₹]';
  const re = new RegExp(
    `(Uber[\\w\\s]{0,20}?|Lyft[\\w\\s]{0,20}?|inDrive[\\w\\s]{0,20}?|Via[\\w\\s]{0,10}?|Wingz[\\w\\s]{0,10}?|Ola[\\w\\s]{0,10}?|Grab[\\w\\s]{0,10}?|Bolt[\\w\\s]{0,10}?|Careem[\\w\\s]{0,10}?|Beck[\\w\\s]{0,10}?|Rapido[\\w\\s]{0,10}?)` +
    `\\s*${currencyCls}\\s*(\\d+\\.?\\d*)\\s*[-–]\\s*${currencyCls}?\\s*(\\d+\\.?\\d*)`,
    'gi'
  );

  const seen = new Set();
  let match;
  while ((match = re.exec(content)) !== null) {
    const name = match[1].trim();
    const key = name.toLowerCase().replace(/\s+/g, '');
    if (!seen.has(key)) {
      seen.add(key);
      prices.push({ service: name, low: parseFloat(match[2]), high: parseFloat(match[3]) });
    }
  }
  return prices;
}

// ─── Uber live fare scraper (Playwright API interception) ────────────────────
// Scrapes uber.com/global/en/price-estimate/ and intercepts the internal JSON API.
// Falls back gracefully — returns { fares: [], source: 'unavailable' } on failure.
// Results are cached for 5 minutes to avoid redundant browser launches.
app.post('/api/uber-fare', async (req, res) => {
  const { pickupAddress, dropoffAddress } = req.body;
  if (!pickupAddress || !dropoffAddress) {
    return res.status(400).json({ error: 'Missing pickupAddress or dropoffAddress' });
  }
  const cacheKey = `uber:${pickupAddress}:${dropoffAddress}`;
  const cached = getCache(cacheKey);
  if (cached) {
    console.log('🚕 Uber fare: cache hit');
    return res.json(cached);
  }
  try {
    console.log(`🚕 Uber scrape request: "${pickupAddress}" → "${dropoffAddress}"`);
    const result = await scrapeUberFares({ pickupAddress, dropoffAddress });
    if (!result) {
      return res.json({ fares: [], source: 'unavailable' });
    }
    setCache(cacheKey, result, 300);
    res.json(result);
  } catch (err) {
    console.error('❌ /api/uber-fare error:', err.message);
    res.json({ fares: [], source: 'error', error: err.message });
  }
});

// ─── Bolt live fare scraper (Playwright API interception) ───────────────────
// Navigates to bolt.eu with coords in URL and intercepts the price API.
// Results are cached for 5 minutes.
app.post('/api/bolt-fare', async (req, res) => {
  const { pickup, dropoff, country } = req.body;
  if (!pickup?.lat || !dropoff?.lat || !country) {
    return res.status(400).json({ error: 'Missing pickup, dropoff, or country' });
  }
  const cacheKey = `bolt:${pickup.lat},${pickup.lng}:${dropoff.lat},${dropoff.lng}:${country}`;
  const cached = getCache(cacheKey);
  if (cached) {
    console.log('⚡ Bolt fare: cache hit');
    return res.json(cached);
  }
  try {
    const result = await scrapeBoltFares({ pickup, dropoff, country });
    if (!result) {
      return res.json({ fares: [], source: 'unavailable' });
    }
    setCache(cacheKey, result, 300);
    res.json(result);
  } catch (err) {
    console.error('❌ /api/bolt-fare error:', err.message);
    res.json({ fares: [], source: 'error', error: err.message });
  }
});

// ─── Google Maps Distance Matrix — real road distance + duration ─────────────
app.post('/api/route-info', async (req, res) => {
  const { pickupLat, pickupLng, dropoffLat, dropoffLng } = req.body;
  if (!pickupLat || !pickupLng || !dropoffLat || !dropoffLng) {
    return res.status(400).json({ error: 'Missing coordinates' });
  }
  const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
  if (!GOOGLE_API_KEY) {
    return res.status(500).json({ error: 'Google Maps API key not configured' });
  }
  try {
    const url =
      `https://maps.googleapis.com/maps/api/distancematrix/json` +
      `?origins=${pickupLat},${pickupLng}` +
      `&destinations=${dropoffLat},${dropoffLng}` +
      `&mode=driving` +
      `&traffic_model=best_guess` +
      `&departure_time=now` +
      `&key=${GOOGLE_API_KEY}`;
    const response = await axios.get(url);
    const element = response.data?.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK') {
      return res.status(422).json({ error: 'Route not found', details: element?.status });
    }
    const distanceKm = element.distance.value / 1000;
    const durationMin = Math.round(
      (element.duration_in_traffic?.value ?? element.duration.value) / 60
    );
    res.json({ distanceKm, durationMin, source: 'google_maps' });
  } catch (err) {
    console.error('🗺️ route-info error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ride-prices', async (req, res) => {
  const { pickupLat, pickupLng, dropoffLat, dropoffLng, country } = req.body;

  if (!pickupLat || !pickupLng || !dropoffLat || !dropoffLng) {
    return res.status(400).json({ error: 'Missing coordinates' });
  }

  if (!RIDEGURU_COUNTRIES.has(country)) {
    return res.json({ prices: [], source: 'not_supported' });
  }

  const rideGuruUrl =
    `https://ride.guru/widget?origin_latitude=${pickupLat}&origin_longitude=${pickupLng}` +
    `&destination_latitude=${dropoffLat}&destination_longitude=${dropoffLng}`;

  try {
    console.log(`🚕 RideGuru fetch: ${rideGuruUrl}`);
    const extracted = await tavilyExtract([rideGuruUrl]);
    const content =
      extracted?.results?.[0]?.raw_content ||
      extracted?.results?.[0]?.content || '';
    const prices = parseRideGuruPrices(content);
    console.log(`🚕 RideGuru parsed ${prices.length} prices for ${country}`);
    res.json({ prices, source: 'rideguru', url: rideGuruUrl });
  } catch (err) {
    console.error('🚕 RideGuru error:', err.message);
    res.json({ prices: [], source: 'error', error: err.message });
  }
});

// ─── Auth & Admin routes ─────────────────────────────────────────────────────
registerAuthRoutes(app);

// ─── Flight routes ───────────────────────────────────────────────────────────
registerFlightRoutes(app);

// ─── Food routes ────────────────────────────────────────────────────────────
registerFoodRoutes(app);

app.listen(PORT, () => {
  console.log(`\n🛒 Thaker's Quest — Backend API`);
  console.log(`🚀 Running on http://localhost:${PORT}`);
  console.log(`📡 Tavily API key: ✓ loaded from .env`);
  console.log(`🧠 Gemini Vision: ${GEMINI_API_KEY ? "✓ ready" : "✗ disabled (set GEMINI_API_KEY for image recognition)"}`);
  console.log(`🌍 Countries: ${Object.values(COUNTRIES).map(c => `${c.flag} ${c.name}`).join(", ")}`);
  console.log(
    `🏪 Default (${DEFAULT_COUNTRY}): ${MARKETPLACES.map((m) => m.name).join(", ")}\n`,
  );
});