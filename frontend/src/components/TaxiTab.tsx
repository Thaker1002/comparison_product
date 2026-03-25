// Voice search hook for address fields
function useVoiceSearchAddress({ onResult, lang }: { onResult: (text: string) => void; lang: string }) {
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

  const start = () => {
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
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icons in Leaflet + bundlers
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const pickupIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  className: "pickup-marker",
});

const dropoffIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  className: "dropoff-marker",
});

L.Marker.prototype.options.icon = defaultIcon;

// ─── Types ────────────────────────────────────────────────────────────────────

interface LatLng { lat: number; lng: number }
interface GeoResult { display_name: string; lat: string; lon: string }

interface FarePricing {
  baseFare: number;
  perKm: number;
  perMin: number;
  currency: string;
  currencySymbol: string;
  minFare: number;
}

interface TaxiService {
  id: string;
  name: string;
  color: string;
  logo: string;
  type: "Car" | "Bike" | "Auto Rickshaw" | "Metered Taxi";
  deepLinkTemplate?: (pickup: LatLng, dropoff: LatLng) => string;
  webUrl?: string;
  pricing: FarePricing;
  isMetered?: boolean;
}

// Simple driver availability heuristic (rush hours: 7-10am, 5-9pm local time)
function getMeteredAvailability(): "Normal" | "Low" {
  const hour = new Date().getHours();
  if ((hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 21)) return "Low";
  return "Normal";
}

// ─── Country map defaults ─────────────────────────────────────────────────────

const COUNTRY_DEFAULTS: Record<string, { center: LatLng; zoom: number }> = {
  TH: { center: { lat: 13.7563, lng: 100.5018 }, zoom: 12 },
  IN: { center: { lat: 19.076, lng: 72.8777 }, zoom: 12 },
  US: { center: { lat: 40.7128, lng: -74.006 }, zoom: 12 },
  UK: { center: { lat: 51.5074, lng: -0.1278 }, zoom: 12 },
  SG: { center: { lat: 1.3521, lng: 103.8198 }, zoom: 12 },
  MY: { center: { lat: 3.139, lng: 101.6869 }, zoom: 12 },
  JP: { center: { lat: 35.6762, lng: 139.6503 }, zoom: 12 },
  AE: { center: { lat: 25.2048, lng: 55.2708 }, zoom: 12 },
  CA: { center: { lat: 43.6532, lng: -79.3832 }, zoom: 12 },  // Toronto
  TR: { center: { lat: 41.0082, lng: 28.9784 }, zoom: 12 },   // Istanbul
};

// ─── Taxi services + pricing per country ──────────────────────────────────────
// Pricing is approximate based on publicly available fare structures.
// Actual fares vary with surge, time of day, and route.

