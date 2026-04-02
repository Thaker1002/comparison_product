import axios from "axios";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const SERPAPI_KEY    = process.env.SERPAPI_KEY    || "";

// ─── Platform metadata ────────────────────────────────────────────────────────
const PLATFORM_INFO = {
  grabfood:     { name: "GrabFood",      bg: "#00B14F", textColor: "#fff", short: "GF", domain: "food.grab.com" },
  foodpanda:    { name: "Foodpanda",     bg: "#D70F64", textColor: "#fff", short: "FP", domain: "foodpanda.com" },
  shopeefood:   { name: "ShopeeFood",    bg: "#EE4D2D", textColor: "#fff", short: "SF", domain: "shopee" },
  robinhood:    { name: "Robinhood",     bg: "#3DBE8C", textColor: "#fff", short: "RH", domain: "robinhood.in.th" },
  zomato:       { name: "Zomato",        bg: "#E23744", textColor: "#fff", short: "ZM", domain: "zomato.com" },
  swiggy:       { name: "Swiggy",        bg: "#FC8019", textColor: "#fff", short: "SW", domain: "swiggy.com" },
  deliveroo:    { name: "Deliveroo",     bg: "#00CCBC", textColor: "#fff", short: "DR", domain: "deliveroo.com" },
  ubereats:     { name: "Uber Eats",     bg: "#06C167", textColor: "#fff", short: "UE", domain: "ubereats.com" },
  talabat:      { name: "Talabat",       bg: "#FF6E00", textColor: "#fff", short: "TB", domain: "talabat.com" },
  noonFood:     { name: "Noon Food",     bg: "#FEEE00", textColor: "#333", short: "NF", domain: "noon.com" },
  gofood:       { name: "GoFood",        bg: "#48AF4A", textColor: "#fff", short: "GO", domain: "gofood.co.id" },
  doordash:     { name: "DoorDash",      bg: "#FF3008", textColor: "#fff", short: "DD", domain: "doordash.com" },
  grubhub:      { name: "GrubHub",       bg: "#F63440", textColor: "#fff", short: "GH", domain: "grubhub.com" },
  skipthedishes:{ name: "SkipTheDishes", bg: "#E77E23", textColor: "#fff", short: "SK", domain: "skipthedishes.com" },
};

const COUNTRY_PLATFORMS = {
  TH: ["grabfood", "foodpanda", "shopeefood", "robinhood"],
  IN: ["zomato", "swiggy", "foodpanda"],
  SG: ["grabfood", "foodpanda", "deliveroo", "ubereats"],
  AE: ["talabat", "deliveroo", "ubereats", "noonFood"],
  ID: ["gofood", "grabfood", "shopeefood"],
  PH: ["grabfood", "foodpanda"],
  MY: ["grabfood", "foodpanda", "shopeefood"],
  US: ["doordash", "ubereats", "grubhub"],
  CA: ["doordash", "ubereats", "skipthedishes"],
};

const CURRENCY_SYMBOLS = {
  TH: "฿", IN: "₹", SG: "S$", AE: "AED", ID: "Rp", PH: "₱", MY: "RM", US: "$", CA: "C$",
};

// ─── Extract price hint from text ────────────────────────────────────────────
function extractPrice(text, country) {
  const curr = CURRENCY_SYMBOLS[country] || "$";
  const escaped = curr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`${escaped}\\s?\\d+(?:[.,]\\d+)?`),
    /\d+(?:[.,]\d+)?\s?(?:baht|thb|inr|sgd|aed|idr|php|myr|usd|cad)/i,
    /(?:from|price|cost|starting at)\s*[^\d]*(\d+(?:[.,]\d+)?)/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[0].trim();
  }
  return null;
}

// ─── Tavily search ────────────────────────────────────────────────────────────
async function tavilySearch(query, domain) {
  if (!TAVILY_API_KEY) return [];
  const body = {
    api_key: TAVILY_API_KEY,
    query,
    search_depth: "basic",
    max_results: 3,
  };
  if (domain && !["shopee"].includes(domain)) {
    body.include_domains = [domain];
  }
  const res = await axios.post("https://api.tavily.com/search", body, { timeout: 8000 });
  return res.data?.results || [];
}

// ─── SerpAPI organic search fallback ─────────────────────────────────────────
async function serpSearch(query, domain) {
  if (!SERPAPI_KEY) return [];
  try {
    const params = {
      engine: "google",
      q: domain ? `site:${domain} ${query}` : query,
      api_key: SERPAPI_KEY,
      num: 3,
      hl: "en",
    };
    const res = await axios.get("https://serpapi.com/search.json", { params, timeout: 10000 });
    const organic = res.data?.organic_results || [];
    return organic.map(r => ({
      title:   r.title   || "",
      url:     r.link    || "#",
      content: r.snippet || "",
    }));
  } catch {
    return [];
  }
}

// ─── Route registration ───────────────────────────────────────────────────────
export function registerFoodRoutes(app) {

  app.post("/api/food/search", async (req, res) => {
    const { dish, country = "TH", city = "Bangkok", searchMode = "dish" } = req.body;
    if (!dish || dish.trim().length < 2) {
      return res.status(400).json({ error: "dish must be at least 2 characters" });
    }

    const platformIds = COUNTRY_PLATFORMS[country] || COUNTRY_PLATFORMS.TH;

    const settled = await Promise.allSettled(
      platformIds.map(async (pid) => {
        const info = PLATFORM_INFO[pid];

        // Build query differently for restaurant vs dish/cuisine mode
        const query = searchMode === "restaurant"
          ? `${dish.trim()} restaurant ${info.name} ${city} menu order`
          : `${dish.trim()} ${info.name} ${city} food delivery`;

        // Try Tavily first; fall back to SerpAPI if Tavily returns nothing
        let raw = await tavilySearch(query, info.domain).catch(() => []);
        if (!raw.length) {
          raw = await serpSearch(`${dish.trim()} ${info.name} ${city}`, info.domain);
        }

        let price = null;
        for (const r of raw) {
          price = extractPrice((r.title || "") + " " + (r.content || ""), country);
          if (price) break;
        }

        return {
          platformId:       pid,
          platformName:     info.name,
          platformBg:       info.bg,
          platformTextColor: info.textColor,
          platformShort:    info.short,
          price,
          results: raw.map(r => ({
            title:   r.title   || "",
            url:     r.url     || "#",
            content: (r.content || r.snippet || "").slice(0, 180),
          })),
        };
      })
    );

    const platforms = settled
      .filter(r => r.status === "fulfilled")
      .map(r => r.value);

    return res.json({ dish: dish.trim(), country, city, platforms });
  });
}
