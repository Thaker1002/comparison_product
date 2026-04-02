import React, { useState, useEffect } from "react";
import axios from "axios";

// ── Platform metadata (mirrors backend food.js) ──────────────────────────────
const PLATFORM_META: Record<string, { name: string; bg: string; textColor: string; short: string; url: string }> = {
  grabfood:      { name: "GrabFood",      bg: "#00B14F", textColor: "#fff", short: "GF", url: "https://food.grab.com" },
  foodpanda:     { name: "Foodpanda",     bg: "#D70F64", textColor: "#fff", short: "FP", url: "https://www.foodpanda.com" },
  shopeefood:    { name: "ShopeeFood",    bg: "#EE4D2D", textColor: "#fff", short: "SF", url: "https://shopee.com" },
  robinhood:     { name: "Robinhood",     bg: "#3DBE8C", textColor: "#fff", short: "RH", url: "https://robinhood.in.th" },
  zomato:        { name: "Zomato",        bg: "#E23744", textColor: "#fff", short: "ZM", url: "https://www.zomato.com" },
  swiggy:        { name: "Swiggy",        bg: "#FC8019", textColor: "#fff", short: "SW", url: "https://www.swiggy.com" },
  deliveroo:     { name: "Deliveroo",     bg: "#00CCBC", textColor: "#fff", short: "DR", url: "https://deliveroo.com" },
  ubereats:      { name: "Uber Eats",     bg: "#06C167", textColor: "#fff", short: "UE", url: "https://www.ubereats.com" },
  talabat:       { name: "Talabat",       bg: "#FF6E00", textColor: "#fff", short: "TB", url: "https://www.talabat.com" },
  noonFood:      { name: "Noon Food",     bg: "#FEEE00", textColor: "#333", short: "NF", url: "https://www.noon.com" },
  gofood:        { name: "GoFood",        bg: "#48AF4A", textColor: "#fff", short: "GO", url: "https://gofood.co.id" },
  doordash:      { name: "DoorDash",      bg: "#FF3008", textColor: "#fff", short: "DD", url: "https://www.doordash.com" },
  grubhub:       { name: "GrubHub",       bg: "#F63440", textColor: "#fff", short: "GH", url: "https://www.grubhub.com" },
  skipthedishes: { name: "SkipTheDishes", bg: "#E77E23", textColor: "#fff", short: "SK", url: "https://www.skipthedishes.com" },
};