const TAXI_SERVICES: Record<string, TaxiService[]> = {
  TH: [
    // Metered Taxi (Bangkok)
    { id: "metered", name: "Metered Taxi (approx)", color: "#FFD700", logo: "🚕", type: "Metered Taxi", isMetered: true, pricing: { baseFare: 35, perKm: 5.5, perMin: 0, currency: "THB", currencySymbol: "฿", minFare: 35 } },
    { id: "grab", name: "Grab", color: "#00B14F", logo: "🟢", type: "Car", deepLinkTemplate: (p, d) => `https://grab.onelink.me/2695613898?af_dp=grab%3A%2F%2Fopen%3Flat%3D${p.lat}%26lng%3D${p.lng}%26destLat%3D${d.lat}%26destLng%3D${d.lng}`, webUrl: "https://www.grab.com", pricing: { baseFare: 25, perKm: 6.5, perMin: 1.5, currency: "THB", currencySymbol: "฿", minFare: 45 } },
    { id: "bolt", name: "Bolt", color: "#34D186", logo: "⚡", type: "Car", deepLinkTemplate: (p, d) => `https://m.bolt.eu/en/?pickup_lat=${p.lat}&pickup_lng=${p.lng}&destination_lat=${d.lat}&destination_lng=${d.lng}`, webUrl: "https://bolt.eu", pricing: { baseFare: 20, perKm: 5.5, perMin: 1.2, currency: "THB", currencySymbol: "฿", minFare: 40 } },
    { id: "lineman", name: "LINE MAN", color: "#00C300", logo: "🟩", type: "Car", deepLinkTemplate: () => `https://lineman.line.me`, webUrl: "https://lineman.line.me", pricing: { baseFare: 30, perKm: 7.0, perMin: 1.5, currency: "THB", currencySymbol: "฿", minFare: 50 } },
    { id: "indrive", name: "inDrive", color: "#B2FF59", logo: "🚗", type: "Car", deepLinkTemplate: () => `https://indrive.com`, webUrl: "https://indrive.com", pricing: { baseFare: 20, perKm: 5.0, perMin: 1.0, currency: "THB", currencySymbol: "฿", minFare: 35 } },
    { id: "cabb", name: "Cabb", color: "#FFD700", logo: "🚕", type: "Car", deepLinkTemplate: () => `https://cabb.go.th`, webUrl: "https://cabb.go.th", pricing: { baseFare: 35, perKm: 5.5, perMin: 2.0, currency: "THB", currencySymbol: "฿", minFare: 35 } },
  ],
  IN: [
    // Metered Taxi (Mumbai)
    { id: "metered", name: "Metered Taxi (approx)", color: "#FFD700", logo: "🚕", type: "Metered Taxi", isMetered: true, pricing: { baseFare: 28, perKm: 14, perMin: 0, currency: "INR", currencySymbol: "₹", minFare: 28 } },
    { id: "uber", name: "Uber", color: "#000000", logo: "⬛", type: "Car", deepLinkTemplate: (p, d) => `https://m.uber.com/ul/?pickup[latitude]=${p.lat}&pickup[longitude]=${p.lng}&dropoff[latitude]=${d.lat}&dropoff[longitude]=${d.lng}`, webUrl: "https://www.uber.com", pricing: { baseFare: 40, perKm: 12, perMin: 1.5, currency: "INR", currencySymbol: "₹", minFare: 60 } },
    { id: "ola", name: "Ola", color: "#1C8C37", logo: "🟢", type: "Car", deepLinkTemplate: () => `https://www.olacabs.com`, webUrl: "https://www.olacabs.com", pricing: { baseFare: 50, perKm: 11, perMin: 1.5, currency: "INR", currencySymbol: "₹", minFare: 70 } },
    { id: "rapido", name: "Rapido", color: "#FFCC00", logo: "🏍️", type: "Bike", deepLinkTemplate: () => `https://www.rapido.bike`, webUrl: "https://www.rapido.bike", pricing: { baseFare: 15, perKm: 5, perMin: 0.5, currency: "INR", currencySymbol: "₹", minFare: 25 } },
    { id: "indrive", name: "inDrive", color: "#B2FF59", logo: "🚗", type: "Car", deepLinkTemplate: () => `https://indrive.com`, webUrl: "https://indrive.com", pricing: { baseFare: 30, perKm: 10, perMin: 1.0, currency: "INR", currencySymbol: "₹", minFare: 50 } },
    { id: "bluSmart", name: "BluSmart", color: "#003366", logo: "🔵", type: "Car", deepLinkTemplate: () => `https://www.blusmart.in`, webUrl: "https://www.blusmart.in", pricing: { baseFare: 49, perKm: 14, perMin: 1.5, currency: "INR", currencySymbol: "₹", minFare: 85 } },
    { id: "namma_yatri", name: "Namma Yatri", color: "#FF6B00", logo: "🟠", type: "Auto Rickshaw", deepLinkTemplate: () => `https://nammayatri.in`, webUrl: "https://nammayatri.in", pricing: { baseFare: 30, perKm: 13, perMin: 1.5, currency: "INR", currencySymbol: "₹", minFare: 50 } },
  ],
  US: [
    // Metered Taxi (NYC)
    { id: "metered", name: "Metered Taxi (approx)", color: "#FFD700", logo: "🚕", type: "Metered Taxi", isMetered: true, pricing: { baseFare: 3.0, perKm: 2.0, perMin: 0.5, currency: "USD", currencySymbol: "$", minFare: 5 } },
    { id: "uber", name: "Uber", color: "#000000", logo: "⬛", type: "Car", deepLinkTemplate: (p, d) => `https://m.uber.com/ul/?pickup[latitude]=${p.lat}&pickup[longitude]=${p.lng}&dropoff[latitude]=${d.lat}&dropoff[longitude]=${d.lng}`, webUrl: "https://www.uber.com", pricing: { baseFare: 2.5, perKm: 1.2, perMin: 0.25, currency: "USD", currencySymbol: "$", minFare: 8 } },
    { id: "lyft", name: "Lyft", color: "#FF00BF", logo: "🟣", type: "Car", deepLinkTemplate: (p, d) => `https://www.lyft.com/ride?pickup[latitude]=${p.lat}&pickup[longitude]=${p.lng}&destination[latitude]=${d.lat}&destination[longitude]=${d.lng}`, webUrl: "https://www.lyft.com", pricing: { baseFare: 2.0, perKm: 1.1, perMin: 0.22, currency: "USD", currencySymbol: "$", minFare: 7.5 } },
  ],
  UK: [
    // Metered Taxi (London)
    { id: "metered", name: "Metered Taxi (approx)", color: "#FFD700", logo: "🚕", type: "Metered Taxi", isMetered: true, pricing: { baseFare: 3.2, perKm: 2.5, perMin: 0.6, currency: "GBP", currencySymbol: "£", minFare: 6 } },
    { id: "uber", name: "Uber", color: "#000000", logo: "⬛", type: "Car", deepLinkTemplate: (p, d) => `https://m.uber.com/ul/?pickup[latitude]=${p.lat}&pickup[longitude]=${p.lng}&dropoff[latitude]=${d.lat}&dropoff[longitude]=${d.lng}`, webUrl: "https://www.uber.com", pricing: { baseFare: 2.5, perKm: 1.25, perMin: 0.15, currency: "GBP", currencySymbol: "£", minFare: 6 } },
    { id: "bolt", name: "Bolt", color: "#34D186", logo: "⚡", type: "Car", deepLinkTemplate: (p, d) => `https://m.bolt.eu/en/?pickup_lat=${p.lat}&pickup_lng=${p.lng}&destination_lat=${d.lat}&destination_lng=${d.lng}`, webUrl: "https://bolt.eu", pricing: { baseFare: 2.0, perKm: 1.0, perMin: 0.12, currency: "GBP", currencySymbol: "£", minFare: 5 } },
    { id: "freenow", name: "FREE NOW", color: "#E31837", logo: "🔴", type: "Car", deepLinkTemplate: () => `https://www.free-now.com`, webUrl: "https://www.free-now.com", pricing: { baseFare: 2.8, perKm: 1.3, perMin: 0.2, currency: "GBP", currencySymbol: "£", minFare: 7 } },
  ],
  SG: [
    // Metered Taxi (Singapore)
    { id: "metered", name: "Metered Taxi (approx)", color: "#FFD700", logo: "🚕", type: "Metered Taxi", isMetered: true, pricing: { baseFare: 3.9, perKm: 0.7, perMin: 0.22, currency: "SGD", currencySymbol: "S$", minFare: 3.9 } },
    { id: "grab", name: "Grab", color: "#00B14F", logo: "🟢", type: "Car", deepLinkTemplate: (p, d) => `https://grab.onelink.me/2695613898?af_dp=grab%3A%2F%2Fopen%3Flat%3D${p.lat}%26lng%3D${p.lng}%26destLat%3D${d.lat}%26destLng%3D${d.lng}`, webUrl: "https://www.grab.com", pricing: { baseFare: 3.0, perKm: 0.6, perMin: 0.2, currency: "SGD", currencySymbol: "S$", minFare: 5 } },
    { id: "gojek", name: "Gojek", color: "#00AA13", logo: "🟩", type: "Car", deepLinkTemplate: () => `https://www.gojek.com`, webUrl: "https://www.gojek.com", pricing: { baseFare: 2.5, perKm: 0.55, perMin: 0.18, currency: "SGD", currencySymbol: "S$", minFare: 4.5 } },
    { id: "tada", name: "TADA", color: "#FF4444", logo: "🔴", type: "Car", deepLinkTemplate: () => `https://tada.global`, webUrl: "https://tada.global", pricing: { baseFare: 2.0, perKm: 0.5, perMin: 0.15, currency: "SGD", currencySymbol: "S$", minFare: 4 } },
  ],
  MY: [
    // Metered Taxi (Kuala Lumpur)
    { id: "metered", name: "Metered Taxi (approx)", color: "#FFD700", logo: "🚕", type: "Metered Taxi", isMetered: true, pricing: { baseFare: 3, perKm: 1.25, perMin: 0.2, currency: "MYR", currencySymbol: "RM", minFare: 3 } },
    { id: "grab", name: "Grab", color: "#00B14F", logo: "🟢", type: "Car", deepLinkTemplate: (p, d) => `https://grab.onelink.me/2695613898?af_dp=grab%3A%2F%2Fopen%3Flat%3D${p.lat}%26lng%3D${p.lng}%26destLat%3D${d.lat}%26destLng%3D${d.lng}`, webUrl: "https://www.grab.com", pricing: { baseFare: 1.5, perKm: 0.7, perMin: 0.15, currency: "MYR", currencySymbol: "RM", minFare: 5 } },
    { id: "maxim", name: "Maxim", color: "#FF6600", logo: "🟠", type: "Car", deepLinkTemplate: () => `https://taximaxim.com`, webUrl: "https://taximaxim.com", pricing: { baseFare: 1.0, perKm: 0.6, perMin: 0.12, currency: "MYR", currencySymbol: "RM", minFare: 4 } },
    { id: "indrive", name: "inDrive", color: "#B2FF59", logo: "🚗", type: "Car", deepLinkTemplate: () => `https://indrive.com`, webUrl: "https://indrive.com", pricing: { baseFare: 1.0, perKm: 0.55, perMin: 0.1, currency: "MYR", currencySymbol: "RM", minFare: 3.5 } },
  ],
  JP: [
    // Metered Taxi (Tokyo)
    { id: "metered", name: "Metered Taxi (approx)", color: "#FFD700", logo: "🚕", type: "Metered Taxi", isMetered: true, pricing: { baseFare: 420, perKm: 290, perMin: 65, currency: "JPY", currencySymbol: "¥", minFare: 420 } },
    { id: "uber", name: "Uber", color: "#000000", logo: "⬛", type: "Car", deepLinkTemplate: (p, d) => `https://m.uber.com/ul/?pickup[latitude]=${p.lat}&pickup[longitude]=${p.lng}&dropoff[latitude]=${d.lat}&dropoff[longitude]=${d.lng}`, webUrl: "https://www.uber.com", pricing: { baseFare: 500, perKm: 300, perMin: 80, currency: "JPY", currencySymbol: "¥", minFare: 800 } },
    { id: "go_taxi", name: "GO Taxi", color: "#FFD700", logo: "🟡", type: "Car", deepLinkTemplate: () => `https://go.mo-t.com`, webUrl: "https://go.mo-t.com", pricing: { baseFare: 420, perKm: 280, perMin: 60, currency: "JPY", currencySymbol: "¥", minFare: 730 } },
    { id: "s_ride", name: "S.RIDE", color: "#0066CC", logo: "🔵", type: "Car", deepLinkTemplate: () => `https://www.sride.jp`, webUrl: "https://www.sride.jp", pricing: { baseFare: 410, perKm: 290, perMin: 65, currency: "JPY", currencySymbol: "¥", minFare: 710 } },
    { id: "didi", name: "DiDi", color: "#FF6600", logo: "🟠", type: "Car", deepLinkTemplate: () => `https://www.didiglobal.com`, webUrl: "https://www.didiglobal.com", pricing: { baseFare: 400, perKm: 270, perMin: 55, currency: "JPY", currencySymbol: "¥", minFare: 680 } },
  ],
  AE: [
    // Metered Taxi (Dubai)
    { id: "metered", name: "Metered Taxi (approx)", color: "#FFD700", logo: "🚕", type: "Metered Taxi", isMetered: true, pricing: { baseFare: 12, perKm: 2.0, perMin: 0.5, currency: "AED", currencySymbol: "AED ", minFare: 12 } },
    { id: "uber", name: "Uber", color: "#000000", logo: "⬛", type: "Car", deepLinkTemplate: (p, d) => `https://m.uber.com/ul/?pickup[latitude]=${p.lat}&pickup[longitude]=${p.lng}&dropoff[latitude]=${d.lat}&dropoff[longitude]=${d.lng}`, webUrl: "https://www.uber.com", pricing: { baseFare: 5, perKm: 1.8, perMin: 0.5, currency: "AED", currencySymbol: "AED ", minFare: 12 } },
    { id: "careem", name: "Careem", color: "#49B649", logo: "🟢", type: "Car", deepLinkTemplate: () => `https://www.careem.com`, webUrl: "https://www.careem.com", pricing: { baseFare: 6, perKm: 1.6, perMin: 0.45, currency: "AED", currencySymbol: "AED ", minFare: 12 } },
    { id: "bolt", name: "Bolt", color: "#34D186", logo: "⚡", type: "Car", deepLinkTemplate: (p, d) => `https://m.bolt.eu/en/?pickup_lat=${p.lat}&pickup_lng=${p.lng}&destination_lat=${d.lat}&destination_lng=${d.lng}`, webUrl: "https://bolt.eu", pricing: { baseFare: 4, perKm: 1.5, perMin: 0.4, currency: "AED", currencySymbol: "AED ", minFare: 10 } },
  ],
  CA: [
    // Metered Taxi (Toronto)
    { id: "metered", name: "Metered Taxi (approx)", color: "#FFD700", logo: "🚕", type: "Metered Taxi", isMetered: true, pricing: { baseFare: 4.25, perKm: 1.75, perMin: 0.55, currency: "CAD", currencySymbol: "C$", minFare: 4.25 } },
    { id: "uber", name: "Uber", color: "#000000", logo: "⬛", type: "Car", deepLinkTemplate: (p, d) => `https://m.uber.com/ul/?pickup[latitude]=${p.lat}&pickup[longitude]=${p.lng}&dropoff[latitude]=${d.lat}&dropoff[longitude]=${d.lng}`, webUrl: "https://www.uber.com", pricing: { baseFare: 3.0, perKm: 0.82, perMin: 0.18, currency: "CAD", currencySymbol: "C$", minFare: 7.5 } },
    { id: "lyft", name: "Lyft", color: "#FF00BF", logo: "🟣", type: "Car", deepLinkTemplate: (p, d) => `https://www.lyft.com/ride?pickup[latitude]=${p.lat}&pickup[longitude]=${p.lng}&destination[latitude]=${d.lat}&destination[longitude]=${d.lng}`, webUrl: "https://www.lyft.com", pricing: { baseFare: 2.75, perKm: 0.75, perMin: 0.16, currency: "CAD", currencySymbol: "C$", minFare: 7.0 } },
    { id: "indrive", name: "inDrive", color: "#B2FF59", logo: "🚗", type: "Car", deepLinkTemplate: () => `https://indrive.com`, webUrl: "https://indrive.com", pricing: { baseFare: 2.0, perKm: 0.65, perMin: 0.12, currency: "CAD", currencySymbol: "C$", minFare: 6.0 } },
    { id: "beck_taxi", name: "Beck Taxi", color: "#FFD700", logo: "🚕", type: "Car", deepLinkTemplate: () => `https://www.becktaxi.com`, webUrl: "https://www.becktaxi.com", pricing: { baseFare: 4.25, perKm: 1.75, perMin: 0.55, currency: "CAD", currencySymbol: "C$", minFare: 4.25 } },
  ],
  TR: [
    // Metered Taxi (Istanbul)
    { id: "metered", name: "Metered Taxi (approx)", color: "#FFD700", logo: "🚕", type: "Metered Taxi", isMetered: true, pricing: { baseFare: 19, perKm: 12, perMin: 0, currency: "TRY", currencySymbol: "₺", minFare: 19 } },
    { id: "uber", name: "Uber", color: "#000000", logo: "⬛", type: "Car", deepLinkTemplate: (p, d) => `https://m.uber.com/ul/?pickup[latitude]=${p.lat}&pickup[longitude]=${p.lng}&dropoff[latitude]=${d.lat}&dropoff[longitude]=${d.lng}`, webUrl: "https://www.uber.com", pricing: { baseFare: 35, perKm: 12, perMin: 2.0, currency: "TRY", currencySymbol: "₺", minFare: 70 } },
    { id: "bitaksi", name: "BiTaksi", color: "#FFD600", logo: "🚕", type: "Car", deepLinkTemplate: () => `https://www.bitaksi.com`, webUrl: "https://www.bitaksi.com", pricing: { baseFare: 28, perKm: 10, perMin: 1.5, currency: "TRY", currencySymbol: "₺", minFare: 55 } },
    { id: "bolt", name: "Bolt", color: "#34D186", logo: "⚡", type: "Car", deepLinkTemplate: (p, d) => `https://m.bolt.eu/en/?pickup_lat=${p.lat}&pickup_lng=${p.lng}&destination_lat=${d.lat}&destination_lng=${d.lng}`, webUrl: "https://bolt.eu", pricing: { baseFare: 25, perKm: 9.5, perMin: 1.3, currency: "TRY", currencySymbol: "₺", minFare: 50 } },
    { id: "indrive", name: "inDrive", color: "#B2FF59", logo: "🚗", type: "Car", deepLinkTemplate: () => `https://indrive.com`, webUrl: "https://indrive.com", pricing: { baseFare: 20, perKm: 8.0, perMin: 1.0, currency: "TRY", currencySymbol: "₺", minFare: 40 } },
    { id: "marti", name: "Martı", color: "#00C853", logo: "🟢", type: "Car", deepLinkTemplate: () => `https://marti.tech`, webUrl: "https://marti.tech", pricing: { baseFare: 22, perKm: 9.0, perMin: 1.2, currency: "TRY", currencySymbol: "₺", minFare: 45 } },
  ],
};

