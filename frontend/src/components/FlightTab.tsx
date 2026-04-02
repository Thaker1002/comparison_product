import { useState, useRef, useEffect } from "react";
import axios from "axios";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Airport {
  iataCode: string;
  name: string;
  cityName: string;
  countryCode: string;
  subType: string;
}
interface Segment {
  departure: { iataCode: string; terminal: string; at: string };
  arrival:   { iataCode: string; terminal: string; at: string };
  carrierCode: string;
  carrierName: string;
  flightNumber: string;
  aircraft: string;
  duration: string;
  numberOfStops: number;
}
interface Itinerary { duration: string; segments: Segment[]; }
interface FlightOffer {
  id: string; oneWay: boolean;
  price: { total: string; currency: string; grandTotal?: string };
  itineraries: Itinerary[];
  travelerPricings: { fareDetailsBySegment: { cabin: string; includedCheckedBags: { quantity?: number; weight?: number; weightUnit: string } }[] }[];
  validatingAirlineCodes: string[];
  _raw: object;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}
function fmtDuration(iso: string) {
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return iso || "";
  const h = parseInt(m[1] || "0"), mn = parseInt(m[2] || "0");
  return h > 0 ? `${h}h ${mn > 0 ? mn + "m" : ""}`.trim() : `${mn}m`;
}
function fmtDate(d: string) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}
function fmtPrice(price: { total: string; currency: string; grandTotal?: string }) {
  const amt = price.grandTotal || price.total;
  return `${price.currency} ${parseFloat(amt).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function totalStopsOf(itin: Itinerary) {
  return itin.segments.length - 1 + itin.segments.reduce((acc, s) => acc + s.numberOfStops, 0);
}
function cabinLabel(c: string) {
  const MAP: Record<string, string> = { ECONOMY: "Economy", PREMIUM_ECONOMY: "Prem. Economy", BUSINESS: "Business", FIRST: "First Class" };
  return MAP[c] || c;
}
function airlineLogo(code: string) {
  return `https://content.airhex.com/content/logos/airlines_${code}_50_50_s.png`;
}

