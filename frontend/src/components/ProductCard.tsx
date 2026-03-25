import React, { useState, useMemo } from "react";
import {
  Star,
  StarHalf,
  ExternalLink,
  ShoppingCart,
  Heart,
  Share2,
  Package,
  Ruler,
  Tag,
  TrendingDown,
  Award,
  Eye,
  Copy,
  Check,
  Search,
} from "lucide-react";
import {
  cn,
  formatPrice,
  formatNumber,
  getRatingStars,
  getPriceTier,
  getPriceTierColor,
  getPriceTierLabel,
  getMarketplaceBgClass,
  copyToClipboard,
  openInNewTab,
} from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Product } from "@/types";
import {
  resolveSafeUrl,
  buildSearchFallback,
  isSearchFallbackUrl,
} from "@/lib/url-validation";

// ─── Star Rating ─────────────────────────────────────────────────────────────

function StarRating({
  rating,
  count,
}: {
  rating?: number | null;
  count?: number | null;
}) {
  if (!rating) return null;
  const { full, half, empty } = getRatingStars(rating);

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: full }).map((_, i) => (
          <Star
            key={`full-${i}`}
            className="w-3 h-3 fill-amber-400 text-amber-400"
          />
        ))}
        {half && <StarHalf className="w-3 h-3 fill-amber-400 text-amber-400" />}
        {Array.from({ length: empty }).map((_, i) => (
          <Star key={`empty-${i}`} className="w-3 h-3 text-slate-600" />
        ))}
      </div>
      <span className="text-[11px] text-amber-400 font-semibold tabular-nums">
        {rating.toFixed(1)}
      </span>
      {count != null && (
        <span className="text-[11px] text-muted-foreground">
          ({formatNumber(count)})
        </span>
      )}
    </div>
  );
}

// ─── Marketplace Badge ────────────────────────────────────────────────────────

function MarketplaceBadge({ product }: { product: Product }) {
  const bgClass = getMarketplaceBgClass(product.marketplace);
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold marketplace-pill",
        bgClass,
      )}
    >
      <span className="text-[10px]">
        {product.marketplace === "shopee" && "🟠"}
        {product.marketplace === "lazada" && "🔵"}
        {product.marketplace === "jdcentral" && "🔴"}
        {product.marketplace === "bigc" && "🟡"}
        {product.marketplace === "central" && "🏬"}
        {product.marketplace === "makro" && "🏪"}
      </span>
      {product.marketplaceName}
    </div>
  );
}

// ─── Price Tier Indicator ─────────────────────────────────────────────────────

function PriceTierBadge({ tier }: { tier: ReturnType<typeof getPriceTier> }) {
  const color = getPriceTierColor(tier);
  const label = getPriceTierLabel(tier);

  const bgMap: Record<string, string> = {
    "text-emerald-400": "bg-emerald-400/10 border-emerald-400/20",
    "text-green-400": "bg-green-400/10 border-green-400/20",
    "text-yellow-400": "bg-yellow-400/10 border-yellow-400/20",
    "text-red-400": "bg-red-400/10 border-red-400/20",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border",
        color,
        bgMap[color],
      )}
    >
      {tier === "best" && <Award className="w-2.5 h-2.5" />}
      {tier === "good" && <TrendingDown className="w-2.5 h-2.5" />}
      {label}
    </div>
  );
}

// ─── Product Image ────────────────────────────────────────────────────────────