// ─── Fare estimation ──────────────────────────────────────────────────────────

interface FareEstimate {
  service: TaxiService;
  estimatedLow: number;
  estimatedHigh: number;
  estimatedMinutes: number;
  distanceKm: number;
  isCheapest: boolean;
}

function estimateFares(services: TaxiService[], distanceKm: number): FareEstimate[] {
  const estimatedMinutes = Math.max(5, Math.round((distanceKm / 22) * 60));

  const estimates = services.map((svc) => {
    const raw = svc.pricing.baseFare + (distanceKm * svc.pricing.perKm) + (estimatedMinutes * svc.pricing.perMin);
    const base = Math.max(raw, svc.pricing.minFare);
    const estimatedLow = Math.round(base);
    const estimatedHigh = Math.round(base * 1.3);
    return { service: svc, estimatedLow, estimatedHigh, estimatedMinutes, distanceKm, isCheapest: false };
  });

  estimates.sort((a, b) => a.estimatedLow - b.estimatedLow);
  if (estimates.length > 0) estimates[0].isCheapest = true;

  return estimates;
}

function formatFare(amount: number, symbol: string, currency: string): string {
  if (currency === "JPY") return `${symbol}${amount.toLocaleString()}`;
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Geocoding via Nominatim ──────────────────────────────────────────────────

async function searchAddress(query: string, countryCode: string, lang: string): Promise<GeoResult[]> {
  if (query.length < 3) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=${countryCode.toLowerCase()}&limit=5&addressdetails=1&accept-language=${lang}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "CompareByThaker/1.0" },
  });
  return res.json();
}