const COUNTRY_PLATFORMS: Record<string, string[]> = {
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

const CURRENCY_SYMBOLS: Record<string, string> = {
  TH: "฿", IN: "₹", SG: "S$", AE: "AED", ID: "Rp", PH: "₱", MY: "RM", US: "$", CA: "C$",
};

const POPULAR_DISHES: Record<string, string[]> = {
  TH: ["Pad Thai", "Green Curry", "Som Tum", "Mango Sticky Rice", "Tom Yum"],
  ID: ["Nasi Goreng", "Gado Gado", "Rendang", "Soto Ayam", "Bakso"],
  IN: ["Biryani", "Butter Chicken", "Masala Dosa", "Chole Bhature", "Paneer Tikka"],
  SG: ["Chicken Rice", "Laksa", "Char Kway Teow", "Chilli Crab", "Hokkien Mee"],
  MY: ["Nasi Lemak", "Char Kway Teow", "Roti Canai", "Laksa", "Satay"],
  PH: ["Adobo", "Sinigang", "Lechon", "Kare-Kare", "Pancit"],
  AE: ["Shawarma", "Mandi", "Biryani", "Hummus", "Falafel"],
  US: ["Burger", "Pizza", "Tacos", "Fried Chicken", "Sushi"],
  CA: ["Poutine", "Butter Tarts", "Peameal Bacon", "BeaverTails", "Montreal Bagel"],
};

type CuisineItem = { label: string; emoji: string };
const CUISINES: Record<string, CuisineItem[]> = {
  TH: [
    { label: "Thai", emoji: "🇹🇭" }, { label: "Japanese", emoji: "🍱" },
    { label: "Korean", emoji: "🍜" }, { label: "Chinese", emoji: "🥡" },
    { label: "Western", emoji: "🍔" }, { label: "Vegetarian", emoji: "🥗" },
    { label: "Seafood", emoji: "🦐" }, { label: "Desserts", emoji: "🧁" },
  ],
  CA: [
    { label: "Italian", emoji: "🍕" }, { label: "Chinese", emoji: "🥡" },
    { label: "Japanese", emoji: "🍱" }, { label: "Indian", emoji: "🍛" },
    { label: "Mexican", emoji: "🌮" }, { label: "Fast Food", emoji: "🍔" },
    { label: "Pizza", emoji: "🍕" }, { label: "Sushi", emoji: "🍣" },
    { label: "Vegan", emoji: "🥗" }, { label: "Desserts", emoji: "🧁" },
  ],
  US: [
    { label: "Fast Food", emoji: "🍔" }, { label: "Pizza", emoji: "🍕" },
    { label: "Mexican", emoji: "🌮" }, { label: "Chinese", emoji: "🥡" },
    { label: "Japanese", emoji: "🍱" }, { label: "Indian", emoji: "🍛" },
    { label: "Italian", emoji: "🍝" }, { label: "Sushi", emoji: "🍣" },
    { label: "Vegan", emoji: "🥗" }, { label: "BBQ", emoji: "🥩" },
  ],
  IN: [
    { label: "North Indian", emoji: "🍛" }, { label: "South Indian", emoji: "🥘" },
    { label: "Chinese", emoji: "🥡" }, { label: "Fast Food", emoji: "🍔" },
    { label: "Biryani", emoji: "🍚" }, { label: "Sweets", emoji: "🧁" },
    { label: "Street Food", emoji: "🌯" }, { label: "Continental", emoji: "🍝" },
  ],
  SG: [
    { label: "Chinese", emoji: "🥡" }, { label: "Malay", emoji: "🍜" },
    { label: "Indian", emoji: "🍛" }, { label: "Japanese", emoji: "🍱" },
    { label: "Western", emoji: "🍔" }, { label: "Halal", emoji: "🥙" },
    { label: "Seafood", emoji: "🦐" }, { label: "Desserts", emoji: "🧁" },
  ],
  MY: [
    { label: "Malay", emoji: "🍜" }, { label: "Chinese", emoji: "🥡" },
    { label: "Indian", emoji: "🍛" }, { label: "Japanese", emoji: "🍱" },
    { label: "Western", emoji: "🍔" }, { label: "Halal", emoji: "🥙" },
    { label: "Fast Food", emoji: "🍟" }, { label: "Desserts", emoji: "🧁" },
  ],
  ID: [
    { label: "Indonesian", emoji: "🇮🇩" }, { label: "Chinese", emoji: "🥡" },
    { label: "Japanese", emoji: "🍱" }, { label: "Western", emoji: "🍔" },
    { label: "Seafood", emoji: "🦐" }, { label: "Halal", emoji: "🥙" },
    { label: "Fast Food", emoji: "🍟" }, { label: "Desserts", emoji: "🧁" },
  ],
  PH: [
    { label: "Filipino", emoji: "🇵🇭" }, { label: "Chinese", emoji: "🥡" },
    { label: "Japanese", emoji: "🍱" }, { label: "Fast Food", emoji: "🍔" },
    { label: "Seafood", emoji: "🦐" }, { label: "BBQ", emoji: "🥩" },
    { label: "Pizza", emoji: "🍕" }, { label: "Desserts", emoji: "🧁" },
  ],
  AE: [
    { label: "Arabic", emoji: "🥙" }, { label: "Indian", emoji: "🍛" },
    { label: "Lebanese", emoji: "🧆" }, { label: "Chinese", emoji: "🥡" },
    { label: "Japanese", emoji: "🍱" }, { label: "Fast Food", emoji: "🍔" },
    { label: "Pizza", emoji: "🍕" }, { label: "Healthy", emoji: "🥗" },
  ],
};

const POPULAR_RESTAURANTS: Record<string, string[]> = {
  CA: ["McDonald's", "Tim Hortons", "Subway", "Pizza Pizza", "Harvey's"],
  US: ["McDonald's", "Chipotle", "Domino's", "Chick-fil-A", "Subway"],
  IN: ["McDonald's", "Domino's", "KFC", "Pizza Hut", "Burger King"],
  TH: ["McDonald's", "KFC", "Pizza Hut", "Sukishi", "The Pizza Company"],
  SG: ["McDonald's", "KFC", "Subway", "Jollibee", "Pizza Hut"],
  MY: ["McDonald's", "KFC", "Subway", "Pizza Hut", "Domino's"],
  ID: ["McDonald's", "KFC", "Pizza Hut", "Yoshinoya", "Mie Gacoan"],
  PH: ["Jollibee", "McDonald's", "KFC", "Pizza Hut", "Greenwich"],
  AE: ["McDonald's", "KFC", "Pizza Hut", "Hardee's", "Subway"],
};

interface PlatformResult {
  platformId: string;
  platformName: string;
  platformBg: string;
  platformTextColor: string;
  platformShort: string;
  price: string | null;
  results: { title: string; url: string; content: string }[];
}

interface FoodSearchResponse {
  dish: string;
  country: string;
  city: string;
  platforms: PlatformResult[];
}

interface FoodTabProps {
  country: string;
  countryName?: string;
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl bg-white/10" />
        <div className="flex-1">
          <div className="h-4 bg-white/10 rounded w-24 mb-2" />
          <div className="h-3 bg-white/10 rounded w-16" />
        </div>
        <div className="h-8 w-20 bg-white/10 rounded-lg" />
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-white/10 rounded w-full" />
        <div className="h-3 bg-white/10 rounded w-4/5" />
      </div>
    </div>
  );
}

