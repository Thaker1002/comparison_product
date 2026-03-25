import axios from "axios";
import type { Country, SearchResponse, Marketplace, SearchParams } from "../types";

// ─── Configuration ───────────────────────────────────────────────────────────
// When running locally with Expo, the device/emulator needs to reach the
// backend. On Android emulator use 10.0.2.2; on iOS simulator / physical
// device use your machine's LAN IP. Change this to your production URL
// once deployed.

const API_BASE = __DEV__
  ? "http://10.0.2.2:3001"  // Android emulator → host machine
  : "https://your-production-api.com"; // Production URL

// For iOS simulator or physical device on same LAN, override:
// const API_BASE = "http://192.168.1.170:3001";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 120_000,
  headers: { "Content-Type": "application/json" },
});

// ─── Country / Marketplace APIs ──────────────────────────────────────────────

export async function fetchCountries(): Promise<Country[]> {
  const { data } = await api.get<Country[]>("/api/countries");
  return data;
}

export async function fetchCountry(code: string): Promise<Country> {
  const { data } = await api.get<Country>(`/api/countries/${code}`);
  return data;
}

export async function fetchMarketplaces(countryCode: string): Promise<Marketplace[]> {
  const { data } = await api.get<Marketplace[]>("/api/marketplaces", {
    params: { country: countryCode },
  });
  return data;
}

// ─── Search API ──────────────────────────────────────────────────────────────

export async function searchProducts(params: SearchParams): Promise<SearchResponse> {
  const formData = new FormData();
  formData.append("query", params.query);
  formData.append("country", params.country);

  if (params.marketplaces && params.marketplaces.length > 0) {
    params.marketplaces.forEach((m) => formData.append("marketplaces", m));
  }

  if (params.searchMode) {
    formData.append("searchMode", params.searchMode);
  }

  const { data } = await api.post<SearchResponse>("/api/search", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return data;
}

// ─── Health Check ────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<boolean> {
  try {
    const { data } = await api.get("/health");
    return data?.status === "ok";
  } catch {
    return false;
  }
}

export { api };
