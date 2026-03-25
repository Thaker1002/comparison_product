import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  X,
  LayoutGrid,
  List,
  ArrowUpDown,
  ChevronDown,
  Check,
  Filter,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  SearchFilters,
  MarketplaceId,
  SortOption,
  ViewMode,
} from "@/types";

const MARKETPLACES: {
  id: MarketplaceId;
  name: string;
  emoji: string;
  color: string;
}[] = [
  {
    id: "shopee",
    name: "Shopee",
    emoji: "🟠",
    color: "marketplace-tag-shopee",
  },
  {
    id: "lazada",
    name: "Lazada",
    emoji: "🔵",
    color: "marketplace-tag-lazada",
  },
  {
    id: "jdcentral",
    name: "JD Central",
    emoji: "🔴",
    color: "marketplace-tag-jdcentral",
  },
  { id: "bigc", name: "Big C", emoji: "🟡", color: "marketplace-tag-bigc" },
  {
    id: "central",
    name: "Central",
    emoji: "🏬",
    color: "marketplace-tag-central",
  },
  { id: "makro", name: "Makro", emoji: "🏪", color: "marketplace-tag-makro" },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "rating-desc", label: "Highest Rated" },
  { value: "discount-desc", label: "Biggest Discount" },
  { value: "reviews-desc", label: "Most Reviewed" },
  { value: "relevance", label: "Relevance" },
];

interface SearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
  filters: SearchFilters;
  onFiltersChange: (f: Partial<SearchFilters>) => void;
  isLoading?: boolean;
  resultCount?: number;
  className?: string;
  hasImage?: boolean;
}

// Voice search hook
function useVoiceSearch({ onResult, lang }: { onResult: (text: string) => void; lang: string }) {
  const recognitionRef = useRef<any>(null);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.lang = lang;
    recognitionRef.current.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
      setListening(false);
    };
    recognitionRef.current.onerror = () => setListening(false);
    recognitionRef.current.onend = () => setListening(false);
    // eslint-disable-next-line
  }, [lang]);

  const 
  start = () => {
    if (recognitionRef.current) {
      setListening(true);
      recognitionRef.current.start();
    }
  };
  const stop = () => {
    if (recognitionRef.current) {
      setListening(false);
      recognitionRef.current.stop();
    }
  };
  return { start, stop, listening };
}

