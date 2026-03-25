/**
 * Translate product description to the selected language using backend Claude Sonnet endpoint
 */
export async function translateText(text: string, targetLang: string): Promise<string> {
  const response = await axios.post<{ translated: string }>(
    '/api/translate',
    { text, targetLang }
  );
  return response.data.translated;
}
import axios from 'axios'

const API_BASE = '/api'

export interface SearchRequest {
  query: string
  marketplaces?: string[]
  searchMode?: 'scrape' | 'search'
  image?: string
}

export interface Product {
  id: string
  name: string
  price: number
  originalPrice?: number | null
  discount?: number | null
  image?: string | null
  url: string
  rating?: number | null
  reviewCount?: number | null
  soldCount?: number | null
  seller?: string | null
  location?: string | null
  badge?: string | null
  quantity?: string | null
  capacity?: string | null
  brand?: string | null
  marketplace: string
  marketplaceName: string
  marketplaceColor: string
  marketplaceDomain: string
  marketplaceLogo: string
  currency: string
}

export interface MarketplaceSummary {
  marketplaceId: string
  marketplaceName: string
  count: number
  minPrice: number | null
  maxPrice: number | null
  avgPrice: number | null
}

export interface SearchResponse {
  query: string
  totalResults: number
  marketplacesSearched: number
  timestamp: string
  summary: MarketplaceSummary[]
  products: Product[]
}

export interface Marketplace {
  id: string
  name: string
  domain: string
  color: string
  logo: string
  flag: string
}

export interface ProductDetail {
  name?: string
  brand?: string
  price?: number
  originalPrice?: number
  discount?: number
  description?: string
  images?: string[]
  rating?: number
  reviewCount?: number
  seller?: string
  specifications?: Record<string, string>
  capacity?: string
  quantity?: string
  weight?: string
  dimensions?: string
  material?: string
  color?: string
  model?: string
  sku?: string
  inStock?: boolean
  shippingInfo?: string
  variants?: string[]
}

export interface ProductDetailResponse {
  url: string
  detail: ProductDetail
}

// ─── API functions ─────────────────────────────────────────────────────────

/**
 * Search for products across Thai marketplaces
 */
export async function searchProducts(params: SearchRequest): Promise<SearchResponse> {
  const formData = new FormData()
  formData.append('query', params.query)

  if (params.marketplaces && params.marketplaces.length > 0) {
    params.marketplaces.forEach((m) => formData.append('marketplaces', m))
  }

  if (params.searchMode) {
    formData.append('searchMode', params.searchMode)
  }

  if (params.image) {
    // Convert base64 to blob and append
    const response = await fetch(params.image)
    const blob = await response.blob()
    formData.append('image', blob, 'product.jpg')
  }

  const { data } = await axios.post<SearchResponse>(`${API_BASE}/search`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120_000, // 2 min — Firecrawl can be slow
  })

  return data
}

/**
 * Fetch available marketplaces
 */
export async function fetchMarketplaces(): Promise<Marketplace[]> {
  const { data } = await axios.get<Marketplace[]>(`${API_BASE}/marketplaces`, {
    timeout: 10_000,
  })
  return data
}

/**
 * Fetch detailed product info by URL
 */
export async function fetchProductDetail(url: string): Promise<ProductDetailResponse> {
  const { data } = await axios.post<ProductDetailResponse>(
    `${API_BASE}/product/detail`,
    { url },
    { timeout: 60_000 }
  )
  return data
}

/**
 * Health check
 */
export async function healthCheck(): Promise<boolean> {
  try {
    await axios.get('/health', { timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

// ─── Formatting helpers ────────────────────────────────────────────────────

export function formatPrice(price: number, currency = 'THB'): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export function calcSavings(price: number, originalPrice: number): number {
  return Math.round(originalPrice - price)
}

export function calcDiscountPct(price: number, originalPrice: number): number {
  return Math.round(((originalPrice - price) / originalPrice) * 100)
}

export function getCheapestProduct(products: Product[]): Product | null {
  if (!products.length) return null
  return products.reduce((min, p) => (p.price < min.price ? p : min))
}

export function getMarketplaceColor(marketplaceId: string): string {
  const colors: Record<string, string> = {
    shopee: '#EE4D2D',
    lazada: '#0F146D',
    jdcentral: '#CC0000',
    bigc: '#F5A623',
    central: '#B22222',
    makro: '#0057A8',
  }
  return colors[marketplaceId] ?? '#6366f1'
}

export function getMarketplaceTextColor(marketplaceId: string): string {
  const colors: Record<string, string> = {
    shopee: '#FF6B4A',
    lazada: '#7B83EB',
    jdcentral: '#FF4444',
    bigc: '#F5A623',
    central: '#CC4444',
    makro: '#4499DD',
  }
  return colors[marketplaceId] ?? '#a5b4fc'
}

export function getMarketplaceEmoji(marketplaceId: string): string {
  const emojis: Record<string, string> = {
    shopee: '🟠',
    lazada: '🔵',
    jdcentral: '🔴',
    bigc: '🟡',
    central: '🏬',
    makro: '🏪',
  }
  return emojis[marketplaceId] ?? '🛒'
}

export function buildImageUrl(url: string | null | undefined): string {
  if (!url) return ''
  // Ensure protocol
  if (url.startsWith('//')) return `https:${url}`
  if (!url.startsWith('http')) return `https://${url}`
  return url
}