// ─── Airport Input ─────────────────────────────────────────────────────────────
function AirportInput({ icon, placeholder, value, onChange }: {
  icon: string; placeholder: string; value: Airport | null; onChange: (a: Airport | null) => void;
}) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<Airport[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const skip = useRef(false);

  useEffect(() => {
    if (value) { skip.current = true; setText(`${value.cityName} (${value.iataCode})`); setResults([]); }
  }, [value]);

  useEffect(() => {
    function h(e: MouseEvent) { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setResults([]); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function handleInput(v: string) {
    if (skip.current) { skip.current = false; return; }
    setText(v); onChange(null); clearTimeout(timer.current);
    if (v.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await axios.get("/api/flights/locations", { params: { keyword: v.trim() } });
        setResults(Array.isArray(res.data) ? res.data : []);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 250);
  }

  function pick(a: Airport) {
    onChange(a); setText(`${a.cityName} (${a.iataCode})`); setResults([]); inputRef.current?.blur();
  }

  return (
    <div className="relative flex-1" ref={wrapRef}>
      <div className="relative flex items-center bg-white rounded-2xl border-2 border-transparent focus-within:border-sky-400 shadow-sm transition-all">
        <span className="pl-4 text-xl select-none flex-shrink-0">{icon}</span>
        <input
          ref={inputRef} type="text" value={text}
          onChange={e => handleInput(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent py-4 px-3 text-gray-900 placeholder-gray-300 text-sm font-semibold outline-none"
          autoComplete="off" autoCorrect="off" spellCheck={false}
        />
        {text && (
          <button type="button" onClick={() => { setText(""); onChange(null); setResults([]); inputRef.current?.focus(); }}
            className="pr-4 text-gray-300 hover:text-gray-500 text-sm">✕</button>
        )}
        {loading && (
          <span className="pr-3"><svg className="h-4 w-4 animate-spin text-sky-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg></span>
        )}
      </div>
      {results.length > 0 && (
        <ul className="absolute left-0 right-0 mt-1 bg-white rounded-2xl border border-gray-100 shadow-2xl overflow-hidden py-1" style={{ zIndex: 9999 }}>
          {results.map(a => (
            <li key={a.iataCode + a.subType} onMouseDown={e => { e.preventDefault(); pick(a); }}
              className="flex items-center gap-3 px-4 py-3 hover:bg-sky-50 cursor-pointer active:bg-sky-100">
              <span className="flex-shrink-0 w-12 rounded-xl bg-sky-50 text-sky-700 text-xs font-bold text-center py-1 border border-sky-100">{a.iataCode}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{a.cityName}</p>
                <p className="text-xs text-gray-400 truncate">{a.name} · {a.countryCode}</p>
              </div>
              {a.subType === "CITY" && <span className="text-[10px] bg-sky-100 text-sky-600 rounded-full px-2 py-0.5 font-semibold flex-shrink-0">All airports</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Pax + Cabin Selector ──────────────────────────────────────────────────────
function PaxCabinSelector({ adults, children, infants, cabin, onChangePax, onChangeCabin }: {
  adults: number; children: number; infants: number; cabin: string;
  onChangePax: (a: number, c: number, i: number) => void;
  onChangeCabin: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const total = adults + children + infants;
  const cabinMap: Record<string, string> = { ECONOMY: "Economy", PREMIUM_ECONOMY: "Prem. Economy", BUSINESS: "Business", FIRST: "First Class" };

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function Row(label: string, sub: string, val: number, min: number, set: (n: number) => void) {
    return (
      <div key={label} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
        <div><p className="text-sm font-semibold text-gray-800">{label}</p><p className="text-xs text-gray-400">{sub}</p></div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => set(Math.max(min, val - 1))}
            className="h-8 w-8 rounded-full border-2 border-gray-200 hover:border-sky-400 hover:text-sky-600 flex items-center justify-center text-lg font-medium text-gray-500 transition-colors">−</button>
          <span className="w-5 text-center text-sm font-bold text-gray-800">{val}</span>
          <button type="button" onClick={() => set(val + 1)}
            className="h-8 w-8 rounded-full border-2 border-gray-200 hover:border-sky-400 hover:text-sky-600 flex items-center justify-center text-lg font-medium text-gray-500 transition-colors">+</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between bg-white rounded-2xl shadow-sm border-2 border-transparent focus:border-sky-400 px-4 py-3.5 text-sm font-semibold text-gray-700 transition-all">
        <span>👤 {total} Passenger{total !== 1 ? "s" : ""} · {cabinMap[cabin] ?? cabin}</span>
        <svg className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-2xl border border-gray-100 bg-white shadow-2xl p-4">
          {Row("Adults", "12+ years", adults, 1, n => onChangePax(n, children, infants))}
          {Row("Children", "2–11 years", children, 0, n => onChangePax(adults, n, infants))}
          {Row("Infants", "Under 2", infants, 0, n => onChangePax(adults, children, n))}
          <div className="mt-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Cabin Class</p>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(cabinMap).map(([val, lbl]) => (
                <button key={val} type="button" onClick={() => onChangeCabin(val)}
                  className={`rounded-xl border-2 px-3 py-2 text-xs font-bold transition-all ${cabin === val ? "border-sky-500 bg-sky-50 text-sky-700" : "border-gray-100 text-gray-600 hover:border-sky-200"}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stops badge ───────────────────────────────────────────────────────────────
function StopsBadge({ n }: { n: number }) {
  if (n === 0) return <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold px-2 py-0.5 whitespace-nowrap">Direct</span>;
  return <span className="rounded-full bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-bold px-2 py-0.5 whitespace-nowrap">{n} stop{n > 1 ? "s" : ""}</span>;
}

// ─── Flight Card ───────────────────────────────────────────────────────────────
function FlightCard({ offer, onSelect }: { offer: FlightOffer; onSelect: (o: FlightOffer) => void }) {
  const [expanded, setExpanded] = useState(false);
  const outbound = offer.itineraries[0];
  const inbound  = offer.itineraries[1];
  const cabin = offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin ?? "";
  const bags  = offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.includedCheckedBags;
  const bagsLabel = bags?.quantity != null ? `${bags.quantity} bag${bags.quantity !== 1 ? "s" : ""}` : bags?.weight ? `${bags.weight}${bags.weightUnit}` : "No bag";
  const mainCarrier = outbound.segments[0]?.carrierCode ?? "";
  const price = parseFloat(offer.price.grandTotal || offer.price.total);

  function ItinRow({ itin, badge }: { itin: Itinerary; badge?: string }) {
    const first = itin.segments[0];
    const last  = itin.segments[itin.segments.length - 1];
    const stops = totalStopsOf(itin);
    const multiDay = new Date(last.arrival.at).getDate() !== new Date(first.departure.at).getDate();
    return (
      <div className="flex items-center gap-2 py-2.5">
        {badge && <span className="flex-shrink-0 text-[9px] font-bold text-gray-300 uppercase w-7">{badge}</span>}
        <div className="text-center w-12 flex-shrink-0">
          <p className="text-base font-extrabold text-gray-900 leading-none">{fmtTime(first.departure.at)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{first.departure.iataCode}</p>
        </div>
        <div className="flex-1 flex flex-col items-center gap-0.5 min-w-0 px-1">
          <p className="text-xs text-gray-400">{fmtDuration(itin.duration)}</p>
          <div className="flex w-full items-center gap-1">
            <div className="h-px flex-1 bg-gray-200"/>
            <svg className="w-3 h-3 text-sky-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>
            </svg>
            <div className="h-px flex-1 bg-gray-200"/>
          </div>
          <StopsBadge n={stops} />
        </div>
        <div className="text-center w-12 flex-shrink-0">
          <p className="text-base font-extrabold text-gray-900 leading-none">
            {fmtTime(last.arrival.at)}
            {multiDay && <sup className="text-[9px] text-amber-500 ml-0.5">+1</sup>}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{last.arrival.iataCode}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="p-4">
        {/* Airline + price */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <img src={airlineLogo(mainCarrier)} alt={mainCarrier}
              className="h-10 w-10 rounded-xl object-contain bg-gray-50 p-0.5 border border-gray-100 flex-shrink-0"
              onError={e => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
            />
            <div>
              <p className="text-sm font-bold text-gray-900">{outbound.segments[0]?.carrierName || mainCarrier}</p>
              <p className="text-xs text-gray-400">{cabinLabel(cabin)} · 🧳 {bagsLabel}</p>
            </div>
          </div>
          <div className="text-right flex-shrink-0 ml-2">
            <p className="text-2xl font-extrabold text-sky-600 leading-none">{offer.price.currency}&thinsp;{Math.round(price).toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">per person</p>
          </div>
        </div>
        {/* Itinerary */}
        <div className="divide-y divide-gray-50 mt-1">
          <ItinRow itin={outbound} badge={inbound ? "Out" : undefined} />
          {inbound && <ItinRow itin={inbound} badge="Ret" />}
        </div>
        {/* Actions */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
          <button type="button" onClick={() => setExpanded(e => !e)}
            className="text-xs text-sky-500 hover:text-sky-700 font-semibold flex items-center gap-1">
            {expanded ? "▲ Hide details" : "▼ Flight details"}
          </button>
          <button type="button" onClick={() => onSelect(offer)}
            className="bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white text-sm font-bold px-5 py-2 rounded-xl transition-colors active:scale-95">
            Select →
          </button>
        </div>
      </div>
      {/* Expanded */}
      {expanded && (
        <div className="bg-slate-50 border-t border-gray-100 px-4 py-4">
          {offer.itineraries.map((itin, ii) => (
            <div key={ii} className={ii > 0 ? "mt-5 pt-4 border-t border-gray-200" : ""}>
              {inbound && (
                <p className="text-[10px] font-extrabold text-sky-600 uppercase tracking-widest mb-3">
                  {ii === 0 ? "✈ Outbound" : "✈ Return"} · {fmtDate(itin.segments[0].departure.at)}
                </p>
              )}
              {itin.segments.map((seg, si) => (
                <div key={si} className="flex gap-3 mb-3 last:mb-0">
                  <div className="flex flex-col items-center pt-1">
                    <div className="h-2.5 w-2.5 rounded-full bg-sky-400 ring-2 ring-sky-100 flex-shrink-0"/>
                    {si < itin.segments.length - 1 && <div className="flex-1 w-px bg-gray-200 my-1 min-h-[1.5rem]"/>}
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-bold text-gray-800">{fmtTime(seg.departure.at)}<span className="text-gray-300 mx-1">→</span>{fmtTime(seg.arrival.at)}</p>
                      <span className="text-xs text-gray-400 flex-shrink-0">{fmtDuration(seg.duration)}</span>
                    </div>
                    <p className="text-xs text-gray-500">{seg.departure.iataCode} T{seg.departure.terminal || "?"} → {seg.arrival.iataCode} T{seg.arrival.terminal || "?"}</p>
                    <p className="text-xs text-sky-600 font-semibold mt-0.5">{seg.carrierName || seg.carrierCode} · {seg.carrierCode}{seg.flightNumber} · {seg.aircraft}</p>
                  </div>
                </div>
              ))}
            </div>
          ))}
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="rounded-full bg-sky-50 text-sky-700 border border-sky-100 text-xs px-3 py-1 font-semibold">{cabinLabel(cabin)}</span>
            <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs px-3 py-1 font-semibold">🧳 {bagsLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Booking panel ─────────────────────────────────────────────────────────────
function BookingPanel({ offer, adults, children, infants, onBack }: {
  offer: FlightOffer; adults: number; children: number; infants: number; onBack: () => void;
}) {
  const SITES = [
    { name: "Google Flights", url: "https://www.google.com/travel/flights", emoji: "🔍" },
    { name: "Skyscanner",     url: "https://www.skyscanner.net",            emoji: "🌍" },
    { name: "Kayak",          url: "https://www.kayak.com",                 emoji: "🚀" },
    { name: "Expedia",        url: "https://www.expedia.com",               emoji: "✈️" },
  ];
  const seg     = offer.itineraries[0]?.segments[0];
  const lastSeg = offer.itineraries[0]?.segments[offer.itineraries[0].segments.length - 1];
  return (
    <div className="rounded-2xl bg-white border border-emerald-200 shadow-lg overflow-hidden">
      <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-emerald-100 text-xs font-semibold uppercase tracking-wide">✅ Price Confirmed</p>
            <p className="text-white text-2xl font-extrabold mt-1">{fmtPrice(offer.price)}</p>
            <p className="text-emerald-100 text-xs mt-0.5">Total · {adults + children + infants} pax</p>
          </div>
          <button type="button" onClick={onBack} className="text-white/70 hover:text-white text-sm mt-1">← Back</button>
        </div>
        {seg && (
          <div className="mt-3 flex items-center gap-2 text-white text-sm font-bold">
            <span>{seg.departure.iataCode}</span>
            <span className="text-emerald-200 text-xs">──✈──</span>
            <span>{lastSeg?.arrival.iataCode}</span>
            {offer.itineraries[1] && <span className="text-emerald-200 text-xs ml-2">· Round Trip</span>}
          </div>
        )}
      </div>
      <div className="p-5">
        <p className="text-xs text-gray-400 mb-3 text-center">This fare is available. Book directly on:</p>
        <div className="grid grid-cols-2 gap-2.5">
          {SITES.map(site => (
            <a key={site.name} href={site.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border-2 border-gray-100 hover:border-sky-300 bg-gray-50 hover:bg-sky-50 px-3 py-3 transition-all active:scale-95">
              <span className="text-xl">{site.emoji}</span>
              <span className="text-sm font-bold text-gray-700">{site.name}</span>
            </a>
          ))}
        </div>
        <p className="text-[10px] text-gray-300 text-center mt-4">Prices indicative · Final fare may vary on booking site</p>
      </div>
    </div>
  );
}

// ─── Default origin airports per country ─────────────────────────────────────
const COUNTRY_DEFAULT_AIRPORTS: Record<string, Airport> = {
  TH: { iataCode: "BKK", name: "Suvarnabhumi Airport", cityName: "Bangkok",      countryCode: "TH", subType: "AIRPORT" },
  ID: { iataCode: "CGK", name: "Soekarno-Hatta Airport", cityName: "Jakarta",    countryCode: "ID", subType: "AIRPORT" },
  SG: { iataCode: "SIN", name: "Singapore Changi Airport", cityName: "Singapore",countryCode: "SG", subType: "AIRPORT" },
  MY: { iataCode: "KUL", name: "Kuala Lumpur Intl Airport", cityName: "Kuala Lumpur", countryCode: "MY", subType: "AIRPORT" },
  IN: { iataCode: "DEL", name: "Indira Gandhi Intl Airport", cityName: "Delhi",   countryCode: "IN", subType: "AIRPORT" },
  PH: { iataCode: "MNL", name: "Ninoy Aquino Intl Airport", cityName: "Manila",  countryCode: "PH", subType: "AIRPORT" },
  AE: { iataCode: "DXB", name: "Dubai International Airport", cityName: "Dubai", countryCode: "AE", subType: "AIRPORT" },
  US: { iataCode: "JFK", name: "John F. Kennedy Intl Airport", cityName: "New York", countryCode: "US", subType: "AIRPORT" },
  CA: { iataCode: "YYZ", name: "Toronto Pearson Intl Airport", cityName: "Toronto", countryCode: "CA", subType: "AIRPORT" },
};

// ─── Main FlightTab ─────────────────────────────────────────────────────────────
export default function FlightTab({ country = "TH" }: { country?: string }) {
  const [tripType, setTripType] = useState<"oneway" | "roundtrip">("oneway");
  const [origin, setOrigin]     = useState<Airport | null>(COUNTRY_DEFAULT_AIRPORTS[country] ?? null);
  const [dest,   setDest]       = useState<Airport | null>(null);
  const [depDate, setDepDate]   = useState("");
  const [retDate, setRetDate]   = useState("");
  const [adults,   setAdults]   = useState(1);
  const [children, setChildren] = useState(0);
  const [infants,  setInfants]  = useState(0);
  const [cabin,    setCabin]    = useState("ECONOMY");
  const [nonStop,  setNonStop]  = useState(false);

  const [offers,  setOffers]  = useState<FlightOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [isApiDown, setIsApiDown] = useState(false);
  const [sortBy,  setSortBy]  = useState<"price" | "duration">("price");
  const [stopsFilter, setStopsFilter] = useState<number>(-1);
  const [pricing,        setPricing]        = useState<FlightOffer | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);

  useEffect(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    setDepDate(d.toISOString().slice(0, 10));
  }, []);

  // Update default origin when country changes
  useEffect(() => {
    setOrigin(COUNTRY_DEFAULT_AIRPORTS[country] ?? null);
    setDest(null);
    setOffers([]);
    setError("");
  }, [country]);

  function swapAirports() { const tmp = origin; setOrigin(dest); setDest(tmp); }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!origin || !dest) { setError("Please select both origin and destination airports."); return; }
    if (!depDate)          { setError("Please select a departure date."); return; }
    if (tripType === "roundtrip" && !retDate) { setError("Please select a return date."); return; }
    setError(""); setOffers([]); setLoading(true); setPricing(null); setIsApiDown(false);
    try {
      const res = await axios.post("/api/flights/search", {
        origin: origin.iataCode, destination: dest.iataCode, departureDate: depDate,
        returnDate: tripType === "roundtrip" ? retDate : undefined,
        adults, children, infants, travelClass: cabin, nonStop, max: 20,
      });
      setOffers(res.data.offers || []);
      if (!(res.data.offers || []).length) setError("No flights found. Try different dates or airports.");
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: { detail: string }[]; error?: string } } };
      const status = e?.response?.status;
      if (status === 401 || status === 403 || status === 502) {
        setIsApiDown(true);
        setError("");
      } else {
        setError(e?.response?.data?.detail?.[0]?.detail || e?.response?.data?.error || "Flight search failed. Please try again.");
      }
    } finally { setLoading(false); }
  }

  async function handleSelect(offer: FlightOffer) {
    setPricing(null); setPricingLoading(true);
    try {
      const res = await axios.post("/api/flights/price", { flightOffer: offer._raw });
      setPricing(res.data.pricedOffers?.[0] ?? offer);
    } catch { setPricing(offer); }
    finally { setPricingLoading(false); }
  }

  const STOPS_TABS = [{ label: "Any flights", value: -1 }, { label: "Direct only", value: 0 }, { label: "1 Stop", value: 1 }, { label: "2+ Stops", value: 2 }];

  const sorted = [...offers].sort((a, b) => {
    if (sortBy === "price") return parseFloat(a.price.grandTotal || a.price.total) - parseFloat(b.price.grandTotal || b.price.total);
    return (a.itineraries[0]?.duration || "").localeCompare(b.itineraries[0]?.duration || "");
  });
  const displayed = sorted.filter(o => {
    if (stopsFilter === -1) return true;
    const s = totalStopsOf(o.itineraries[0]);
    return stopsFilter === 2 ? s >= 2 : s === stopsFilter;
  });
  const minPrice = displayed.length ? Math.min(...displayed.map(o => parseFloat(o.price.grandTotal || o.price.total))) : 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="w-full pb-4">

      {/* Hero header */}
      <div className="bg-gradient-to-br from-sky-600 via-blue-600 to-cyan-700 rounded-2xl p-4 mb-4 text-white">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-2xl">✈️</span>
          <h2 className="text-lg font-extrabold tracking-tight">Flight Search</h2>
        </div>
        <p className="text-sky-100 text-xs">Compare fares across all airlines · Real-time prices</p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="space-y-3 mb-4">

        {/* Trip type */}
        <div className="flex bg-white rounded-2xl p-1 shadow-sm gap-1">
          {(["oneway", "roundtrip"] as const).map(t => (
            <button key={t} type="button" onClick={() => setTripType(t)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                tripType === t ? "bg-sky-500 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {t === "oneway" ? "✈ One Way" : "↔ Round Trip"}
            </button>
          ))}
        </div>

        {/* From / To with swap */}
        <div className="relative flex flex-col gap-2">
          <AirportInput icon="🛫" placeholder="From — city or airport" value={origin} onChange={setOrigin} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <button type="button" onClick={swapAirports}
              className="h-9 w-9 rounded-full bg-sky-500 hover:bg-sky-600 text-white shadow-lg shadow-sky-500/30 flex items-center justify-center text-base font-bold transition-colors active:scale-90">
              ⇅
            </button>
          </div>
          <AirportInput icon="🛬" placeholder="To — city or airport" value={dest} onChange={setDest} />
        </div>

        {/* Dates */}
        <div className={`grid gap-3 ${tripType === "roundtrip" ? "grid-cols-2" : "grid-cols-1"}`}>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <label className="block text-[10px] font-extrabold text-sky-500 uppercase tracking-widest px-4 pt-3 pb-0.5">Departure</label>
            <input type="date" value={depDate} onChange={e => setDepDate(e.target.value)} min={today}
              className="w-full px-4 pb-3 pt-1 text-sm font-bold text-gray-800 bg-transparent outline-none" />
          </div>
          {tripType === "roundtrip" && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <label className="block text-[10px] font-extrabold text-sky-500 uppercase tracking-widest px-4 pt-3 pb-0.5">Return</label>
              <input type="date" value={retDate} onChange={e => setRetDate(e.target.value)} min={depDate || today}
                className="w-full px-4 pb-3 pt-1 text-sm font-bold text-gray-800 bg-transparent outline-none" />
            </div>
          )}
        </div>

        {/* Passengers + cabin */}
        <PaxCabinSelector adults={adults} children={children} infants={infants} cabin={cabin}
          onChangePax={(a, c, i) => { setAdults(a); setChildren(c); setInfants(i); }}
          onChangeCabin={setCabin} />

        {/* Direct only toggle */}
        <label className="flex items-center gap-3 bg-white rounded-2xl shadow-sm px-4 py-3.5 cursor-pointer">
          <div onClick={() => setNonStop(v => !v)}
            className={`h-6 w-11 rounded-full transition-colors flex items-center px-0.5 ${nonStop ? "bg-sky-500" : "bg-gray-200"}`}>
            <div className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${nonStop ? "translate-x-5" : "translate-x-0"}`}/>
          </div>
          <span className="text-sm font-semibold text-gray-700">Direct flights only</span>
        </label>

        {error && <div className="rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3">{error}</div>}

        {isApiDown && origin && dest && (
          <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50 p-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sky-500 text-lg">✈️</span>
              <p className="text-sky-800 font-bold text-sm">Search on booking sites</p>
            </div>
            <p className="text-sky-600 text-xs mb-4">Our flight API is temporarily unavailable. Search directly on these sites for {origin.iataCode} → {dest.iataCode}:</p>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { name: "Google Flights", emoji: "🔍", url: `https://www.google.com/travel/flights/search?q=flights+from+${origin.iataCode}+to+${dest.iataCode}+on+${depDate}` },
                { name: "Skyscanner",     emoji: "🌍", url: `https://www.skyscanner.net/transport/flights/${origin.iataCode.toLowerCase()}/${dest.iataCode.toLowerCase()}/${depDate.replace(/-/g,"")}` },
                { name: "Kayak",          emoji: "🚀", url: `https://www.kayak.com/flights/${origin.iataCode}-${dest.iataCode}/${depDate}` },
                { name: "Expedia",        emoji: "💼", url: `https://www.expedia.com/Flights-Search?trip=oneway&leg1=from:${origin.iataCode},to:${dest.iataCode},departure:${depDate}` },
              ].map(site => (
                <a key={site.name} href={site.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-xl border-2 border-sky-100 hover:border-sky-400 bg-white hover:bg-sky-50 px-3 py-3 transition-all active:scale-95 shadow-sm">
                  <span className="text-xl">{site.emoji}</span>
                  <span className="text-sm font-bold text-gray-700">{site.name}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        <button type="submit" disabled={loading}
          className="w-full rounded-2xl bg-sky-500 hover:bg-sky-600 active:bg-sky-700 disabled:opacity-60 text-white font-extrabold py-4 text-base shadow-lg shadow-sky-900/30 transition-colors flex items-center justify-center gap-2">
          {loading ? (
            <><svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg> Searching flights…</>
          ) : "✈️   Search Flights"}
        </button>
      </form>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-2xl bg-white shadow-sm p-4 animate-pulse">
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2 items-center"><div className="h-10 w-10 rounded-xl bg-gray-200"/><div className="space-y-1.5"><div className="h-3 w-28 rounded bg-gray-200"/><div className="h-2.5 w-20 rounded bg-gray-100"/></div></div>
                <div className="h-7 w-20 rounded-xl bg-gray-200"/>
              </div>
              <div className="h-14 rounded-xl bg-gray-100"/>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!loading && displayed.length > 0 && !pricing && !pricingLoading && (
        <>
          {/* Stats + sort */}
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <p className="text-sm text-white/70">
              <span className="font-extrabold text-white">{displayed.length}</span> flights
              {minPrice > 0 && <span className="ml-1.5 text-sky-300">from <strong>{offers[0]?.price.currency} {Math.round(minPrice).toLocaleString()}</strong></span>}
            </p>
            <div className="flex gap-1">
              {(["price", "duration"] as const).map(s => (
                <button key={s} type="button" onClick={() => setSortBy(s)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition-all ${sortBy === s ? "bg-sky-500 text-white border-sky-500" : "bg-white/10 text-white/60 border-white/10 hover:bg-white/20"}`}>
                  {s === "price" ? "💰 Cheapest" : "⚡ Fastest"}
                </button>
              ))}
            </div>
          </div>

          {/* Stop filters */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-hide">
            {STOPS_TABS.map(tab => (
              <button key={tab.value} type="button" onClick={() => setStopsFilter(tab.value)}
                className={`flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-bold border transition-all ${stopsFilter === tab.value ? "bg-sky-500 text-white border-sky-500" : "bg-white/10 text-white/60 border-white/10 hover:bg-white/20"}`}>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {displayed.map(offer => <FlightCard key={offer.id} offer={offer} onSelect={handleSelect} />)}
          </div>
        </>
      )}

      {/* Pricing loading */}
      {pricingLoading && (
        <div className="rounded-2xl bg-sky-950 border border-sky-800 p-8 text-center">
          <svg className="h-7 w-7 animate-spin text-sky-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <p className="text-sky-300 text-sm font-semibold">Confirming price & availability…</p>
        </div>
      )}

      {/* Booking panel */}
      {pricing && !pricingLoading && (
        <BookingPanel offer={pricing} adults={adults} children={children} infants={infants} onBack={() => setPricing(null)} />
      )}

      {/* Empty state */}
      {!loading && offers.length === 0 && !error && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">✈️</div>
          <p className="text-white/60 text-sm font-semibold">Search above to compare flight prices</p>
          <p className="text-white/30 text-xs mt-1">Live fares · All airlines · Best available</p>
        </div>
      )}
    </div>
  );
}