export function SearchBar({
  query,
  onQueryChange,
  onSearch,
  filters,
  onFiltersChange,
  isLoading = false,
  resultCount,
  className,
  hasImage = false,
}: SearchBarProps) {
  const { t, i18n } = useTranslation();
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lang = (i18n.language || 'en').toLowerCase();
  const { start: startVoice, stop: stopVoice, listening } = useVoiceSearch({
    onResult: (text) => onQueryChange(text),
    lang,
  });
  const sortRef = useRef<HTMLDivElement>(null);
  // Fix: define allSelected
  const allSelected = filters.marketplaces && filters.marketplaces.length === MARKETPLACES.length;
  const activeMarketplaceCount = filters.marketplaces ? filters.marketplaces.length : 0;
  const currentSort = SORT_OPTIONS.find(opt => opt.value === filters.sortBy) || SORT_OPTIONS[0];

  // Close sort dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSort(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const toggleMarketplace = (id: MarketplaceId) => {
    const current = filters.marketplaces;
    const updated = current.includes(id) ? current.filter(m => m !== id) : [...current, id];
    onFiltersChange({ marketplaces: updated });
  };

  const toggleAllMarketplaces = () => {
    if (allSelected) {
      onFiltersChange({ marketplaces: [] });
    } else {
      onFiltersChange({ marketplaces: MARKETPLACES.map(m => m.id) });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && (query.trim().length >= 2 || hasImage)) onSearch();
    if (e.key === "Escape") {
      onQueryChange("");
      inputRef.current?.blur();
    }
  };
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex gap-2">
        {/* Search input */}
        <div className="relative flex-1 group">
          {/* Animated glow ring */}
          <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-indigo-500/0 via-purple-500/0 to-pink-500/0 group-focus-within:from-indigo-500/40 group-focus-within:via-purple-500/40 group-focus-within:to-pink-500/40 transition-all duration-500 rounded-2xl blur-sm pointer-events-none" />

          <div className="relative flex items-center bg-secondary/80 border border-border/60 rounded-2xl overflow-hidden transition-all duration-200 group-focus-within:border-primary/50 group-focus-within:bg-secondary">
            {/* Search icon */}
            <div className="pl-4 pr-2 shrink-0">
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              ) : (
                <Search className="w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors duration-200" />
              )}
            </div>

            {/* Input */}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('searchBar.placeholder2')}
              className={cn(
                "flex-1 bg-transparent py-3.5 pr-2 text-sm text-foreground",
                "placeholder:text-muted-foreground/50",
                "focus:outline-none",
                "min-w-0",
              )}
              disabled={isLoading}
              autoComplete="off"
              spellCheck={false}
            />

            {/* Clear button */}
            {query && (
              <button
                onClick={() => {
                  onQueryChange("");
                  inputRef.current?.focus();
                }}
                className="px-2 text-muted-foreground hover:text-foreground transition-colors duration-200"
                aria-label={t('searchBar.clearSearch')}
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Mic button */}
            <button
              type="button"
              onClick={listening ? stopVoice : startVoice}
              className={cn(
                "px-2 border-l border-border/40 ml-1 text-muted-foreground hover:text-primary transition-colors duration-200",
                listening && "text-primary animate-pulse",
              )}
              aria-label={listening ? t('searchBar.stopVoice') : t('searchBar.startVoice')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a1 1 0 1 1 2 0 7 7 0 0 1-6 6.92V21a1 1 0 1 1-2 0v-2.08A7 7 0 0 1 5 12a1 1 0 1 1 2 0 5 5 0 0 0 10 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search button */}
        <Button
          variant="gradient"
          size="lg"
          onClick={onSearch}
          disabled={isLoading || (query.trim().length < 2 && !hasImage)}
          loading={isLoading}
          className="rounded-2xl px-6 shrink-0 gap-2"
        >
          {!isLoading && <Search className="w-4 h-4" />}
          <span className="hidden sm:inline">
            {isLoading ? t('searchBar.searching') : t('searchBar.search')}
          </span>
        </Button>
      </div>

      {/* ── Controls row ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Left: Filter toggle + marketplace pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              "gap-1.5 text-xs rounded-xl h-8",
              showFilters && "border-primary/50 text-primary bg-primary/5",
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            {t('searchBar.filters')}
            {!allSelected && (
              <Badge
                variant="default"
                className="ml-0.5 h-4 w-4 p-0 text-[9px] flex items-center justify-center rounded-full"
              >
                {MARKETPLACES.length - activeMarketplaceCount}
              </Badge>
            )}
          </Button>

          {/* Active marketplace chips */}
          <div className="flex items-center gap-1 flex-wrap">
            {MARKETPLACES.filter((m) =>
              filters.marketplaces.includes(m.id),
            ).map((m) => (
              <button
                key={m.id}
                onClick={() => toggleMarketplace(m.id)}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold",
                  "transition-all duration-150 hover:opacity-80",
                  "border marketplace-pill",
                  m.color,
                )}
              >
                <span className="text-[10px]">{m.emoji}</span>
                {m.name}
                <X className="w-2.5 h-2.5 opacity-60 hover:opacity-100" />
              </button>
            ))}
          </div>

          {/* Results count */}
          {resultCount != null && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/60 border border-border/40 text-[11px] text-muted-foreground animate-fade-in">
              <Sparkles className="w-3 h-3 text-primary" />
              <span className="font-semibold text-foreground tabular-nums">
                {resultCount}
              </span>
              <span>{t('searchBar.results')}</span>
            </div>
          )}
        </div>

        {/* Right: Sort + View mode */}
        <div className="flex items-center gap-1.5">
          {/* Sort dropdown */}
          <div className="relative" ref={sortRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSort((v) => !v)}
              className={cn(
                "gap-1.5 text-xs rounded-xl h-8",
                showSort && "border-primary/50 text-primary bg-primary/5",
              )}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {t(`searchBar.sortOptions.${currentSort?.value}`) ?? t('searchBar.sort')}
              </span>
              <span className="sm:hidden">{t('searchBar.sort')}</span>
              <ChevronDown
                className={cn(
                  "w-3 h-3 transition-transform duration-200",
                  showSort && "rotate-180",
                )}
              />
            </Button>

            {showSort && (
              <div className="absolute right-0 top-full mt-1.5 z-50 w-48 rounded-xl border border-border bg-popover shadow-xl shadow-black/20 overflow-hidden animate-fade-in-scale">
                <div className="p-1 space-y-0.5">
                  <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {t('searchBar.sortBy')}
                  </p>
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        onFiltersChange({ sortBy: opt.value });
                        setShowSort(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm",
                        "transition-colors duration-100",
                        filters.sortBy === opt.value
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-secondary/80 text-foreground",
                      )}
                    >
                      {t(`searchBar.sortOptions.${opt.value}`)}
                      {filters.sortBy === opt.value && (
                        <Check className="w-3.5 h-3.5" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-secondary/60 border border-border/40">
            {(["grid", "list"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => onFiltersChange({ viewMode: mode })}
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-200",
                  filters.viewMode === mode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-label={`${mode} view`}
              >
                {mode === "grid" ? (
                  <LayoutGrid className="w-3.5 h-3.5" />
                ) : (
                  <List className="w-3.5 h-3.5" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Expanded filters panel ───────────────────────────────────────────── */}
      {showFilters && (
        <div className="glass-card rounded-2xl border border-border/50 p-4 animate-fade-in space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">{t('searchBar.advancedFilters')}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(false)}
              className="h-7 text-xs text-muted-foreground"
            >
              <X className="w-3.5 h-3.5 mr-1" />
                {t('searchBar.close')}
            </Button>
          </div>

          {/* Marketplaces */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t('searchBar.marketplaces')}
              </p>
              <button
                onClick={toggleAllMarketplaces}
                className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
              >
                {allSelected ? t('searchBar.deselectAll') : t('searchBar.selectAll')}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {MARKETPLACES.map((m) => {
                const active = filters.marketplaces.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleMarketplace(m.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold",
                      "border transition-all duration-200",
                      active
                        ? cn("shadow-sm", m.color)
                        : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground bg-secondary/30",
                    )}
                  >
                    {m.emoji} {m.name}
                    {active && <Check className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Additional filter options */}
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div
                onClick={() =>
                  onFiltersChange({ hasDiscount: !filters.hasDiscount })
                }
                className={cn(
                  "w-8 h-4 rounded-full transition-all duration-200 relative",
                  filters.hasDiscount
                    ? "bg-primary"
                    : "bg-secondary border border-border",
                )}
              >
                <div
                  className={cn(
                    "absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-200",
                    filters.hasDiscount ? "left-4" : "left-0.5",
                  )}
                />
              </div>
              <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                {t('searchBar.discountedOnly')}
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchBar;