function ProductImage({
  src,
  alt,
  marketplace,
}: {
  src?: string | null;
  alt: string;
  marketplace: string;
}) {
  const [imgError, setImgError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const colorMap: Record<string, string> = {
    shopee: "from-orange-500/10 to-red-500/10",
    lazada: "from-blue-600/10 to-indigo-600/10",
    jdcentral: "from-red-600/10 to-rose-600/10",
    bigc: "from-yellow-500/10 to-amber-500/10",
    central: "from-red-700/10 to-pink-700/10",
    makro: "from-blue-700/10 to-cyan-700/10",
  };

  const gradient = colorMap[marketplace] ?? "from-primary/10 to-accent/10";

  if (!src || imgError) {
    return (
      <div
        className={cn(
          "w-full h-full flex flex-col items-center justify-center gap-2",
          "bg-gradient-to-br",
          gradient,
        )}
      >
        <ShoppingCart className="w-10 h-10 text-muted-foreground/30" />
        <span className="text-[10px] text-muted-foreground/40 font-medium text-center px-2 line-clamp-2">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <>
      {!loaded && (
        <div className={cn("absolute inset-0 bg-gradient-to-br", gradient)}>
          <Skeleton className="w-full h-full rounded-none" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setImgError(true)}
        className={cn(
          "w-full h-full object-contain transition-all duration-500 p-2",
          loaded ? "opacity-100" : "opacity-0",
        )}
        loading="lazy"
      />
    </>
  );
}

// ─── Spec Tag ─────────────────────────────────────────────────────────────────

function SpecTag({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary/60 border border-border/40">
      <Icon className="w-3 h-3 text-muted-foreground shrink-0" />
      <span className="text-[10px] text-muted-foreground shrink-0">
        {label}:
      </span>
      <span className="text-[10px] text-foreground font-medium truncate">
        {value}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ProductCardProps {
  product: Product;
  minPrice?: number;
  maxPrice?: number;
  index?: number;
  isSelected?: boolean;
  onSelect?: (product: Product) => void;
  className?: string;
  viewMode?: "grid" | "list";
}

// ─── Known Thai marketplace domains ──────────────────────────────────────────
// ─── URL helpers are imported from @/lib/url-validation ──────────────────────
// (resolveSafeUrl, buildSearchFallback, isSearchFallbackUrl)
// The inline definitions have been removed to avoid duplication and to allow
// the logic to be unit-tested independently.

export function ProductCard({
  product,
  minPrice,
  maxPrice,
  index = 0,
  isSelected = false,
  onSelect,
  className,
  viewMode = "grid",
}: ProductCardProps) {
  const [isFaved, setIsFaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Resolve a safe, openable URL — never navigates to example.com or similar
  const safeUrl = useMemo(() => {
    const validated = resolveSafeUrl(product.url);
    if (validated) return validated;
    // Fallback: marketplace search for this product name
    console.warn(
      `[ProductCard] Blocked unsafe URL "${product.url}" — using search fallback`,
    );
    return buildSearchFallback(product.marketplaceDomain, product.name);
  }, [product.url, product.marketplaceDomain, product.name]);

  const priceTier =
    minPrice != null && maxPrice != null
      ? getPriceTier(product.price, minPrice, maxPrice)
      : null;

  const hasDiscount =
    product.originalPrice != null && product.originalPrice > product.price;

  // Detect if the URL is a search-results fallback (not a direct product page)
  const isSearchFallback = useMemo(
    () => isSearchFallbackUrl(safeUrl),
    [safeUrl],
  );

  const discountPct =
    hasDiscount && product.originalPrice
      ? Math.round(
          ((product.originalPrice - product.price) / product.originalPrice) *
            100,
        )
      : product.discount;

  const savings =
    hasDiscount && product.originalPrice
      ? product.originalPrice - product.price
      : null;

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await copyToClipboard(safeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    openInNewTab(safeUrl);
  };

  const handleFav = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFaved((v) => !v);
  };

  const handleSelect = () => {
    if (onSelect) {
      onSelect(product);
    } else {
      openInNewTab(safeUrl);
    }
  };

  // ── List View ───────────────────────────────────────────────────────────────
  if (viewMode === "list") {
    return (
      <div
        className={cn(
          "group glass-card rounded-2xl p-4 flex items-center gap-4 card-hover cursor-pointer",
          "border border-border/50 hover:border-primary/30",
          isSelected && "border-primary/60 bg-primary/5",
          className,
        )}
        style={{ animationDelay: `${index * 50}ms` }}
        onClick={handleSelect}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Image */}
        <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-secondary/50 border border-border/40">
          <ProductImage
            src={product.image}
            alt={product.name}
            marketplace={product.marketplace}
          />
          {priceTier === "best" && (
            <div className="absolute top-1 left-1">
              <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                <Award className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-1">
            <MarketplaceBadge product={product} />
            {product.badge && (
              <Badge variant="warning" className="text-[10px]">
                {product.badge}
              </Badge>
            )}
          </div>
          <p className="text-sm font-medium text-foreground line-clamp-2 mb-1.5">
            {product.name}
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <StarRating rating={product.rating} count={product.reviewCount} />
            {product.seller && (
              <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">
                by {product.seller}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {product.capacity && (
              <SpecTag icon={Ruler} label="Capacity" value={product.capacity} />
            )}
            {product.quantity && (
              <SpecTag icon={Package} label="Qty" value={product.quantity} />
            )}
            {product.brand && (
              <SpecTag icon={Tag} label="Brand" value={product.brand} />
            )}
          </div>
        </div>

        {/* Price */}
        <div className="text-right shrink-0">
          <div className="flex items-baseline gap-1 justify-end">
            {priceTier && <PriceTierBadge tier={priceTier} />}
          </div>
          <div className="text-xl font-bold text-foreground tabular-nums mt-1">
            {formatPrice(product.price)}
          </div>
          {hasDiscount && product.originalPrice && (
            <div className="flex items-center gap-1.5 justify-end mt-0.5">
              <span className="text-xs text-muted-foreground line-through tabular-nums">
                {formatPrice(product.originalPrice)}
              </span>
              {discountPct && (
                <span className="text-xs font-bold text-emerald-400">
                  -{discountPct}%
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-1 mt-2 justify-end">
            <Button size="icon-sm" variant="ghost" onClick={handleFav}>
              <Heart
                className={cn(
                  "w-3.5 h-3.5",
                  isFaved && "fill-red-400 text-red-400",
                )}
              />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={handleCopyLink}>
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </Button>
            <Button
              size="sm"
              variant={isSearchFallback ? "outline" : "gradient"}
              onClick={handleOpen}
              className="gap-1"
            >
              {isSearchFallback ? (
                <>
                  <Search className="w-3.5 h-3.5" />
                  Search
                </>
              ) : (
                <>
                  <ExternalLink className="w-3.5 h-3.5" />
                  View
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Grid View ───────────────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        "group relative glass-card rounded-2xl overflow-hidden card-hover cursor-pointer flex flex-col",
        "border border-border/50 hover:border-primary/30",
        "animate-fade-in",
        isSelected && "border-primary/60 ring-1 ring-primary/30 bg-primary/5",
        className,
      )}
      style={{ animationDelay: `${Math.min(index * 60, 600)}ms` }}
      onClick={handleSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── Image Section ───────────────────────────────────────────────────── */}
      <div className="relative h-48 bg-secondary/30 overflow-hidden shrink-0">
        <ProductImage
          src={product.image}
          alt={product.name}
          marketplace={product.marketplace}
        />

        {/* Gradient overlay on hover */}
        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent",
            "transition-opacity duration-300",
            isHovered ? "opacity-100" : "opacity-0",
          )}
        />

        {/* Top-left: Best price badge */}
        {priceTier === "best" && (
          <div className="absolute top-2.5 left-2.5 animate-bounce-in">
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold shadow-lg shadow-emerald-500/30">
              <Award className="w-3 h-3" />
              Best Price
            </div>
          </div>
        )}

        {/* Top-right: Action buttons (show on hover) */}
        <div
          className={cn(
            "absolute top-2.5 right-2.5 flex flex-col gap-1.5",
            "transition-all duration-300",
            isHovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4",
          )}
        >
          <button
            onClick={handleFav}
            className={cn(
              "w-7 h-7 rounded-lg glass border border-white/20 flex items-center justify-center",
              "transition-colors duration-200",
              isFaved ? "bg-red-500/30 border-red-400/30" : "hover:bg-white/20",
            )}
          >
            <Heart
              className={cn(
                "w-3.5 h-3.5 transition-colors duration-200",
                isFaved ? "fill-red-400 text-red-400" : "text-white",
              )}
            />
          </button>
          <button
            onClick={handleCopyLink}
            className="w-7 h-7 rounded-lg glass border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors duration-200"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Share2 className="w-3.5 h-3.5 text-white" />
            )}
          </button>
        </div>

        {/* Bottom: Discount badge */}
        {discountPct && discountPct > 0 && (
          <div className="absolute bottom-2.5 left-2.5">
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold shadow-lg">
              <TrendingDown className="w-2.5 h-2.5" />-{discountPct}% OFF
            </div>
          </div>
        )}

        {/* Special badge (Flash Sale, Official Store, etc.) */}
        {product.badge && (
          <div className="absolute bottom-2.5 right-2.5">
            <Badge variant="warning" className="text-[9px] py-0.5">
              {product.badge}
            </Badge>
          </div>
        )}

        {/* Quick view overlay */}
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 flex items-center justify-center pb-3",
            "transition-all duration-300",
            isHovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
          )}
        >
          <button
            onClick={handleOpen}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full glass-strong border border-white/20 text-white text-xs font-semibold hover:bg-white/20 transition-colors duration-200"
          >
            <Eye className="w-3.5 h-3.5" />
            Quick View
          </button>
        </div>
      </div>

      {/* ── Content Section ─────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 p-4 gap-3">
        {/* Marketplace + Price tier */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <MarketplaceBadge product={product} />
          {priceTier && priceTier !== "best" && (
            <PriceTierBadge tier={priceTier} />
          )}
        </div>

        {/* Product name */}
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug group-hover:text-primary/90 transition-colors duration-200">
            {product.name}
          </p>
          {product.brand && (
            <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
              {product.brand}
            </p>
          )}
        </div>

        {/* Specs row */}
        {(product.capacity || product.quantity) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {product.capacity && (
              <SpecTag icon={Ruler} label="Cap." value={product.capacity} />
            )}
            {product.quantity && (
              <SpecTag icon={Package} label="Qty" value={product.quantity} />
            )}
          </div>
        )}

        {/* Rating */}
        {product.rating != null && (
          <div className="flex items-center justify-between">
            <StarRating rating={product.rating} count={product.reviewCount} />
            {product.soldCount != null && (
              <span className="text-[10px] text-muted-foreground">
                {formatNumber(product.soldCount)} sold
              </span>
            )}
          </div>
        )}

        {/* Seller */}
        {product.seller && (
          <p className="text-[11px] text-muted-foreground truncate">
            <span className="text-muted-foreground/60">by</span>{" "}
            <span className="font-medium">{product.seller}</span>
          </p>
        )}

        {/* ── Price Section ──────────────────────────────────────────────── */}
        <div className="pt-3 border-t border-border/40 mt-auto">
          <div className="flex items-end justify-between gap-2">
            <div>
              {/* Current price */}
              <div className="flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "text-xl font-bold tabular-nums",
                    priceTier === "best"
                      ? "text-emerald-400"
                      : priceTier === "good"
                        ? "text-green-400"
                        : "text-foreground",
                  )}
                >
                  {formatPrice(product.price)}
                </span>
              </div>

              {/* Original price + savings */}
              {hasDiscount && product.originalPrice && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-muted-foreground line-through tabular-nums">
                    {formatPrice(product.originalPrice)}
                  </span>
                  {savings && (
                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">
                      save {formatPrice(savings)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* CTA button */}
            <Button
              size="sm"
              variant={isSearchFallback ? "outline" : "gradient"}
              onClick={handleOpen}
              className="gap-1.5 shrink-0 text-xs px-3"
            >
              {isSearchFallback ? (
                <>
                  <Search className="w-3.5 h-3.5" />
                  Search on Site
                </>
              ) : (
                <>
                  <ShoppingCart className="w-3.5 h-3.5" />
                  Buy Now
                </>
              )}
            </Button>
          </div>

          {/* Search fallback notice */}
          {isSearchFallback && (
            <p className="text-[10px] text-amber-400/80 mt-2 flex items-center gap-1">
              <span>⚠️</span>
              Opens marketplace search — no direct link available
            </p>
          )}

          {/* Location */}
          {product.location && (
            <p className="text-[10px] text-muted-foreground/60 mt-2 truncate">
              📍 {product.location}
            </p>
          )}
        </div>
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-2.5 left-2.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center animate-bounce-in">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}
    </div>
  );
}

// ─── Skeleton Card ────────────────────────────────────────────────────────────

export function ProductCardSkeleton({
  viewMode = "grid",
}: {
  viewMode?: "grid" | "list";
}) {
  if (viewMode === "list") {
    return (
      <div className="glass-card rounded-2xl p-4 flex items-center gap-4 border border-border/30">
        <Skeleton className="w-20 h-20 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-24 rounded-full" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16 rounded-lg" />
            <Skeleton className="h-6 w-16 rounded-lg" />
          </div>
        </div>
        <div className="text-right space-y-2 shrink-0">
          <Skeleton className="h-7 w-24 ml-auto" />
          <Skeleton className="h-4 w-16 ml-auto" />
          <Skeleton className="h-8 w-20 ml-auto rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl overflow-hidden border border-border/30 flex flex-col">
      <Skeleton className="h-48 rounded-none" />
      <div className="p-4 space-y-3 flex flex-col flex-1">
        <Skeleton className="h-5 w-24 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="flex gap-1.5">
          <Skeleton className="h-6 w-20 rounded-lg" />
          <Skeleton className="h-6 w-16 rounded-lg" />
        </div>
        <Skeleton className="h-4 w-32" />
        <div className="pt-3 border-t border-border/30 flex items-center justify-between mt-auto">
          <div className="space-y-1">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-8 w-20 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
