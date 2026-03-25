// ─── Shared types for Thaker's Quest mobile app ─────────────────────────────

export interface Country {
  code: string;
  name: string;
  flag: string;
  currency: string;
  marketplaceCount: number;
  marketplaces: Marketplace[];
}

export interface Marketplace {
  id: string;
  name: string;
  domain: string;
  color: string;
  logo: string;
  flag?: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice?: number | null;
  discount?: number | null;
  image?: string | null;
  url: string;
  rating?: number | null;
  reviewCount?: number | null;
  soldCount?: number | null;
  seller?: string | null;
  location?: string | null;
  badge?: string | null;
  quantity?: string | null;
  capacity?: string | null;
  brand?: string | null;
  currency: string;
  marketplace: string;
  marketplaceName: string;
  marketplaceColor: string;
  marketplaceDomain: string;
  marketplaceLogo: string;
}

export interface MarketplaceSummary {
  marketplaceId: string;
  marketplaceName: string;
  count: number;
  minPrice: number | null;
  maxPrice: number | null;
  avgPrice: number | null;
}

export interface SearchResponse {
  query: string;
  country: string;
  totalResults: number;
  marketplacesSearched: number;
  timestamp: string;
  summary: MarketplaceSummary[];
  products: Product[];
}

export interface SearchParams {
  query: string;
  country: string;
  marketplaces?: string[];
  searchMode?: "scrape" | "search";
}

// Navigation param types
export type RootStackParamList = {
  CountrySelect: undefined;
  Main: { country: Country };
  ProductDetail: { product: Product };
};

export type MainTabParamList = {
  Home: { country: Country };
  Search: { country: Country };
  Favorites: undefined;
  Settings: undefined;
};
