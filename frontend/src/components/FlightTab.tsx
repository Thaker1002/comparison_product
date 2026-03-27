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
  operatingCarrier: string;
  flightNumber: string;
  aircraft: string;
  duration: string;
  numberOfStops: number;
}

interface Itinerary {
  duration: string;
  segments: Segment[];
}

interface FlightOffer {
  id: string;
  oneWay: boolean;
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
function fmtDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}
function fmtPrice(price: { total: string; currency: string; grandTotal?: string }) {
  const amt = price.grandTotal || price.total;
  return `${price.currency} ${parseFloat(amt).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function stopsBadge(n: number) {
  if (n === 0) return <span className="rounded-full bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5">Direct</span>;
  return <span className="rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5">{n} stop{n > 1 ? "s" : ""}</span>;
}
function cabinBadge(cabin: string) {
  const map: Record<string, string> = { ECONOMY: "Economy", PREMIUM_ECONOMY: "Prem. Eco", BUSINESS: "Business", FIRST: "First" };
  return map[cabin] || cabin;
}
function airlineLogo(code: string) {
  return `https://content.airhex.com/content/logos/airlines_${code}_50_50_s.png`;
}
function totalStops(itin: Itinerary) {
  return itin.segments.length - 1 + itin.segments.reduce((acc, s) => acc + s.numberOfStops, 0);
}


