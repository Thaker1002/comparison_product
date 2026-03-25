// ─── Marketplace Types ──────────────────────────────────────────────────────

export type MarketplaceId =
  | "shopee"
  | "lazada"
  | "jdcentral"
  | "bigc"
  | "central"
  | "makro";

export interface Marketplace {
  id: MarketplaceId;
  name: string;
  domain: string;
  color: string;
  logo: string;
  flag: string;
}

// ─── Product Types ──────────────────────────────────────────────────────────

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

  // Marketplace info (denormalized for convenience)
  marketplace: MarketplaceId;
  marketplaceName: string;
  marketplaceColor: string;
  marketplaceDomain: string;
  marketplaceLogo: string;
}

export interface ProductDetail extends Product {
  description?: string | null;
  images?: string[];
  specifications?: Record<string, string | number | boolean>;
  weight?: string | null;
  dimensions?: string | null;
  material?: string | null;
  color?: string | null;
  model?: string | null;
  sku?: string | null;
  inStock?: boolean | null;
  shippingInfo?: string | null;
  variants?: string[];
}

// ─── Search Types ────────────────────────────────────────────────────────────

export type SearchMode = "scrape" | "search";

export type SortOption =
  | "price-asc"
  | "price-desc"
  | "rating-desc"
  | "discount-desc"
  | "reviews-desc"
  | "relevance";

export type ViewMode = "grid" | "list" | "compare";

export interface MarketplaceSummary {
  marketplaceId: MarketplaceId;
  marketplaceName: string;
  count: number;
  minPrice: number | null;
  maxPrice: number | null;
  avgPrice: number | null;
}

export interface SearchRequest {
  query: string;
  marketplaces?: MarketplaceId[];
  searchMode?: SearchMode;
  image?: File | null;
}

export interface SearchResponse {
  query: string;
  totalResults: number;
  marketplacesSearched: number;
  timestamp: string;
  summary: MarketplaceSummary[];
  products: Product[];
  _meta?: {
    fallbackUrlCount: number;
    fallbackUrlPct: number;
  };
}

// ─── Filter Types ────────────────────────────────────────────────────────────

export interface PriceRange {
  min: number;
  max: number;
}

export interface SearchFilters {
  marketplaces: MarketplaceId[];
  priceRange: PriceRange | null;
  minRating: number | null;
  hasDiscount: boolean;
  inStock: boolean;
  sortBy: SortOption;
  viewMode: ViewMode;
  searchMode: SearchMode;
}

export const DEFAULT_FILTERS: SearchFilters = {
  marketplaces: ["shopee", "lazada", "jdcentral", "bigc", "central", "makro"],
  priceRange: null,
  minRating: null,
  hasDiscount: false,
  inStock: false,
  sortBy: "price-asc",
  viewMode: "grid",
  searchMode: "scrape",
};

// ─── UI State Types ──────────────────────────────────────────────────────────

export interface UploadedImage {
  file: File;
  preview: string;
  name: string;
}

export interface ComparisonItem {
  product: Product;
  selected: boolean;
}

export interface Toast {
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  message?: string;
  duration?: number;
}

// ─── Chart Types ─────────────────────────────────────────────────────────────

export interface PriceChartData {
  marketplace: string;
  minPrice: number;
  avgPrice: number;
  maxPrice: number;
  count: number;
  color: string;
}

export interface PriceTrendPoint {
  name: string;
  price: number;
  marketplace: string;
}

// ─── API Error ───────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  message?: string;
  status?: number;
}

// ─── Utility types ───────────────────────────────────────────────────────────

export type AsyncStatus = "idle" | "loading" | "success" | "error";

export interface PaginatedResults<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
