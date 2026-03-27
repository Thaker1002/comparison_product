import React, { useState, useRef, ChangeEvent, useEffect } from "react";
import axios from "axios";
import SearchBar from "./components/SearchBar";
import TaxiTab from "./components/TaxiTab";
import FlightTab from "./components/FlightTab";
import { ResultsGrid } from "./components/ResultsGrid";
import AuthModal from "./components/AuthModal";
import AdminDashboard from "./components/AdminDashboard";
import { useTranslation } from 'react-i18next';
import i18n from './i18n';
import { searchProducts } from './lib/api';
import type { Product, MarketplaceSummary, SearchFilters } from './types';
import { DEFAULT_FILTERS } from './types';
import type { Product as ApiProduct, MarketplaceSummary as ApiSummary } from './lib/api';

interface AuthUser {
  id: number; name: string; email: string; mobile: string; notify_via: string; isAdmin?: boolean;
}

const COUNTRIES = [
  { code: "TH", name: "Thailand", flag: "🇹🇭" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩" },
  { code: "PH", name: "Philippines", flag: "🇵🇭" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾" },
  { code: "SG", name: "Singapore", flag: "🇸🇬" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "AE", name: "UAE / Dubai", flag: "🇦🇪" },
  { code: "US", name: "USA", flag: "🇺🇸" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
];
const LANGUAGES = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "th", name: "ไทย", flag: "🇹🇭" },
  { code: "id", name: "Bahasa", flag: "🇮🇩" },
  { code: "tl", name: "Tagalog", flag: "🇵🇭" },
  { code: "hi", name: "हिन्दी", flag: "🇮🇳" },
  { code: "ta", name: "தமிழ்", flag: "🇮🇳" },
  { code: "ar", name: "العربية", flag: "🇦🇪" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
];
const CATEGORIES = [
  { id: "purchase", label: "Purchase", icon: "🛒" },
  { id: "ride", label: "Ride", icon: "🚕" },
  { id: "flights", label: "Flights", icon: "✈️", comingSoon: false },
];

const COUNTRY_DEFAULT_LANGUAGE: Record<string, string> = {
  TH: "th", ID: "id", PH: "tl", MY: "en",
  SG: "en", IN: "hi", AE: "ar", US: "en", CA: "en",
};

export default function App() {
  const [activeCategory, setActiveCategory] = useState("purchase");
  const [country, setCountry] = useState("TH");
  const [language, setLanguage] = useState("en");
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [query, setQuery] = useState("");

  // ─── Auth ─────────────────────────────────────────────────────────────────
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    try { return JSON.parse(localStorage.getItem("authUser") || "null"); } catch { return null; }
  });
  const [authToken, setAuthToken] = useState<string>(() => localStorage.getItem("authToken") || "");
  const [showAdmin, setShowAdmin] = useState(false);

  function handleAuth(user: AuthUser, token: string) {
    setAuthUser(user);
    setAuthToken(token);
    localStorage.setItem("authUser", JSON.stringify(user));
    localStorage.setItem("authToken", token);
  }
  function handleLogout() {
    setAuthUser(null);
    setAuthToken("");
    localStorage.removeItem("authUser");
    localStorage.removeItem("authToken");
  }
  function trackUsage(event_type: string, q: string, results_count: number) {
    if (!authToken) return;
    axios.post("/api/auth/track", { event_type, query: q, country, results_count }, {
      headers: { Authorization: `Bearer ${authToken}` },
    }).catch(() => {});
  }
  const [isLoading, setIsLoading] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [summaries, setSummaries] = useState<ApiSummary[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchTimestamp, setSearchTimestamp] = useState<string | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const { t } = useTranslation();

  // Auto-detect country & language from device GPS on first load
  useEffect(() => {
    if (!navigator.geolocation) return;
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}`,
            { headers: { "Accept-Language": "en" } }
          );
          const data = await res.json();
          const cc = (data?.address?.country_code as string | undefined)?.toUpperCase();
          const supported = COUNTRIES.find(c => c.code === cc);
          if (supported) {
            setCountry(supported.code);
            const lang = COUNTRY_DEFAULT_LANGUAGE[supported.code] ?? "en";
            setLanguage(lang);
            i18n.changeLanguage(lang);
          }
          setGeoStatus("done");
        } catch {
          setGeoStatus("error");
        }
      },
      () => setGeoStatus("error"),
      { timeout: 8000 }
    );
  }, []);

  async function handleSearch() {
    if (query.trim().length < 2 && !imagePreview) return;
    setIsLoading(true);
    setSearchError(null);
    try {
      const result = await searchProducts({
        query: query.trim(),
        marketplaces: filters.marketplaces.length > 0 ? filters.marketplaces : undefined,
        searchMode: filters.searchMode,
        image: imagePreview ?? undefined,
      });
      setProducts(result.products);
      setSummaries(result.summary);
      setSearchTimestamp(result.timestamp);
      trackUsage(imagePreview ? "image_search" : "search", query.trim(), result.products.length);
    } catch (err: any) {
      setSearchError(err?.response?.data?.error ?? err?.message ?? 'Search failed. Is the backend running?');
      setProducts([]);
      setSummaries([]);
    } finally {
      setIsLoading(false);
    }
  }
  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageSelect(e.dataTransfer.files[0]);
    }
  }
  function handleImageSelect(file: File) {
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target && typeof e.target.result === "string") {
        setImagePreview(e.target.result);
      }
    };
    reader.readAsDataURL(file);
  }
  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="min-h-screen bg-[#181728]">
      {/* Auth gate */}
      {!authUser && <AuthModal onAuth={handleAuth} />}
      {/* Admin dashboard overlay */}
      {showAdmin && <AdminDashboard onClose={() => setShowAdmin(false)} />}

      <div className="max-w-6xl mx-auto px-4 pt-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 shadow-lg shadow-blue-500/40">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth={1.8} fill="white" fillOpacity={0.25} />
                <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth={1.8} fill="white" fillOpacity={0.25} />
                <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth={1.8} fill="white" fillOpacity={0.25} />
                <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth={1.8} fill="white" fillOpacity={0.25} />
              </svg>
            </span>
            <div>
              <h1 className="text-2xl font-bold text-white">{t('appTitle')}</h1>
              <p className="text-xs text-indigo-200">{t('subtitle')}</p>
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            {geoStatus === "loading" && (
              <span title="Detecting location…" className="text-indigo-300 text-xs flex items-center gap-1">
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                Locating…
              </span>
            )}
            {geoStatus === "done" && (
              <span title="Location detected" className="text-green-400 text-xs">📍</span>
            )}
            <select value={country} onChange={e => setCountry(e.target.value)} className="rounded px-2 py-1">
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
            </select>
            <select value={language} onChange={e => { setLanguage(e.target.value); i18n.changeLanguage(e.target.value); }} className="rounded px-2 py-1">
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
            </select>
            {/* User info */}
            {authUser && (
              <div className="flex items-center gap-2 ml-1">
                <span className="text-xs text-indigo-200 hidden sm:block">👋 {authUser.name}</span>
                {authUser.isAdmin && (
                  <button onClick={() => setShowAdmin(true)} className="text-xs bg-yellow-400 text-yellow-900 font-semibold px-2 py-1 rounded-lg hover:bg-yellow-300">
                    Admin
                  </button>
                )}
                <button onClick={handleLogout} className="text-xs text-indigo-300 hover:text-white border border-indigo-700 px-2 py-1 rounded-lg">
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-t-lg font-medium ${activeCategory === cat.id ? "bg-white text-indigo-700" : "bg-indigo-900 text-white"}`}
              disabled={cat.comingSoon}
            >
              {t(cat.id)}
              {cat.comingSoon && <span className="ml-2 text-xs bg-yellow-300 text-yellow-900 px-2 py-0.5 rounded">Soon</span>}
            </button>
          ))}
        </div>
        {/* Main Content */}
        <div className="bg-white rounded-xl shadow p-6 min-h-[400px]">
          {activeCategory === "purchase" && (
            <>
              {/* Image upload row — compact, sits above search bar */}
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="flex items-center gap-3 flex-1 rounded-xl border-2 border-dashed px-4 py-2 cursor-pointer transition-all text-sm
                    border-gray-200 hover:border-indigo-300 bg-gray-50/50 hover:bg-indigo-50/30"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleDrop}
                >
                  {imagePreview ? (
                    <>
                      <img src={imagePreview} alt="Preview" className="h-9 w-9 rounded-lg object-cover ring-2 ring-indigo-200 shrink-0" />
                      <span className="text-gray-700 font-medium truncate flex-1">{imageFile?.name}</span>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); clearImage(); }}
                        className="text-red-400 hover:text-red-600 shrink-0 p-1"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-gray-400">Upload a product photo (optional) — drag & drop or <span className="text-indigo-600 font-medium">browse</span></span>
                    </>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e: ChangeEvent<HTMLInputElement>) => { if (e.target.files?.[0]) handleImageSelect(e.target.files[0]); }} />
                {imagePreview && (
                  <button
                    type="button"
                    onClick={handleSearch}
                    disabled={isLoading}
                    className="shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold"
                  >
                    {isLoading ? "Searching…" : "Search"}
                  </button>
                )}
              </div>

              <SearchBar
                query={query}
                onQueryChange={setQuery}
                onSearch={handleSearch}
                filters={filters}
                onFiltersChange={(partial) => setFilters(prev => ({ ...prev, ...partial }))}
                isLoading={isLoading}
                resultCount={products.length > 0 ? products.length : undefined}
                hasImage={!!imagePreview}
              />
              {/* Error */}
              {searchError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {searchError}
                </div>
              )}
              {/* Results */}
              {(products.length > 0 || isLoading) && (
                <div className="mt-4">
                  <ResultsGrid
                    products={products as unknown as Product[]}
                    summaries={summaries as unknown as MarketplaceSummary[]}
                    query={query}
                    isLoading={isLoading}
                    filters={filters}
                    timestamp={searchTimestamp}
                  />
                </div>
              )}
            </>
          )}
          {activeCategory === "ride" && (
            <TaxiTab country={country} countryName={COUNTRIES.find(c => c.code === country)?.name || "Thailand"} countryFlag={COUNTRIES.find(c => c.code === country)?.flag || "🇹🇭"} language={language} />
          )}
          {activeCategory === "flights" && (
            <div className="py-4">
              <FlightTab />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}