// ─── Airport Autocomplete Input ────────────────────────────────────────────────
function AirportInput({
  label, placeholder, value, onChange,
}: {
  label: string; placeholder: string;
  value: Airport | null;
  onChange: (a: Airport | null) => void;
}) {
  const [text, setText] = useState(value ? `${value.cityName} (${value.iataCode})` : "");
  const [results, setResults] = useState<Airport[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value) { setText(""); return; }
    setText(`${value.cityName} (${value.iataCode})`);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function handleInput(v: string) {
    setText(v);
    onChange(null);
    clearTimeout(timer.current);
    if (v.length < 2) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/api/flights/locations?keyword=${encodeURIComponent(v)}`);
        setResults(res.data || []);
        setOpen(true);
      } catch { setResults([]); }
      setLoading(false);
    }, 300);
  }

  function pick(a: Airport) {
    onChange(a);
    setText(`${a.cityName} (${a.iataCode})`);
    setOpen(false);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      <div className="relative">
        <input
          type="text"
          value={text}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => { if (results.length) setOpen(true); }}
          placeholder={placeholder}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
          autoComplete="off"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg className="h-4 w-4 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          </span>
        )}
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl py-1">
          {results.map(a => (
            <li
              key={a.iataCode + a.subType}
              onMouseDown={() => pick(a)}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 cursor-pointer"
            >
              <span className="flex-shrink-0 w-10 rounded-lg bg-indigo-50 text-indigo-700 text-[11px] font-bold text-center py-0.5">{a.iataCode}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-800">{a.cityName}</p>
                <p className="truncate text-xs text-gray-400">{a.name} · {a.countryCode}</p>
              </div>
              {a.subType === "CITY" && (
                <span className="ml-auto flex-shrink-0 rounded-full bg-blue-50 text-blue-500 text-[10px] px-1.5 py-0.5">City</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Passenger selector ────────────────────────────────────────────────────────
function PaxSelector({ adults, children, infants, onChange }: {
  adults: number; children: number; infants: number;
  onChange: (a: number, c: number, i: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const total = adults + children + infants;

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function row(label: string, sub: string, val: number, min: number, set: (n: number) => void) {
    return (
      <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
        <div>
          <p className="text-sm font-medium text-gray-800">{label}</p>
          <p className="text-xs text-gray-400">{sub}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => set(Math.max(min, val - 1))} className="h-7 w-7 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center justify-center text-lg leading-none">−</button>
          <span className="w-4 text-center text-sm font-semibold text-gray-800">{val}</span>
          <button onClick={() => set(val + 1)} className="h-7 w-7 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center justify-center text-lg leading-none">+</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Passengers</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm shadow-sm flex items-center justify-between focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
      >
        <span>👤 {total} Passenger{total !== 1 ? "s" : ""}</span>
        <svg className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-xl border border-gray-200 bg-white shadow-xl p-4">
          {row("Adults", "12+ years", adults, 1, n => onChange(n, children, infants))}
          {row("Children", "2–11 years", children, 0, n => onChange(adults, n, infants))}
          {row("Infants", "Under 2", infants, 0, n => onChange(adults, children, n))}
        </div>
      )}
    </div>
  );
}

// ─── Flight Card ───────────────────────────────────────────────────────────────
function FlightCard({ offer, onSelect }: { offer: FlightOffer; onSelect: (o: FlightOffer) => void }) {
  const [expanded, setExpanded] = useState(false);
  const outbound = offer.itineraries[0];
  const inbound  = offer.itineraries[1];
  const cabin = offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin || "";
  const bags  = offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.includedCheckedBags;
  const bagsLabel = bags?.quantity != null
    ? `${bags.quantity} bag${bags.quantity !== 1 ? "s" : ""}`
    : bags?.weight ? `${bags.weight}${bags.weightUnit}` : "No bag";

  const mainCarrier = outbound.segments[0]?.carrierCode || "";

  function ItinRow({ itin, label }: { itin: Itinerary; label?: string }) {
    const first = itin.segments[0];
    const last  = itin.segments[itin.segments.length - 1];
    const stops = totalStops(itin);
    return (
      <div className="flex items-center gap-4 py-2">
        {label && <span className="flex-shrink-0 text-[10px] font-semibold text-gray-400 w-12">{label}</span>}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="text-center min-w-[3rem]">
            <p className="text-base font-bold text-gray-900">{fmtTime(first.departure.at)}</p>
            <p className="text-xs text-gray-500">{first.departure.iataCode}</p>
          </div>
          <div className="flex-1 flex flex-col items-center min-w-0 px-2">
            <p className="text-xs text-gray-400">{itin.duration}</p>
            <div className="relative w-full flex items-center my-0.5">
              <div className="flex-1 h-px bg-gray-200"/>
              <div className="mx-1 text-gray-300 text-xs">✈</div>
              <div className="flex-1 h-px bg-gray-200"/>
            </div>
            {stopsBadge(stops)}
          </div>
          <div className="text-center min-w-[3rem]">
            <p className="text-base font-bold text-gray-900">{fmtTime(last.arrival.at)}</p>
            <p className="text-xs text-gray-500">{last.arrival.iataCode}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition overflow-hidden">
      <div className="p-4">
        {/* Header row: airline logo + name + price */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <img
              src={airlineLogo(mainCarrier)}
              alt={mainCarrier}
              className="h-8 w-8 rounded-lg object-contain bg-gray-50 border border-gray-100 p-0.5"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div>
              <p className="text-sm font-semibold text-gray-800">{outbound.segments[0]?.carrierName || mainCarrier}</p>
              <p className="text-xs text-gray-400">{cabinBadge(cabin)} · {bagsLabel}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-extrabold text-indigo-600">{fmtPrice(offer.price)}</p>
            <p className="text-[10px] text-gray-400">per person</p>
          </div>
        </div>

        {/* Itinerary rows */}
        <div className="divide-y divide-gray-100">
          <ItinRow itin={outbound} label={inbound ? "Out" : undefined} />
          {inbound && <ItinRow itin={inbound} label="Ret" />}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-indigo-500 hover:text-indigo-700 font-medium"
          >
            {expanded ? "Hide details ▲" : "Flight details ▼"}
          </button>
          <button
            onClick={() => onSelect(offer)}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2 transition"
          >
            Select
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-4">
          {offer.itineraries.map((itin, ii) => (
            <div key={ii} className="mb-4 last:mb-0">
              {inbound && (
                <p className="text-xs font-bold text-indigo-600 mb-2 uppercase tracking-wide">
                  {ii === 0 ? "Outbound" : "Return"} · {fmtDate(itin.segments[0].departure.at)}
                </p>
              )}
              {itin.segments.map((seg, si) => (
                <div key={si} className="flex gap-3 mb-3 last:mb-0">
                  <div className="flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-indigo-400 mt-1"/>
                    {si < itin.segments.length - 1 && <div className="flex-1 w-px bg-gray-300 my-1"/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-800">
                        {fmtTime(seg.departure.at)} <span className="text-gray-400 font-normal">→</span> {fmtTime(seg.arrival.at)}
                      </p>
                      <span className="text-xs text-gray-400">{seg.duration}</span>
                    </div>
                    <p className="text-xs text-gray-500">{seg.departure.iataCode} T{seg.departure.terminal} → {seg.arrival.iataCode} T{seg.arrival.terminal}</p>
                    <p className="text-xs text-gray-500">{seg.carrierName} {seg.carrierCode}{seg.flightNumber} · {seg.aircraft}</p>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0] && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-indigo-50 text-indigo-600 text-[11px] px-2.5 py-0.5 font-medium">
                {cabinBadge(offer.travelerPricings[0].fareDetailsBySegment[0].cabin)}
              </span>
              <span className="rounded-full bg-green-50 text-green-700 text-[11px] px-2.5 py-0.5 font-medium">
                {bagsLabel} included
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main FlightTab component ──────────────────────────────────────────────────
export default function FlightTab() {
  // Form state
  const [tripType, setTripType] = useState<"oneway" | "roundtrip">("oneway");
  const [origin, setOrigin]     = useState<Airport | null>(null);
  const [dest,   setDest]       = useState<Airport | null>(null);
  const [depDate, setDepDate]   = useState("");
  const [retDate, setRetDate]   = useState("");
  const [adults,    setAdults]    = useState(1);
  const [children,  setChildren]  = useState(0);
  const [infants,   setInfants]   = useState(0);
  const [cabin,     setCabin]     = useState("ECONOMY");
  const [nonStop,   setNonStop]   = useState(false);

  // Results state
  const [offers,  setOffers]  = useState<FlightOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [sortBy,  setSortBy]  = useState<"price" | "duration">("price");

  // Selected flight for pricing
  const [pricing,       setPricing]       = useState<FlightOffer | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);

  // Default departure date to tomorrow
  useEffect(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    setDepDate(d.toISOString().slice(0, 10));
  }, []);

  function swapAirports() {
    const tmp = origin; setOrigin(dest); setDest(tmp);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!origin || !dest) { setError("Please select both origin and destination airports."); return; }
    if (!depDate)          { setError("Please select a departure date."); return; }
    if (tripType === "roundtrip" && !retDate) { setError("Please select a return date."); return; }
    setError(""); setOffers([]); setLoading(true); setPricing(null);
    try {
      const res = await axios.post("/api/flights/search", {
        origin:      origin.iataCode,
        destination: dest.iataCode,
        departureDate: depDate,
        returnDate: tripType === "roundtrip" ? retDate : undefined,
        adults, children, infants,
        travelClass: cabin,
        nonStop,
        max: 20,
      });
      setOffers(res.data.offers || []);
      if ((res.data.offers || []).length === 0) setError("No flights found for these dates. Try different dates or airports.");
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.[0]?.detail || err?.response?.data?.error || "Flight search failed. Please try again.";
      setError(msg);
    } finally { setLoading(false); }
  }

  async function handleSelect(offer: FlightOffer) {
    setPricing(null); setPricingLoading(true);
    try {
      const res = await axios.post("/api/flights/price", { flightOffer: offer._raw });
      if (res.data.pricedOffers?.[0]) setPricing(res.data.pricedOffers[0]);
      else setPricing(offer);
    } catch {
      setPricing(offer); // fall back to original offer
    } finally { setPricingLoading(false); }
  }

  const sorted = [...offers].sort((a, b) => {
    if (sortBy === "price") return parseFloat(a.price.grandTotal || a.price.total) - parseFloat(b.price.grandTotal || b.price.total);
    // sort by total duration (outbound only)
    const durA = a.itineraries[0]?.duration || "";
    const durB = b.itineraries[0]?.duration || "";
    return durA.localeCompare(durB);
  });

  const minPrice = offers.length ? Math.min(...offers.map(o => parseFloat(o.price.grandTotal || o.price.total))) : 0;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-16">

      {/* ── Search Form ── */}
      <form onSubmit={handleSearch} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 mb-6">

        {/* Trip type + cabin */}
        <div className="flex items-center gap-2 flex-wrap mb-5">
          {(["oneway", "roundtrip"] as const).map(t => (
            <button
              key={t} type="button"
              onClick={() => setTripType(t)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition border ${
                tripType === t ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
              }`}
            >
              {t === "oneway" ? "One Way" : "Round Trip"}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <select
              value={cabin}
              onChange={e => setCabin(e.target.value)}
              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 focus:border-indigo-400 outline-none"
            >
              <option value="ECONOMY">Economy</option>
              <option value="PREMIUM_ECONOMY">Prem. Economy</option>
              <option value="BUSINESS">Business</option>
              <option value="FIRST">First</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={nonStop} onChange={e => setNonStop(e.target.checked)} className="rounded"/>
              Direct only
            </label>
          </div>
        </div>

        {/* Origin / Destination */}
        <div className="flex gap-2 items-end mb-4">
          <div className="flex-1">
            <AirportInput label="From" placeholder="City or airport" value={origin} onChange={setOrigin}/>
          </div>
          <button
            type="button" onClick={swapAirports}
            className="flex-shrink-0 mb-0.5 h-10 w-10 rounded-full border border-gray-200 bg-white hover:bg-indigo-50 flex items-center justify-center text-lg text-gray-500 hover:text-indigo-600 transition self-end"
            title="Swap"
          >⇌</button>
          <div className="flex-1">
            <AirportInput label="To" placeholder="City or airport" value={dest} onChange={setDest}/>
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Departure</label>
            <input
              type="date" value={depDate} onChange={e => setDepDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
            />
          </div>
          <div>
            <label className={`block text-xs font-semibold uppercase tracking-wide mb-1 ${tripType === "roundtrip" ? "text-gray-500" : "text-gray-300"}`}>Return</label>
            <input
              type="date" value={retDate} onChange={e => setRetDate(e.target.value)}
              min={depDate || new Date().toISOString().slice(0, 10)}
              disabled={tripType !== "roundtrip"}
              className={`w-full rounded-xl border px-4 py-3 text-sm shadow-sm outline-none transition ${
                tripType === "roundtrip"
                  ? "border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  : "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed"
              }`}
            />
          </div>
        </div>

        {/* Passengers */}
        <div className="mb-5">
          <PaxSelector
            adults={adults} children={children} infants={infants}
            onChange={(a, c, i) => { setAdults(a); setChildren(c); setInfants(i); }}
          />
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3">{error}</div>
        )}

        <button
          type="submit" disabled={loading}
          className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold py-3 text-sm transition flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Searching flights…
            </>
          ) : "✈️  Search Flights"}
        </button>
      </form>

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 animate-pulse">
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2"><div className="h-8 w-8 rounded-lg bg-gray-200"/><div className="space-y-2"><div className="h-3 w-24 rounded bg-gray-200"/><div className="h-2 w-16 rounded bg-gray-100"/></div></div>
                <div className="h-7 w-20 rounded-lg bg-gray-200"/>
              </div>
              <div className="h-12 rounded-lg bg-gray-100"/>
            </div>
          ))}
        </div>
      )}

      {/* ── Results header ── */}
      {!loading && offers.length > 0 && !pricing && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-600">
              <span className="font-bold text-gray-900">{offers.length}</span> flights found
              {minPrice > 0 && <span className="ml-1 text-indigo-600">· from <strong>USD {Math.round(minPrice).toLocaleString()}</strong></span>}
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">Sort:</span>
              {(["price", "duration"] as const).map(s => (
                <button
                  key={s} onClick={() => setSortBy(s)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition border ${
                    sortBy === s ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                  }`}
                >{s === "price" ? "Cheapest" : "Fastest"}</button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {sorted.map(offer => (
              <FlightCard key={offer.id} offer={offer} onSelect={handleSelect}/>
            ))}
          </div>
        </>
      )}

      {/* ── Pricing confirmation panel ── */}
      {pricingLoading && (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-6 text-center">
          <svg className="h-6 w-6 animate-spin text-indigo-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <p className="text-sm text-indigo-700 font-medium">Confirming price and availability…</p>
        </div>
      )}

      {pricing && !pricingLoading && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-base font-bold text-green-800">✅ Price confirmed</p>
              <p className="text-xs text-green-600">This fare is available for booking</p>
            </div>
            <button onClick={() => { setPricing(null); }} className="text-xs text-gray-500 hover:text-gray-700">← Back to results</button>
          </div>
          <div className="rounded-xl bg-white border border-green-100 p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">
                  {pricing.itineraries[0]?.segments[0]?.departure.iataCode} → {pricing.itineraries[0]?.segments[pricing.itineraries[0].segments.length - 1]?.arrival.iataCode}
                  {pricing.itineraries[1] && (
                    <span className="text-gray-400"> + Return</span>
                  )}
                </p>
                <p className="text-xs text-gray-400">
                  {pricing.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin} · {adults + children + infants} pax
                </p>
              </div>
              <p className="text-2xl font-extrabold text-indigo-600">{fmtPrice(pricing.price)}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 text-center">
            To book, visit the airline website or a booking platform like Google Flights, Skyscanner, or Expedia.
          </p>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && offers.length === 0 && !error && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">✈️</div>
          <p className="text-gray-500 text-sm">Search for flights above to compare prices across airlines</p>
          <p className="text-gray-400 text-xs mt-2">Powered by Amadeus · Real-time fares</p>
        </div>
      )}

      <footer className="mt-12 text-center text-xs text-gray-400">
        <span className="inline-block h-px w-8 bg-gray-200 mr-2"/>
        compare by Thakers · For personal use only
        <span className="inline-block h-px w-8 bg-gray-200 ml-2"/>
      </footer>
    </div>
  );
}
