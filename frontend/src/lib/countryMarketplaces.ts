export interface MarketplaceInfo {
  id: string;
  name: string;
  emoji: string;
  color: string; // CSS class name
}

export const COUNTRY_MARKETPLACES: Record<string, MarketplaceInfo[]> = {
  TH: [
    { id: "shopee",     name: "Shopee",     emoji: "🟠", color: "marketplace-tag-shopee" },
    { id: "lazada",     name: "Lazada",     emoji: "🔵", color: "marketplace-tag-lazada" },
    { id: "jdcentral",  name: "JD Central", emoji: "🔴", color: "marketplace-tag-jdcentral" },
    { id: "bigc",       name: "Big C",      emoji: "🟡", color: "marketplace-tag-bigc" },
    { id: "central",    name: "Central",    emoji: "🏬", color: "marketplace-tag-central" },
    { id: "makro",      name: "Makro",      emoji: "🏪", color: "marketplace-tag-makro" },
  ],
  ID: [
    { id: "tokopedia",  name: "Tokopedia",  emoji: "🟢", color: "marketplace-tag-tokopedia" },
    { id: "shopee-id",  name: "Shopee",     emoji: "🟠", color: "marketplace-tag-shopee-id" },
    { id: "lazada-id",  name: "Lazada",     emoji: "🔵", color: "marketplace-tag-lazada-id" },
    { id: "bukalapak",  name: "Bukalapak",  emoji: "🔴", color: "marketplace-tag-bukalapak" },
    { id: "blibli",     name: "Blibli",     emoji: "🔷", color: "marketplace-tag-blibli" },
  ],
  PH: [
    { id: "shopee-ph",  name: "Shopee",     emoji: "🟠", color: "marketplace-tag-shopee-ph" },
    { id: "lazada-ph",  name: "Lazada",     emoji: "🔵", color: "marketplace-tag-lazada-ph" },
  ],
  SG: [
    { id: "shopee-sg",  name: "Shopee",     emoji: "🟠", color: "marketplace-tag-shopee-sg" },
    { id: "lazada-sg",  name: "Lazada",     emoji: "🔵", color: "marketplace-tag-lazada-sg" },
    { id: "amazon-sg",  name: "Amazon",     emoji: "📦", color: "marketplace-tag-amazon-sg" },
    { id: "fairprice",  name: "FairPrice",  emoji: "🟦", color: "marketplace-tag-fairprice" },
    { id: "courts",     name: "Courts",     emoji: "📱", color: "marketplace-tag-courts" },
  ],
  MY: [
    { id: "shopee-my",  name: "Shopee",     emoji: "🟠", color: "marketplace-tag-shopee-my" },
    { id: "lazada-my",  name: "Lazada",     emoji: "🔵", color: "marketplace-tag-lazada-my" },
    { id: "pgmall",     name: "PG Mall",    emoji: "🟣", color: "marketplace-tag-pgmall" },
  ],
  IN: [
    { id: "amazon-in",  name: "Amazon",     emoji: "📦", color: "marketplace-tag-amazon-in" },
    { id: "flipkart",   name: "Flipkart",   emoji: "🟦", color: "marketplace-tag-flipkart" },
    { id: "myntra",     name: "Myntra",     emoji: "💗", color: "marketplace-tag-myntra" },
    { id: "jiomart",    name: "JioMart",    emoji: "🔵", color: "marketplace-tag-jiomart" },
    { id: "snapdeal",   name: "Snapdeal",   emoji: "💰", color: "marketplace-tag-snapdeal" },
    { id: "croma",      name: "Croma",      emoji: "📱", color: "marketplace-tag-croma" },
  ],
  AE: [
    { id: "amazon-ae",    name: "Amazon",     emoji: "📦", color: "marketplace-tag-amazon-ae" },
    { id: "noon",         name: "Noon",       emoji: "⭕", color: "marketplace-tag-noon" },
    { id: "carrefour-ae", name: "Carrefour",  emoji: "🛒", color: "marketplace-tag-carrefour-ae" },
    { id: "lulu-ae",      name: "Lulu",       emoji: "🏬", color: "marketplace-tag-lulu-ae" },
  ],
  US: [
    { id: "amazon-us",  name: "Amazon",     emoji: "📦", color: "marketplace-tag-amazon-us" },
    { id: "walmart",    name: "Walmart",    emoji: "🔵", color: "marketplace-tag-walmart" },
    { id: "bestbuy",    name: "Best Buy",   emoji: "⭕", color: "marketplace-tag-bestbuy" },
    { id: "target",     name: "Target",     emoji: "🎯", color: "marketplace-tag-target" },
    { id: "ebay",       name: "eBay",       emoji: "🔶", color: "marketplace-tag-ebay" },
  ],
  CA: [
    { id: "amazon-ca",  name: "Amazon",     emoji: "📦", color: "marketplace-tag-amazon-ca" },
    { id: "walmart-ca", name: "Walmart",    emoji: "🔵", color: "marketplace-tag-walmart-ca" },
    { id: "bestbuy-ca", name: "Best Buy",   emoji: "⭕", color: "marketplace-tag-bestbuy-ca" },
  ],
};

export function getMarketplacesForCountry(country: string): MarketplaceInfo[] {
  return COUNTRY_MARKETPLACES[country] ?? COUNTRY_MARKETPLACES["TH"] ?? [];
}

export function getDefaultMarketplaceIds(country: string): string[] {
  return getMarketplacesForCountry(country).map((m) => m.id);
}
