import React, { useState, useRef, ChangeEvent } from "react";
import SearchBar from "./components/SearchBar";
import TaxiTab from "./components/TaxiTab";
import { useTranslation } from 'react-i18next';
import i18n from './i18n';

const COUNTRIES = [
  { code: "TH", name: "Thailand", flag: "🇹🇭" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩" },
  { code: "PH", name: "Philippines", flag: "🇵🇭" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾" },
  { code: "SG", name: "Singapore", flag: "🇸🇬" },
];
const LANGUAGES = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "th", name: "ไทย", flag: "🇹🇭" },
  { code: "id", name: "Bahasa", flag: "🇮🇩" },
  { code: "tl", name: "Tagalog", flag: "🇵🇭" },
];
const CATEGORIES = [
  { id: "purchase", label: "Products", icon: "🛒" },
  { id: "taxi", label: "Taxi", icon: "🚕" },
  { id: "flights", label: "Flights", icon: "✈️", comingSoon: true },
];

export default function App() {
  const [activeCategory, setActiveCategory] = useState("purchase");
  const [country, setCountry] = useState("TH");
  const [language, setLanguage] = useState("en");
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const { t } = useTranslation();

  function handleSearch() {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
    }, 1000);
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
      <div className="max-w-6xl mx-auto px-4 pt-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-indigo-600">
              <span className="text-2xl">🛒</span>
            </span>
            <div>
              <h1 className="text-2xl font-bold text-white">{t('appTitle')}</h1>
              <p className="text-xs text-indigo-200">Multi-country ride & product comparison</p>
            </div>
          </div>
          <div className="flex gap-2">
            <select value={country} onChange={e => setCountry(e.target.value)} className="rounded px-2 py-1">
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
            </select>
            <select value={language} onChange={e => { setLanguage(e.target.value); i18n.changeLanguage(e.target.value); }} className="rounded px-2 py-1">
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
            </select>
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
              <span className="mr-2">{cat.icon}</span>{t(cat.id)}
              {cat.comingSoon && <span className="ml-2 text-xs bg-yellow-300 text-yellow-900 px-2 py-0.5 rounded">Soon</span>}
            </button>
          ))}
        </div>
        {/* Main Content */}
        <div className="bg-white rounded-xl shadow p-6 min-h-[400px]">
          {activeCategory === "purchase" && (
            <>
              <SearchBar
                query={query}
                onQueryChange={setQuery}
                onSearch={handleSearch}
                filters={{ marketplaces: [], priceRange: null, minRating: null, hasDiscount: false, inStock: false, sortBy: "price-asc", viewMode: "grid", searchMode: "scrape" }}
                onFiltersChange={() => {}}
                isLoading={isLoading}
              />
              <div className="mt-4">
                <div
                  className={`relative rounded-xl border-2 border-dashed p-5 text-center transition-all cursor-pointer ${imagePreview ? "border-indigo-300 bg-indigo-50/50" : "border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30 bg-gray-50/30"}`}
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => !imagePreview && fileInputRef.current?.click()}
                >
                  {imagePreview ? (
                    <div className="flex items-center gap-4">
                      <div className="relative group">
                        <img src={imagePreview || undefined} alt="Preview" className="h-20 w-20 rounded-lg object-cover shadow-sm ring-2 ring-indigo-200" />
                        <div className="absolute inset-0 rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </div>
                      </div>
                      <div className="text-left flex-1">
                        <p className="text-sm font-medium text-gray-700">{imageFile?.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{imageFile ? (imageFile.size / 1024 / 1024).toFixed(1) : ""} MB</p>
                      </div>
                      <button type="button" onClick={e => { e.stopPropagation(); clearImage(); }} className="rounded-lg bg-red-50 p-2 text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="mx-auto h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center mb-2">
                        <svg className="h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-500">Drag & drop a product photo, or <span className="text-indigo-600 font-medium">browse</span></p>
                      <p className="mt-1 text-xs text-gray-400">JPG, PNG, WebP — max 10 MB</p>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e: ChangeEvent<HTMLInputElement>) => { if (e.target.files?.[0]) handleImageSelect(e.target.files[0]); }} />
                </div>
              </div>
              {/* Results, errors, etc. would go here */}
            </>
          )}
          {activeCategory === "taxi" && (
            <TaxiTab country={country} countryName={COUNTRIES.find(c => c.code === country)?.name || "Thailand"} countryFlag={COUNTRIES.find(c => c.code === country)?.flag || "🇹🇭"} language={language} />
          )}
          {activeCategory === "flights" && (
            <div className="py-8 text-center">
              <div className="mb-6">
                <p className="text-sm text-gray-500">{COUNTRIES.find(c => c.code === country)?.flag} Compare flight prices across airlines and booking platforms</p>
              </div>
              <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/50 p-8 text-center">
                <div className="mx-auto h-14 w-14 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                  <span className="text-2xl">✈️</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-800 mb-1">Flights — Coming Soon</h3>
                <p className="text-sm text-gray-500 max-w-md mx-auto">Compare flights across Google Flights, Skyscanner, Kayak, Expedia and more. Search by origin, destination and dates to find the cheapest fares.</p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {["Google Flights", "Skyscanner", "Kayak", "Expedia", "Momondo", "Kiwi.com"].map(app => (
                    <span key={app} className="rounded-full bg-white border border-gray-200 px-3 py-1 text-xs font-medium text-gray-500 shadow-sm">{app}</span>
                  ))}
                </div>
              </div>
              <footer className="mt-16 mb-8 text-center">
                <div className="inline-flex items-center gap-2 text-xs text-gray-400">
                  <span className="inline-block h-px w-8 bg-gray-200" />
                  compare by Thakers &middot; For personal use only
                  <span className="inline-block h-px w-8 bg-gray-200" />
                </div>
              </footer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}