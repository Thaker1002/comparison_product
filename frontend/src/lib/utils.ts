import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(
  price: number | null | undefined,
  currency = "THB",
  locale = "th-TH"
): string {
  if (price == null || isNaN(price)) return "N/A";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

export function formatNumber(
  num: number | null | undefined,
  locale = "th-TH"
): string {
  if (num == null || isNaN(num)) return "N/A";
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat(locale).format(num);
}

export function formatDiscount(discount: number | null | undefined): string {
  if (discount == null || discount <= 0) return "";
  return `-${Math.round(discount)}%`;
}

export function calculateSavings(
  originalPrice: number | null | undefined,
  currentPrice: number | null | undefined
): number | null {
  if (!originalPrice || !currentPrice) return null;
  if (originalPrice <= currentPrice) return null;
  return originalPrice - currentPrice;
}

export function calculateDiscountPercent(
  originalPrice: number | null | undefined,
  currentPrice: number | null | undefined
): number | null {
  if (!originalPrice || !currentPrice || originalPrice <= 0) return null;
  if (originalPrice <= currentPrice) return null;
  return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
}

export function truncateText(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "…";
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getMarketplaceColor(marketplaceId: string): string {
  const colors: Record<string, string> = {
    shopee: "#EE4D2D",
    lazada: "#7B83EB",
    jdcentral: "#CC0000",
    bigc: "#F5A623",
    central: "#CC4444",
    makro: "#4499DD",
  };
  return colors[marketplaceId] ?? "#6366f1";
}

export function getMarketplaceBgClass(marketplaceId: string): string {
  const classes: Record<string, string> = {
    shopee: "marketplace-tag-shopee",
    lazada: "marketplace-tag-lazada",
    jdcentral: "marketplace-tag-jdcentral",
    bigc: "marketplace-tag-bigc",
    central: "marketplace-tag-central",
    makro: "marketplace-tag-makro",
  };
  return classes[marketplaceId] ?? "";
}

export function getMarketplaceEmoji(marketplaceId: string): string {
  const emojis: Record<string, string> = {
    shopee: "🟠",
    lazada: "🔵",
    jdcentral: "🔴",
    bigc: "🟡",
    central: "🟤",
    makro: "🔵",
  };
  return emojis[marketplaceId] ?? "🛒";
}

export function getRatingStars(rating: number | null | undefined): {
  full: number;
  half: boolean;
  empty: number;
} {
  if (!rating) return { full: 0, half: false, empty: 5 };
  const clamped = Math.max(0, Math.min(5, rating));
  const full = Math.floor(clamped);
  const half = clamped - full >= 0.25 && clamped - full < 0.75;
  const empty = 5 - full - (half ? 1 : 0);
  return { full, half, empty };
}

export function getPriceTier(
  price: number,
  minPrice: number,
  maxPrice: number
): "best" | "good" | "average" | "high" {
  if (maxPrice === minPrice) return "best";
  const range = maxPrice - minPrice;
  const pct = (price - minPrice) / range;
  if (pct <= 0.1) return "best";
  if (pct <= 0.4) return "good";
  if (pct <= 0.7) return "average";
  return "high";
}

export function getPriceTierColor(
  tier: "best" | "good" | "average" | "high"
): string {
  switch (tier) {
    case "best":
      return "text-emerald-400";
    case "good":
      return "text-green-400";
    case "average":
      return "text-yellow-400";
    case "high":
      return "text-red-400";
  }
}

export function getPriceTierLabel(
  tier: "best" | "good" | "average" | "high"
): string {
  switch (tier) {
    case "best":
      return "Best Price";
    case "good":
      return "Good Deal";
    case "average":
      return "Average";
    case "high":
      return "High Price";
  }
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g. "data:image/png;base64,")
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function parseProductName(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, "")           // remove extension
    .replace(/[-_]+/g, " ")              // replace dashes/underscores with spaces
    .replace(/\s+/g, " ")               // collapse multiple spaces
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function sortProducts<T extends { price?: number | null }>(
  products: T[],
  sortBy: "price_asc" | "price_desc" | "rating" | "relevance",
  extras?: {
    getRating?: (p: T) => number | null | undefined;
  }
): T[] {
  const arr = [...products];
  switch (sortBy) {
    case "price_asc":
      return arr.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    case "price_desc":
      return arr.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    case "rating":
      return arr.sort(
        (a, b) =>
          (extras?.getRating?.(b) ?? 0) - (extras?.getRating?.(a) ?? 0)
      );
    default:
      return arr;
  }
}

export function groupByMarketplace<
  T extends { marketplace: string; marketplaceName: string }
>(products: T[]): Record<string, T[]> {
  return products.reduce<Record<string, T[]>>((acc, product) => {
    const key = product.marketplace;
    if (!acc[key]) acc[key] = [];
    acc[key].push(product);
    return acc;
  }, {});
}

export function getRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "absolute";
  el.style.left = "-9999px";
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
  return Promise.resolve();
}

export function openInNewTab(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