async function reverseGeocode(lat: number, lng: number, lang: string): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=${lang}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "CompareByThaker/1.0" },
  });
  const data = await res.json();
  return data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// ─── Map helper components ────────────────────────────────────────────────────

function MapClickHandler({ onMapClick }: { onMapClick: (latlng: LatLng) => void }) {
  useMapEvents({ click(e) { onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng }); } });
  return null;
}

function FlyToLocation({ center, zoom }: { center: LatLng; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([center.lat, center.lng], zoom, { duration: 1 });
  }, [center.lat, center.lng, zoom, map]);
  return null;
}

// ─── Haversine distance ───────────────────────────────────────────────────────

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// ─── Component ────────────────────────────────────────────────────────────────

interface TaxiTabProps {
  country: string;
  countryName: string;
  countryFlag: string;
  language: string;
}

export default function TaxiTab({ country, countryName, countryFlag, language }: TaxiTabProps) {
  // Use BCP-47 language code for speech recognition
  const lang = (language || 'en').toLowerCase();
  const { t } = useTranslation();
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const pickupVoice = useVoiceSearchAddress({ onResult: setPickupAddress, lang });
  const dropoffVoice = useVoiceSearchAddress({ onResult: setDropoffAddress, lang });
  const [pickupCoord, setPickupCoord] = useState<LatLng | null>(null);
  const [dropoffCoord, setDropoffCoord] = useState<LatLng | null>(null);
  const [pickupSuggestions, setPickupSuggestions] = useState<GeoResult[]>([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState<GeoResult[]>([]);
  const [settingPoint, setSettingPoint] = useState<"pickup" | "dropoff">("pickup");
  const [showPickupSuggestions, setShowPickupSuggestions] = useState(false);
  const [showDropoffSuggestions, setShowDropoffSuggestions] = useState(false);
  const [isSearchingPickup, setIsSearchingPickup] = useState(false);
  const [isSearchingDropoff, setIsSearchingDropoff] = useState(false);
  const [rideType, setRideType] = useState<string>(country === "IN" ? "Car" : "Car");

  const pickupTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const dropoffTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const defaults = COUNTRY_DEFAULTS[country] || COUNTRY_DEFAULTS.TH;
  const allServices = TAXI_SERVICES[country] || TAXI_SERVICES.TH;
  // Filter services by selected ride type
  // Always include metered taxi for comparison
  const services = allServices.filter(svc => {
    if (svc.type === "Metered Taxi") return true;
    if (country === "IN") return svc.type === rideType;
    // For other countries, only show Car or Bike
    if (rideType === "Bike") return svc.type === "Bike";
    return svc.type === "Car";
  });

  const mapCenter = pickupCoord || defaults.center;
  const distance = pickupCoord && dropoffCoord ? haversineKm(pickupCoord, dropoffCoord) : null;

  // Fare estimates (apply 1.3x road factor to straight-line distance)
  const fareEstimates = useMemo(() => {
    if (!distance) return [];
    return estimateFares(services, distance * 1.3);
  }, [distance, services]);

  // Reset on country change
  useEffect(() => {
    setPickupCoord(null);
    setDropoffCoord(null);
    setPickupAddress("");
    setDropoffAddress("");
  }, [country]);

  const handlePickupSearch = useCallback((value: string) => {
    setPickupAddress(value);
    if (pickupTimerRef.current) clearTimeout(pickupTimerRef.current);
    if (value.length < 3) { setPickupSuggestions([]); return; }
    setIsSearchingPickup(true);
    pickupTimerRef.current = setTimeout(async () => {
      const results = await searchAddress(value, country, language);
      setPickupSuggestions(results);
      setShowPickupSuggestions(true);
      setIsSearchingPickup(false);
    }, 400);
  }, [country, language]);

  const handleDropoffSearch = useCallback((value: string) => {
    setDropoffAddress(value);
    if (dropoffTimerRef.current) clearTimeout(dropoffTimerRef.current);
    if (value.length < 3) { setDropoffSuggestions([]); return; }
    setIsSearchingDropoff(true);
    dropoffTimerRef.current = setTimeout(async () => {
      const results = await searchAddress(value, country, language);
      setDropoffSuggestions(results);
      setShowDropoffSuggestions(true);
      setIsSearchingDropoff(false);
    }, 400);
  }, [country, language]);

  const selectPickup = (r: GeoResult) => {
    setPickupCoord({ lat: parseFloat(r.lat), lng: parseFloat(r.lon) });
    setPickupAddress(r.display_name);
    setShowPickupSuggestions(false);
    setSettingPoint("dropoff");
  };

  const selectDropoff = (r: GeoResult) => {
    setDropoffCoord({ lat: parseFloat(r.lat), lng: parseFloat(r.lon) });
    setDropoffAddress(r.display_name);
    setShowDropoffSuggestions(false);
  };

  const handleMapClick = async (latlng: LatLng) => {
    const address = await reverseGeocode(latlng.lat, latlng.lng, language);
    if (settingPoint === "pickup") {
      setPickupCoord(latlng);
      setPickupAddress(address);
      setSettingPoint("dropoff");
    } else {
      setDropoffCoord(latlng);
      setDropoffAddress(address);
    }
  };


  const [geoError, setGeoError] = useState<string | null>(null);
  const useMyLocation = (target: "pickup" | "dropoff") => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coord = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const address = await reverseGeocode(coord.lat, coord.lng, language);
        if (target === "pickup") {
          setPickupCoord(coord);
          setPickupAddress(address);
          setSettingPoint("dropoff");
        } else {
          setDropoffCoord(coord);
          setDropoffAddress(address);
        }
      },
      (err) => {
        setGeoError("Unable to get your location. Please allow location access in your browser settings.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const swapLocations = () => {
    const tmpCoord = pickupCoord;
    const tmpAddr = pickupAddress;
    setPickupCoord(dropoffCoord);
    setPickupAddress(dropoffAddress);
    setDropoffCoord(tmpCoord);
    setDropoffAddress(tmpAddr);
  };

  const routeLine: [number, number][] = pickupCoord && dropoffCoord
    ? [[pickupCoord.lat, pickupCoord.lng], [dropoffCoord.lat, dropoffCoord.lng]]
    : [];

  return (
    <div className="py-4">
      <div className="mb-4">
        <p className="text-sm text-gray-500">
          {countryFlag} {t('taxi.subtitle', { countryName })}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-600 font-semibold">{t('taxi.selectRideType')}</span>
          {country === "IN" ? (
            <>
              <button onClick={() => setRideType("Car")}
                className={`px-3 py-1 rounded-full border text-xs font-medium ${rideType === "Car" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-300"}`}>🚗 Car</button>
              <button onClick={() => setRideType("Bike")}
                className={`px-3 py-1 rounded-full border text-xs font-medium ${rideType === "Bike" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-300"}`}>🏍️ Bike</button>
              <button onClick={() => setRideType("Auto Rickshaw")}
                className={`px-3 py-1 rounded-full border text-xs font-medium ${rideType === "Auto Rickshaw" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-300"}`}>🛺 Auto</button>
            </>
          ) : (
            <>
              <button onClick={() => setRideType("Car")}
                className={`px-3 py-1 rounded-full border text-xs font-medium ${rideType === "Car" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-300"}`}>🚗 Car</button>
              <button onClick={() => setRideType("Bike")}
                className={`px-3 py-1 rounded-full border text-xs font-medium ${rideType === "Bike" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-300"}`}>🏍️ Bike</button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-5 gap-4">
        {/* ── Address inputs ── */}
        <div className="lg:col-span-2 space-y-2 order-2 lg:order-1">
          <div className="rounded-2xl bg-white shadow-lg shadow-black/5 border border-white/80 p-4 sm:p-5 space-y-2">
            {/* Pickup */}
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">
                <span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block" />
                {t('taxi.pickup')}
              </label>
              <button
                type="button"
                onClick={() => useMyLocation("pickup")}
                className="mb-1 text-xs font-medium text-indigo-500 hover:text-indigo-700 flex items-center gap-1 transition-colors"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                📍 {t('taxi.useMyLocation')}
              </button>
              <div className="relative">
                <input
                  type="text"
                  value={pickupAddress}
                  onChange={(e) => handlePickupSearch(e.target.value)}
                  onFocus={() => { setSettingPoint("pickup"); pickupSuggestions.length > 0 && setShowPickupSuggestions(true); }}
                  onBlur={() => setTimeout(() => setShowPickupSuggestions(false), 200)}
                  placeholder="Enter pickup address or click map..."
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-4 pr-14 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-green-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-100 transition-all"
                  style={{ paddingRight: '3rem' }}
                />
                {/* Microphone button for pickup */}
                <button
                  type="button"
                  className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-green-600 transition-colors ${pickupVoice.listening ? "animate-pulse text-green-600" : ""}`}
                  onClick={pickupVoice.listening ? pickupVoice.stop : pickupVoice.start}
                  aria-label={pickupVoice.listening ? "Stop voice input" : "Start voice input"}
                  tabIndex={-1}
                >
                  {/* Material Design Mic Icon */}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                    <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a1 1 0 1 1 2 0 7 7 0 0 1-6 6.92V21a1 1 0 1 1-2 0v-2.08A7 7 0 0 1 5 12a1 1 0 1 1 2 0 5 5 0 0 0 10 0z" />
                  </svg>
                </button>
                {isSearchingPickup && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 border-2 border-green-200 border-t-green-500 rounded-full animate-spin" />
                )}
                {showPickupSuggestions && pickupSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 rounded-xl border border-gray-200 bg-white shadow-lg z-50 max-h-48 overflow-y-auto">
                    {pickupSuggestions.map((r, i) => (
                      <button key={i} type="button" className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-green-50 transition-colors border-b border-gray-50 last:border-0"
                        onMouseDown={(e) => { e.preventDefault(); selectPickup(r); }}>
                        <span className="line-clamp-2">{r.display_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Swap */}
            <div className="flex justify-center my-1">
              <button onClick={swapLocations} className="rounded-full bg-gray-100 hover:bg-indigo-50 p-1.5 text-gray-400 hover:text-indigo-500 transition-colors" title="Swap locations">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
            </div>

            {/* Dropoff */}
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" />
                {t('taxi.dropoff')}
              </label>
              <div className="relative">
                {geoError && (
                  <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1">{geoError}</div>
                )}
                <input
                  type="text"
                  value={dropoffAddress}
                  onChange={(e) => handleDropoffSearch(e.target.value)}
                  onFocus={() => { setSettingPoint("dropoff"); dropoffSuggestions.length > 0 && setShowDropoffSuggestions(true); }}
                  onBlur={() => setTimeout(() => setShowDropoffSuggestions(false), 200)}
                  placeholder="Enter destination or click map..."
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-4 pr-14 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-red-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-100 transition-all"
                  style={{ paddingRight: '3rem' }}
                />
                {/* Microphone button for drop-off */}
                <button
                  type="button"
                  className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600 transition-colors ${dropoffVoice.listening ? "animate-pulse text-red-600" : ""}`}
                  onClick={dropoffVoice.listening ? dropoffVoice.stop : dropoffVoice.start}
                  aria-label={dropoffVoice.listening ? "Stop voice input" : "Start voice input"}
                  tabIndex={-1}
                >
                  {/* Material Design Mic Icon */}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                    <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a1 1 0 1 1 2 0 7 7 0 0 1-6 6.92V21a1 1 0 1 1-2 0v-2.08A7 7 0 0 1 5 12a1 1 0 1 1 2 0 5 5 0 0 0 10 0z" />
                  </svg>
                </button>
                {isSearchingDropoff && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
                )}
                {showDropoffSuggestions && dropoffSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 rounded-xl border border-gray-200 bg-white shadow-lg z-50 max-h-48 overflow-y-auto">
                    {dropoffSuggestions.map((r, i) => (
                      <button key={i} type="button" className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-red-50 transition-colors border-b border-gray-50 last:border-0"
                        onMouseDown={(e) => { e.preventDefault(); selectDropoff(r); }}>
                        <span className="line-clamp-2">{r.display_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>


            {/* Click mode */}
            <div className="text-center mt-1 mb-0">
              <span className="text-[10px] text-gray-400">
                Click map to set <span className={settingPoint === "pickup" ? "font-bold text-green-600" : ""}>pickup</span>/<span className={settingPoint === "dropoff" ? "font-bold text-red-600" : ""}>drop-off</span>
              </span>
            </div>

            {/* Route info */}
            {distance !== null && (
              <div className="rounded-lg bg-indigo-50 py-2.5 px-3 flex items-center justify-between">
                <span className="text-xs font-medium text-indigo-700">
                  📏 {distance.toFixed(1)} km straight &middot; ~{(distance * 1.3).toFixed(1)} km road
                </span>
                <span className="text-xs text-indigo-500">
                  ~{Math.max(5, Math.round((distance * 1.3 / 22) * 60))} min
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Map (below form on mobile, right on desktop) ── */}
        <div className="lg:col-span-3 order-1 lg:order-2 mb-4 lg:mb-0">
          <div
            className="rounded-2xl overflow-hidden shadow-lg shadow-black/5 border border-white/80"
            style={{ height: "clamp(220px, 35vw, 400px)" }}
          >
            <MapContainer
              center={[defaults.center.lat, defaults.center.lng]}
              zoom={defaults.zoom}
              style={{ height: "100%", width: "100%" }}
              zoomControl={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CARTO</a> &middot; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              />
              <MapClickHandler onMapClick={handleMapClick} />
              <FlyToLocation center={mapCenter} zoom={defaults.zoom} />
              {pickupCoord && <Marker position={[pickupCoord.lat, pickupCoord.lng]} icon={pickupIcon} />}
              {dropoffCoord && <Marker position={[dropoffCoord.lat, dropoffCoord.lng]} icon={dropoffIcon} />}
              {routeLine.length === 2 && (
                <Polyline positions={routeLine} pathOptions={{ color: "#6366f1", weight: 3, dashArray: "8 8" }} />
              )}
            </MapContainer>
          </div>
        </div>
      </div>

      {/* ═══════ FARE COMPARISON ═══════ */}
      {fareEstimates.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span>💰</span> {t('taxi.fareComparison')}
            <span className="text-[10px] font-normal text-gray-400 ml-1">
              ({(distance! * 1.3).toFixed(1)} km &middot; ~{fareEstimates[0].estimatedMinutes} min)
            </span>
          </h3>

          {/* ── Meter vs App comparison banner ── */}
          {(() => {
            const meteredEst = fareEstimates.find(e => e.service.isMetered);
            const cheapestApp = fareEstimates.filter(e => !e.service.isMetered).sort((a, b) => a.estimatedLow - b.estimatedLow)[0];
            if (!meteredEst || !cheapestApp) return null;
            const p = meteredEst.service.pricing;
            const appSavings = meteredEst.estimatedLow - cheapestApp.estimatedLow;
            return (
              <div className={`mb-4 rounded-xl border p-3 flex flex-wrap items-center gap-4 ${
                appSavings > 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
              }`}>
                <div className="flex items-center gap-2">
                  <span className="text-xl">🚕</span>
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t('taxi.meterTaxi')}</p>
                    <p className="text-base font-bold text-amber-700">
                      {formatFare(meteredEst.estimatedLow, p.currencySymbol, p.currency)}
                      <span className="text-xs font-normal text-gray-400 ml-1">– {formatFare(meteredEst.estimatedHigh, p.currencySymbol, p.currency)}</span>
                    </p>
                  </div>
                </div>
                <span className="text-gray-300 font-bold text-lg">vs</span>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{cheapestApp.service.logo}</span>
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{cheapestApp.service.name} ({t('taxi.cheapestApp')})</p>
                    <p className="text-base font-bold text-indigo-700">
                      {formatFare(cheapestApp.estimatedLow, cheapestApp.service.pricing.currencySymbol, cheapestApp.service.pricing.currency)}
                      <span className="text-xs font-normal text-gray-400 ml-1">– {formatFare(cheapestApp.estimatedHigh, cheapestApp.service.pricing.currencySymbol, cheapestApp.service.pricing.currency)}</span>
                    </p>
                  </div>
                </div>
                <div className="ml-auto">
                  {appSavings > 0 ? (
                    <p className="text-xs font-bold text-green-700 bg-green-100 rounded-full px-3 py-1">
                      💰 {t('taxi.appSaves', { amount: formatFare(appSavings, p.currencySymbol, p.currency) })}
                    </p>
                  ) : (
                    <p className="text-xs font-bold text-amber-700 bg-amber-100 rounded-full px-3 py-1">
                      🚕 {t('taxi.meterCheaper', { amount: formatFare(-appSavings, p.currencySymbol, p.currency) })}
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {fareEstimates.map((est, idx) => {
              const svc = est.service;
              const p = svc.pricing;
              const hasRoute = pickupCoord && dropoffCoord;
              let link = '#';
              if (hasRoute && typeof svc.deepLinkTemplate === 'function') {
                link = svc.deepLinkTemplate(pickupCoord!, dropoffCoord!);
              } else if (svc.webUrl) {
                link = svc.webUrl;
              }

              // Show Grab warning if needed
              const isGrab = svc.id === "grab";

              return (
                <a
                  key={svc.id}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`product-card group rounded-xl bg-white border shadow-sm p-4 flex items-start gap-3 hover:shadow-md transition-all relative overflow-hidden ${
                    est.isCheapest ? "border-green-300 ring-2 ring-green-100" : "border-gray-100 hover:border-indigo-200"
                  }`}
                  onClick={e => {
                    if (isGrab) {
                      e.preventDefault();
                      alert("Grab does not support direct ride deep links. You'll be taken to the Grab app or website. Please enter your pickup and drop-off locations manually.");
                      window.open(link, "_blank");
                    }
                  }}
                >
                  {est.isCheapest && (
                    <div className="absolute top-0 right-0 bg-green-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl-lg">
                      CHEAPEST
                    </div>
                  )}

                  <div className="flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: svc.color + "15", color: svc.color }}>
                    #{idx + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{svc.logo}</span>
                      <span className="text-sm font-semibold text-gray-800">{svc.name}</span>
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 font-medium flex items-center gap-1">
                        {svc.type === "Car" && <span title="Car">🚗</span>}
                        {svc.type === "Bike" && <span title="Bike">🏍️</span>}
                        {svc.type === "Auto Rickshaw" && <span title="Auto Rickshaw">🛺</span>}
                        {svc.type}
                      </span>
                    </div>
                    <div className="text-lg font-bold text-gray-900">
                      {formatFare(est.estimatedLow, p.currencySymbol, p.currency)}
                      <span className="text-xs font-normal text-gray-400 ml-1">
                        – {formatFare(est.estimatedHigh, p.currencySymbol, p.currency)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-gray-400">
                        Base: {p.currencySymbol}{p.baseFare}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        /km: {p.currencySymbol}{p.perKm}
                      </span>
                    </div>
                    <div className="mt-2">
                      <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5">
                        Open in app →
                      </span>
                    </div>
                    {svc.isMetered && (
                      <div className="text-[11px] text-yellow-700 mt-1 font-semibold">
                        Metered taxi: Approximate cost. Actual fare and driver availability may vary.
                      </div>
                    )}
                  </div>
                </a>
              );
            })}
          </div>

          <p className="mt-3 text-[10px] text-gray-400 text-center">
            ⚠️ Estimates are approximate. Actual fares depend on surge pricing, traffic, route, and time of day.
            Range shows base fare to ~1.3× surge. Click a service to get the real quote.
          </p>
        </div>
      ) : (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            {t('taxi.availableServices', { countryName })}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {services.map((svc) => (
              <a
                key={svc.id}
                href={svc.webUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="product-card group rounded-xl bg-white border border-gray-100 shadow-sm p-4 flex flex-col items-center gap-2 text-center hover:border-indigo-200 hover:shadow-md transition-all"
              >
                <div className="h-12 w-12 rounded-xl flex items-center justify-center text-xl"
                  style={{ backgroundColor: svc.color + "15" }}>
                  {svc.logo}
                </div>
                <span className="text-sm font-semibold text-gray-800">{svc.name}</span>
                <span className="text-[10px] text-gray-400">
                  From {svc.pricing.currencySymbol}{svc.pricing.minFare}
                </span>
                <span className="text-[10px] text-gray-400">Set route to compare</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Tip */}
      {!pickupCoord && !dropoffCoord && (
        <div className="mt-6 rounded-xl bg-blue-50/50 border border-blue-100 p-4 text-center">
          <p className="text-xs text-blue-600">
            💡 <strong>Tip:</strong> Enter addresses above, click the map to set pickup & drop-off,
            or use GPS. Once both are set, you'll see estimated fares compared across all services.
          </p>
        </div>
      )}

      <footer className="mt-16 mb-8 text-center">
        <div className="inline-flex items-center gap-2 text-xs text-gray-400">
          <span className="inline-block h-px w-8 bg-gray-200" />
          compare by Thaker &middot; For personal use only
          <span className="inline-block h-px w-8 bg-gray-200" />
        </div>
      </footer>
    </div>
  );
}