// ── Platform result card ──────────────────────────────────────────────────────
function PlatformCard({
  result,
  isBest,
  dish,
  city,
}: {
  result: PlatformResult;
  isBest: boolean;
  dish: string;
  city: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = PLATFORM_META[result.platformId];
  const orderUrl = meta
    ? `${meta.url}/search?q=${encodeURIComponent(dish + " " + city)}`
    : "#";

  return (
    <div
      className={`relative bg-white/5 border rounded-2xl overflow-hidden transition-all duration-200 ${
        isBest
          ? "border-emerald-400/60 shadow-[0_0_20px_rgba(52,211,153,0.15)]"
          : "border-white/10 hover:border-white/20"
      }`}
    >
      {isBest && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-400 to-teal-400" />
      )}

      <div className="p-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          {/* Platform badge */}
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold shadow-lg flex-shrink-0"
            style={{ background: result.platformBg, color: result.platformTextColor }}
          >
            {result.platformShort}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-white text-base">{result.platformName}</span>
              {isBest && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                  Best Price
                </span>
              )}
            </div>
            <p className="text-white/40 text-xs mt-0.5 truncate">{result.results[0]?.title || `Search ${result.platformName} for ${dish}`}</p>
          </div>

          {/* Price */}
          <div className="text-right flex-shrink-0">
            {result.price ? (
              <span className="text-lg font-bold text-emerald-400">{result.price}</span>
            ) : (
              <span className="text-xs text-white/40 italic">Open to see price</span>
            )}
          </div>
        </div>

        {/* Snippet */}
        {result.results[0]?.content && (
          <p className="text-white/50 text-xs leading-relaxed line-clamp-2 mb-3">
            {result.results[0].content}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-2">
          <a
            href={orderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center py-2 px-4 rounded-xl text-sm font-semibold transition-all duration-200 hover:opacity-90 active:scale-95"
            style={{ background: result.platformBg, color: result.platformTextColor }}
          >
            Order on {result.platformName}
          </a>

          {result.results.length > 1 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="py-2 px-3 rounded-xl text-xs text-white/50 border border-white/10 hover:border-white/20 hover:text-white/70 transition-all duration-200"
            >
              {expanded ? "Less" : `+${result.results.length - 1}`}
            </button>
          )}
        </div>

        {/* Expanded results */}
        {expanded && result.results.slice(1).map((r, i) => (
          <div key={i} className="mt-3 pt-3 border-t border-white/10">
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-emerald-400 hover:underline font-medium line-clamp-1"
            >
              {r.title}
            </a>
            <p className="text-white/40 text-xs mt-1 line-clamp-2">{r.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    return (
      data.address?.city ||
      data.address?.town ||
      data.address?.village ||
      data.address?.county ||
      ""
    );
  } catch {
    return "";
  }
}

type SearchMode = "dish" | "restaurant";

export default function FoodTab({ country, countryName }: FoodTabProps) {
  const [dish, setDish] = useState("");
  const [city, setCity] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("dish");
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FoodSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-detect city on mount
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const name = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        if (name) setCity(name);
      },
      () => { /* denied — do nothing */ },
      { timeout: 6000 }
    );
  }, []);

  function locateMe() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const name = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        if (name) setCity(name);
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 8000 }
    );
  }

  const platforms = COUNTRY_PLATFORMS[country] || COUNTRY_PLATFORMS.TH;
  const currencySymbol = CURRENCY_SYMBOLS[country] || "$";
  const popularDishes = POPULAR_DISHES[country] || POPULAR_DISHES.TH;
  const cuisines = CUISINES[country] || CUISINES.US;
  const popularRestaurants = POPULAR_RESTAURANTS[country] || POPULAR_RESTAURANTS.US;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dish.trim() || dish.trim().length < 2) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const { data } = await axios.post<FoodSearchResponse>("/api/food/search", {
        dish: dish.trim(),
        country,
        city: city.trim() || countryName || country,
        searchMode,
      });
      setResults(data);
    } catch (err: unknown) {
      setError("Search failed. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Determine best price result
  const getBestPriceIndex = (platforms: PlatformResult[]): number => {
    let bestIdx = -1;
    let bestValue = Infinity;
    platforms.forEach((p, i) => {
      if (!p.price) return;
      const num = parseFloat(p.price.replace(/[^0-9.]/g, ""));
      if (!isNaN(num) && num < bestValue) {
        bestValue = num;
        bestIdx = i;
      }
    });
    return bestIdx;
  };

  const bestIdx = results ? getBestPriceIndex(results.platforms) : -1;

  return (
    <div className="min-h-screen bg-transparent text-white">
      {/* ── Hero header ─────────────────────────────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-emerald-900/80 via-teal-900/60 to-black/40 border-b border-white/10 py-8 px-4">
        <div className="max-w-3xl mx-auto text-center mb-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-3">
            <span>🍜</span> Food Price Comparison
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">Find the Best Delivery Price</h1>
          <p className="text-white/50 text-sm">Compare food prices across all delivery apps in {countryName || country}</p>
        </div>

        {/* Search form */}
        <form onSubmit={handleSearch} className="max-w-3xl mx-auto">
          {/* Search mode toggle */}
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => { setSearchMode("dish"); setDish(""); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all duration-200 ${
                searchMode === "dish"
                  ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-300"
                  : "bg-white/5 border-white/15 text-white/50 hover:bg-white/10 hover:text-white/70"
              }`}
            >
              <span>🍽️</span> Dish / Cuisine
            </button>
            <button
              type="button"
              onClick={() => { setSearchMode("restaurant"); setDish(""); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all duration-200 ${
                searchMode === "restaurant"
                  ? "bg-sky-500/20 border-sky-400/50 text-sky-300"
                  : "bg-white/5 border-white/15 text-white/50 hover:bg-white/10 hover:text-white/70"
              }`}
            >
              <span>🏪</span> Restaurant
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {/* Dish / restaurant input */}
            <div className="flex-1 relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg pointer-events-none">
                {searchMode === "restaurant" ? "🏪" : "🍽️"}
              </span>
              <input
                type="text"
                value={dish}
                onChange={e => setDish(e.target.value)}
                placeholder={searchMode === "restaurant" ? "Restaurant name (e.g. McDonald's)..." : "Dish name or cuisine type..."}
                className="w-full pl-11 pr-4 py-4 rounded-2xl bg-white/10 border border-white/20 text-white placeholder-white/40 text-base focus:outline-none focus:border-emerald-400/60 focus:bg-white/15 transition-all duration-200"
              />
            </div>

            {/* City input */}
            <div className="sm:w-52 relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg pointer-events-none">📍</span>
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="City..."
                className="w-full pl-11 pr-11 py-4 rounded-2xl bg-white/10 border border-white/20 text-white placeholder-white/40 text-base focus:outline-none focus:border-emerald-400/60 focus:bg-white/15 transition-all duration-200"
              />
              {/* Locate me button */}
              <button
                type="button"
                onClick={locateMe}
                disabled={locating}
                title="Use my location"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-400/30 transition-all duration-200 disabled:opacity-50"
              >
                {locating ? (
                  <svg className="animate-spin w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="3"/>
                    <path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                    <circle cx="12" cy="12" r="8" strokeDasharray="2 3"/>
                  </svg>
                )}
              </button>
            </div>

            {/* Search button */}
            <button
              type="submit"
              disabled={loading || dish.trim().length < 2}
              className="sm:w-auto px-8 py-4 rounded-2xl font-semibold text-base bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-95 shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Searching...
                </>
              ) : (
                <>
                  <span>🔍</span> Compare
                </>
              )}
            </button>
          </div>

          {/* Cuisine chips (dish mode) */}
          {searchMode === "dish" && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                <span className="text-white/30 text-xs self-center shrink-0">Cuisine:</span>
                {cuisines.map(c => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => setDish(c.label)}
                    className={`flex items-center gap-1 text-xs px-3 py-1 rounded-full border transition-all duration-150 ${
                      dish === c.label
                        ? "bg-emerald-500/25 border-emerald-400/50 text-emerald-300"
                        : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20"
                    }`}
                  >
                    <span>{c.emoji}</span> {c.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-white/30 text-xs self-center shrink-0">Popular:</span>
                {popularDishes.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDish(d)}
                    className={`text-xs px-3 py-1 rounded-full border transition-all duration-150 ${
                      dish === d
                        ? "bg-emerald-500/25 border-emerald-400/50 text-emerald-300"
                        : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Popular restaurants chips (restaurant mode) */}
          {searchMode === "restaurant" && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className="text-white/30 text-xs self-center shrink-0">Popular:</span>
              {popularRestaurants.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setDish(r)}
                  className={`text-xs px-3 py-1 rounded-full border transition-all duration-150 ${
                    dish === r
                      ? "bg-sky-500/25 border-sky-400/50 text-sky-300"
                      : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </form>
      </div>

      {/* ── Platform pills ──────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 py-4">
        <div className="flex flex-wrap gap-2 justify-center">
          {platforms.map(pid => {
            const meta = PLATFORM_META[pid];
            if (!meta) return null;
            return (
              <span
                key={pid}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border border-white/10"
                style={{ background: meta.bg + "22", color: meta.bg === "#FEEE00" ? "#a37f00" : meta.bg, borderColor: meta.bg + "44" }}
              >
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: meta.bg }} />
                {meta.name}
              </span>
            );
          })}
        </div>
      </div>

      {/* ── Content area ────────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 pb-24 sm:pb-8">
        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-400 text-sm text-center mb-4">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-4 mt-2">
            {platforms.slice(0, 3).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Results */}
        {results && !loading && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-lg">
                Results for <span className="text-emerald-400">"{results.dish}"</span>
              </h2>
              <span className="text-white/40 text-sm">
                {results.city} · {currencySymbol}
              </span>
            </div>

            <div className="space-y-4">
              {results.platforms.map((platform, idx) => (
                <PlatformCard
                  key={platform.platformId}
                  result={platform}
                  isBest={idx === bestIdx}
                  dish={results.dish}
                  city={results.city}

                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !results && !error && (
          <div className="text-center py-16 text-white/30">
            <div className="text-6xl mb-4">🍜</div>
            <p className="text-lg font-medium text-white/40">Search for any dish</p>
            <p className="text-sm mt-1">We'll compare prices across {platforms.length} delivery platforms</p>
          </div>
        )}
      </div>
    </div>
  );
}
