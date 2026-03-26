import React, { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import {
  TrendingDown,
  TrendingUp,
  BarChart2,
  Award,
  ShoppingBag,
  AlertCircle,
  ArrowUpDown,
  ExternalLink,
  Star,
} from "lucide-react";
import {
  cn,
  formatPrice,
  formatNumber,
  getMarketplaceColor,
  getMarketplaceBgClass,
  getPriceTier,
  getPriceTierColor,
} from "@/lib/utils";
import { ProductCard, ProductCardSkeleton } from "@/components/ProductCard";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Product, MarketplaceSummary, SearchFilters } from "@/types";

// ─── Marketplace Summary Cards ────────────────────────────────────────────────

interface SummaryCardProps {
  summary: MarketplaceSummary;
  isLoading?: boolean;
  rank: number;
}

export function SummaryCard({ summary, rank }: SummaryCardProps) {
  const bgClass = getMarketplaceBgClass(summary.marketplaceId);
  const color = getMarketplaceColor(summary.marketplaceId);

  const emoji: Record<string, string> = {
    shopee: "🟠",
    lazada: "🔵",
    jdcentral: "🔴",
    bigc: "🟡",
    central: "🏬",
    makro: "🏪",
  };

  return (
    <div
      className={cn(
        "glass-card rounded-2xl p-4 border border-border/50 flex flex-col gap-3",
        "hover:border-border transition-all duration-200",
        "animate-fade-in",
        rank === 0 && "ring-1 ring-emerald-500/30 border-emerald-500/20",
      )}
      style={{ animationDelay: `${rank * 80}ms` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold marketplace-pill border",
            bgClass,
          )}
        >
          <span>{emoji[summary.marketplaceId] ?? "🛒"}</span>
          {summary.marketplaceName}
        </div>
        {rank === 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-[10px] font-bold text-emerald-400">
            <Award className="w-2.5 h-2.5" />
            Cheapest
          </div>
        )}
      </div>

      {/* Product count */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-foreground tabular-nums">
          {summary.count}
        </span>
        <span className="text-xs text-muted-foreground">products found</span>
      </div>

      {/* Price range */}
      {summary.minPrice != null && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Min</span>
            <span className="font-semibold text-emerald-400 tabular-nums">
              {formatPrice(summary.minPrice)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Avg</span>
            <span className="font-semibold text-foreground tabular-nums">
              {summary.avgPrice ? formatPrice(summary.avgPrice) : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Max</span>
            <span className="font-semibold text-red-400 tabular-nums">
              {formatPrice(summary.maxPrice!)}
            </span>
          </div>
        </div>
      )}

      {/* Mini progress bar */}
      <div className="h-1 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${Math.min(100, (summary.count / 8) * 100)}%`,
            background: color,
          }}
        />
      </div>
    </div>
  );
}

// ─── Price Chart ──────────────────────────────────────────────────────────────

interface PriceChartProps {
  summaries: MarketplaceSummary[];
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-strong border border-border/60 rounded-xl p-3 shadow-xl min-w-[160px]">
      <p className="text-xs font-semibold text-foreground mb-2">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: entry.color }}
            />
            <span className="text-[11px] text-muted-foreground capitalize">
              {entry.name}
            </span>
          </div>
          <span className="text-[11px] font-semibold text-foreground tabular-nums">
            {formatPrice(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

export function PriceChart({ summaries }: PriceChartProps) {
  const data = summaries
    .filter((s) => s.count > 0 && s.minPrice != null)
    .map((s) => ({
      name: s.marketplaceName,
      id: s.marketplaceId,
      min: s.minPrice ?? 0,
      avg: s.avgPrice ?? 0,
      max: s.maxPrice ?? 0,
    }));

  if (data.length === 0) return null;

  const globalMin = Math.min(...data.map((d) => d.min));
  const globalAvg = Math.round(
    data.reduce((sum, d) => sum + d.avg, 0) / data.length,
  );

  return (
    <div className="glass-card rounded-2xl border border-border/50 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary" />
            Price Comparison Chart
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Min, Average & Max prices across marketplaces (THB)
          </p>
        </div>
        <div className="flex items-center gap-3">
          {[
            { color: "#10b981", label: "Min" },
            { color: "#6366f1", label: "Avg" },
            { color: "#ef4444", label: "Max" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: color }}
              />
              <span className="text-[11px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
            barGap={3}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />
            <XAxis
              dataKey="name"
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `฿${formatNumber(v)}`}
              width={56}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgba(99,102,241,0.06)" }}
            />
            <ReferenceLine
              y={globalAvg}
              stroke="rgba(99,102,241,0.3)"
              strokeDasharray="4 4"
              label={{
                value: `Avg ฿${formatNumber(globalAvg)}`,
                fill: "#6366f1",
                fontSize: 10,
                position: "insideTopRight",
              }}
            />
            <Bar dataKey="min" name="min" radius={[4, 4, 0, 0]} maxBarSize={32}>
              {data.map((entry) => (
                <Cell
                  key={entry.id}
                  fill={
                    entry.min === globalMin ? "#10b981" : "rgba(16,185,129,0.5)"
                  }
                />
              ))}
            </Bar>
            <Bar
              dataKey="avg"
              name="avg"
              fill="rgba(99,102,241,0.7)"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
            <Bar
              dataKey="max"
              name="max"
              fill="rgba(239,68,68,0.6)"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Comparison Table ─────────────────────────────────────────────────────────

interface ComparisonTableProps {
  products: Product[];
  minPrice: number;
  maxPrice: number;
}

function ComparisonTable({
  products,
  minPrice,
  maxPrice,
}: ComparisonTableProps) {
  const [sortCol, setSortCol] = useState<
    "price" | "rating" | "discount" | "marketplace"
  >("price");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const sorted = useMemo(() => {
    return [...products].sort((a, b) => {
      let cmp = 0;
      if (sortCol === "price") cmp = (a.price ?? 0) - (b.price ?? 0);
      else if (sortCol === "rating") cmp = (b.rating ?? 0) - (a.rating ?? 0);
      else if (sortCol === "discount") {
        const da =
          a.discount ??
          (a.originalPrice
            ? Math.round(((a.originalPrice - a.price) / a.originalPrice) * 100)
            : 0);
        const db =
          b.discount ??
          (b.originalPrice
            ? Math.round(((b.originalPrice - b.price) / b.originalPrice) * 100)
            : 0);
        cmp = db - da;
      } else if (sortCol === "marketplace") {
        cmp = a.marketplaceName.localeCompare(b.marketplaceName);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [products, sortCol, sortDir]);

  const SortButton = ({
    col,
    children,
  }: {
    col: typeof sortCol;
    children: React.ReactNode;
  }) => (
    <button
      onClick={() => handleSort(col)}
      className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors duration-150 group"
    >
      {children}
      <ArrowUpDown
        className={cn(
          "w-3 h-3 transition-colors duration-150",
          sortCol === col
            ? "text-primary"
            : "group-hover:text-muted-foreground/80",
        )}
      />
    </button>
  );

  return (
    <div className="glass-card rounded-2xl border border-border/50 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-secondary/30">
              <th className="text-left px-4 py-3">
                <SortButton col="marketplace">Marketplace</SortButton>
              </th>
              <th className="text-left px-4 py-3 min-w-[200px]">Product</th>
              <th className="text-right px-4 py-3">
                <SortButton col="price">Price</SortButton>
              </th>
              <th className="text-right px-4 py-3">
                <SortButton col="discount">Discount</SortButton>
              </th>
              <th className="text-center px-4 py-3">Capacity / Qty</th>
              <th className="text-center px-4 py-3">
                <SortButton col="rating">Rating</SortButton>
              </th>
              <th className="text-center px-4 py-3">Sold</th>
              <th className="text-right px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {sorted.map((product, i) => {
              const tier = getPriceTier(product.price, minPrice, maxPrice);
              const tierColor = getPriceTierColor(tier);
              const bgClass = getMarketplaceBgClass(product.marketplace);
              const discountPct =
                product.discount ??
                (product.originalPrice
                  ? Math.round(
                      ((product.originalPrice - product.price) /
                        product.originalPrice) *
                        100,
                    )
                  : null);

              return (
                <tr
                  key={product.id}
                  className={cn(
                    "transition-colors duration-100 hover:bg-secondary/20",
                    i % 2 === 0 ? "bg-transparent" : "bg-secondary/10",
                  )}
                >
                  {/* Marketplace */}
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border marketplace-pill",
                        bgClass,
                      )}
                    >
                      {product.marketplace === "shopee" && "🟠"}
                      {product.marketplace === "lazada" && "🔵"}
                      {product.marketplace === "jdcentral" && "🔴"}
                      {product.marketplace === "bigc" && "🟡"}
                      {product.marketplace === "central" && "🏬"}
                      {product.marketplace === "makro" && "🏪"}
                      {product.marketplaceName}
                    </span>
                  </td>

                  {/* Product */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {product.image && (
                        <div className="w-9 h-9 rounded-lg overflow-hidden bg-secondary/50 border border-border/40 shrink-0">
                          <img
                            src={product.image}
                            alt={product.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                            loading="lazy"
                          />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug">
                          {product.name}
                        </p>
                        {product.brand && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {product.brand}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Price */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span
                        className={cn(
                          "text-sm font-bold tabular-nums",
                          tierColor,
                        )}
                      >
                        {formatPrice(product.price)}
                      </span>
                      {product.originalPrice &&
                        product.originalPrice > product.price && (
                          <span className="text-[10px] text-muted-foreground line-through tabular-nums">
                            {formatPrice(product.originalPrice)}
                          </span>
                        )}
                      {tier === "best" && (
                        <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-0.5">
                          <Award className="w-2.5 h-2.5" /> Best
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Discount */}
                  <td className="px-4 py-3 text-right">
                    {discountPct && discountPct > 0 ? (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-bold border border-red-500/20">
                        <TrendingDown className="w-2.5 h-2.5" />-{discountPct}%
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/40">
                        —
                      </span>
                    )}
                  </td>

                  {/* Capacity / Qty */}
                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      {product.capacity && (
                        <span className="text-[10px] text-foreground font-medium">
                          {product.capacity}
                        </span>
                      )}
                      {product.quantity && (
                        <span className="text-[10px] text-muted-foreground">
                          {product.quantity}
                        </span>
                      )}
                      {!product.capacity && !product.quantity && (
                        <span className="text-[11px] text-muted-foreground/40">
                          —
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Rating */}
                  <td className="px-4 py-3 text-center">
                    {product.rating != null ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="flex items-center gap-0.5">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          <span className="text-[11px] font-semibold text-amber-400 tabular-nums">
                            {product.rating.toFixed(1)}
                          </span>
                        </div>
                        {product.reviewCount != null && (
                          <span className="text-[10px] text-muted-foreground">
                            ({formatNumber(product.reviewCount)})
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/40">
                        —
                      </span>
                    )}
                  </td>

                  {/* Sold */}
                  <td className="px-4 py-3 text-center">
                    {product.soldCount != null ? (
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {formatNumber(product.soldCount)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/40">
                        —
                      </span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="px-4 py-3 text-right">
                    <a
                      href={product.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold",
                        "gradient-bg text-white",
                        "hover:shadow-md hover:shadow-primary/20 hover:-translate-y-px",
                        "transition-all duration-200",
                        "border border-primary/30",
                      )}
                    >
                      <ExternalLink className="w-3 h-3" />
                      View
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ query }: { query?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5 text-center animate-fade-in">
      <div className="relative">
        <div className="w-24 h-24 rounded-3xl bg-secondary/50 border border-border/40 flex items-center justify-center">
          <ShoppingBag className="w-10 h-10 text-muted-foreground/30" />
        </div>
        <div className="absolute -top-2 -right-2 w-8 h-8 rounded-xl bg-secondary border border-border/50 flex items-center justify-center">
          <AlertCircle className="w-4 h-4 text-muted-foreground/50" />
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-foreground">
          No products found
        </h3>
        <p className="text-sm text-muted-foreground max-w-[360px] leading-relaxed">
          {query
            ? `We couldn't find any products for "${query}" on Thai marketplaces. Try a different search query or adjust your marketplace filters.`
            : "Upload a product image or enter a search query to find products across Shopee, Lazada, JD Central, Big C and more."}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-center">
        {["Coca-Cola", "Shampoo", "Face Wash", "Protein", "Olive Oil"].map(
          (s) => (
            <span
              key={s}
              className="px-3 py-1.5 rounded-full border border-border/50 bg-secondary/30 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors cursor-pointer"
            >
              Try: {s}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

// ─── Stats Banner ──────────────────────────────────────────────────────────────

interface StatsBannerProps {
  products: Product[];
  query: string;
  timestamp?: string;
}

export function StatsBanner({ products }: StatsBannerProps) {
  if (products.length === 0) return null;

  const prices = products.map((p) => p.price).filter(Boolean);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = Math.round(
    prices.reduce((a, b) => a + b, 0) / prices.length,
  );
  const priceDiff = maxPrice - minPrice;
  const priceDiffPct =
    minPrice > 0 ? Math.round((priceDiff / minPrice) * 100) : 0;

  const cheapest = products.find((p) => p.price === minPrice);
  const discounted = products.filter(
    (p) =>
      (p.discount ?? 0) > 0 || (p.originalPrice && p.originalPrice > p.price),
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-in">
      {[
        {
          label: "Lowest Price",
          value: formatPrice(minPrice),
          sub: cheapest?.marketplaceName,
          icon: TrendingDown,
          color: "text-emerald-400",
          bg: "bg-emerald-400/10 border-emerald-400/20",
        },
        {
          label: "Average Price",
          value: formatPrice(avgPrice),
          sub: `across ${products.length} items`,
          icon: BarChart2,
          color: "text-blue-400",
          bg: "bg-blue-400/10 border-blue-400/20",
        },
        {
          label: "Price Spread",
          value: `${priceDiffPct}%`,
          sub: `฿${formatNumber(priceDiff)} difference`,
          icon: TrendingUp,
          color: "text-purple-400",
          bg: "bg-purple-400/10 border-purple-400/20",
        },
        {
          label: "On Sale",
          value: `${discounted.length}`,
          sub: `of ${products.length} products`,
          icon: Award,
          color: "text-amber-400",
          bg: "bg-amber-400/10 border-amber-400/20",
        },
      ].map(({ label, value, sub, icon: Icon, color, bg }, i) => (
        <div
          key={label}
          className={cn(
            "glass-card rounded-xl p-4 border flex items-start gap-3",
            bg,
            "animate-fade-in",
          )}
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div
            className={cn("mt-0.5 p-1.5 rounded-lg bg-background/30", color)}
          >
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              {label}
            </p>
            <p className={cn("text-lg font-bold tabular-nums", color)}>
              {value}
            </p>
            {sub && (
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                {sub}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main ResultsGrid Component ───────────────────────────────────────────────

interface ResultsGridProps {
  products: Product[];
  summaries: MarketplaceSummary[];
  query: string;
  isLoading?: boolean;
  filters: SearchFilters;
  timestamp?: string;
}

const SKELETONS = Array.from({ length: 6 });

export function ResultsGrid({
  products,
  summaries: _summaries,
  query,
  isLoading = false,
  filters,
}: ResultsGridProps) {


  // Apply client-side sorting and filtering
  const filteredProducts = useMemo(() => {
    // Exclude Google Lens / non-local results
    let result = products.filter((p) => (p as any).marketplace !== "google_lens");

    if (filters.hasDiscount) {
      result = result.filter(
        (p) =>
          (p.discount && p.discount > 0) ||
          (p.originalPrice && p.originalPrice > p.price),
      );
    }

    switch (filters.sortBy) {
      case "price-asc":
        result.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
        break;
      case "price-desc":
        result.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
        break;
      case "rating-desc":
        result.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
      case "discount-desc": {
        const getDiscount = (p: Product) =>
          p.discount ??
          (p.originalPrice
            ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100)
            : 0);
        result.sort((a, b) => getDiscount(b) - getDiscount(a));
        break;
      }
      case "reviews-desc":
        result.sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
        break;
    }

    return result;
  }, [products, filters.sortBy, filters.hasDiscount]);

  const prices = filteredProducts.map((p) => p.price).filter(Boolean);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;


  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Loading banner */}
        <div className="glass-card rounded-2xl border border-primary/20 p-5">
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
              <div className="absolute -inset-1 rounded-2xl border border-primary/20 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-foreground">
                  Searching marketplaces…
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Searching Shopee, Lazada, JD Central, Big C and more for{" "}
                <span className="text-foreground font-medium">"{query}"</span>
              </p>
              {/* Animated progress */}
              <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"
                  style={{
                    width: "60%",
                    animation: "loading-bar 2s ease-in-out infinite",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Skeleton marketplace cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="glass-card rounded-2xl border border-border/30 p-4 space-y-3"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="skeleton h-6 w-20 rounded-full" />
              <div className="skeleton h-8 w-12 rounded-lg" />
              <div className="space-y-1.5">
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-3/4 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>

        {/* Skeleton cards grid */}
        <div
          className={cn(
            "grid gap-4",
            filters.viewMode === "grid"
              ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              : "grid-cols-1",
          )}
        >
          {SKELETONS.map((_, i) => (
            <ProductCardSkeleton
              key={i}
              viewMode={
                filters.viewMode === "compare" ? "grid" : filters.viewMode
              }
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!isLoading && products.length === 0) {
    return <EmptyState query={query || undefined} />;
  }

  // ── Results ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Main products section with tabs */}
      <Tabs defaultValue="grid" className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TabsList className="h-9">
              <TabsTrigger value="grid" className="gap-1.5 text-xs px-3">
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                  <rect
                    x="0"
                    y="0"
                    width="7"
                    height="7"
                    rx="1.5"
                    fill="currentColor"
                    opacity="0.7"
                  />
                  <rect
                    x="9"
                    y="0"
                    width="7"
                    height="7"
                    rx="1.5"
                    fill="currentColor"
                    opacity="0.7"
                  />
                  <rect
                    x="0"
                    y="9"
                    width="7"
                    height="7"
                    rx="1.5"
                    fill="currentColor"
                    opacity="0.7"
                  />
                  <rect
                    x="9"
                    y="9"
                    width="7"
                    height="7"
                    rx="1.5"
                    fill="currentColor"
                    opacity="0.7"
                  />
                </svg>
                Grid
              </TabsTrigger>
              <TabsTrigger value="list" className="gap-1.5 text-xs px-3">
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                  <rect
                    x="0"
                    y="1"
                    width="16"
                    height="3"
                    rx="1.5"
                    fill="currentColor"
                    opacity="0.7"
                  />
                  <rect
                    x="0"
                    y="6.5"
                    width="16"
                    height="3"
                    rx="1.5"
                    fill="currentColor"
                    opacity="0.7"
                  />
                  <rect
                    x="0"
                    y="12"
                    width="16"
                    height="3"
                    rx="1.5"
                    fill="currentColor"
                    opacity="0.7"
                  />
                </svg>
                List
              </TabsTrigger>
              <TabsTrigger value="table" className="gap-1.5 text-xs px-3">
                <BarChart2 className="w-3.5 h-3.5" />
                Compare
              </TabsTrigger>
            </TabsList>
          </div>

          <p className="text-xs text-muted-foreground">
            Showing{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {filteredProducts.length}
            </span>{" "}
            of <span className="tabular-nums">{products.length}</span> products
          </p>
        </div>

        {/* Grid view */}
        <TabsContent value="grid">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map((product, i) => (
              <ProductCard
                key={product.id}
                product={product}
                minPrice={minPrice}
                maxPrice={maxPrice}
                index={i}
                viewMode="grid"
              />
            ))}
          </div>
        </TabsContent>

        {/* List view */}
        <TabsContent value="list">
          <div className="flex flex-col gap-3">
            {filteredProducts.map((product, i) => (
              <ProductCard
                key={product.id}
                product={product}
                minPrice={minPrice}
                maxPrice={maxPrice}
                index={i}
                viewMode="list"
              />
            ))}
          </div>
        </TabsContent>

        {/* Table / Compare view */}
        <TabsContent value="table">
          <ComparisonTable
            products={filteredProducts}
            minPrice={minPrice}
            maxPrice={maxPrice}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
