import axios from "axios";
import { searchAirportsLocal } from "./airports-local.js";

// ─── Amadeus Config ────────────────────────────────────────────────────────────
const AMADEUS_CLIENT_ID     = process.env.AMADEUS_CLIENT_ID     || "";
const AMADEUS_CLIENT_SECRET = process.env.AMADEUS_CLIENT_SECRET || "";
const AMADEUS_BASE_URL      = process.env.AMADEUS_BASE_URL      || "https://test.api.amadeus.com";

// ─── SerpAPI Config ────────────────────────────────────────────────────────────
const SERPAPI_KEY = process.env.SERPAPI_KEY || "";

// ─── RapidAPI Google Flights Config ───────────────────────────────────────────
const RAPIDAPI_FLIGHTS_KEY  = process.env.RAPIDAPI_FLIGHTS_KEY  || "";
const RAPIDAPI_FLIGHTS_HOST = "google-flights2.p.rapidapi.com";

// ─── SerpAPI Google Flights helpers ──────────────────────────────────────────
function minsToDuration(mins) {
  if (!mins) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
}

function serpTimeToISO(t) {
  if (!t) return "";
  return t.replace(" ", "T") + ":00";
}

function parseCarrier(flightNumber) {
  const m = (flightNumber || "").match(/^([A-Z0-9]{2})\s*(\d+)$/);
  return m ? { code: m[1], number: m[2] } : { code: "", number: flightNumber || "" };
}

const TRAVEL_CLASS_MAP = {
  ECONOMY: 1, PREMIUM_ECONOMY: 2, BUSINESS: 3, FIRST: 4,
};

function serpFlightToOffer(item, idx, currency) {
  const flights = item.flights || [];
  const segments = flights.map(f => {
    const { code, number } = parseCarrier(f.flight_number);
    const durMins = f.duration || 0;
    return {
      departure:  { iataCode: f.departure_airport?.id || "", terminal: "—", at: serpTimeToISO(f.departure_airport?.time) },
      arrival:    { iataCode: f.arrival_airport?.id   || "", terminal: "—", at: serpTimeToISO(f.arrival_airport?.time)   },
      carrierCode:         code,
      carrierName:         f.airline || code,
      operatingCarrier:    f.airline || code,
      operatingCarrierCode: code,
      flightNumber:        number,
      aircraft:            f.airplane || "",
      aircraftCode:        "",
      duration:            minsToDuration(durMins),
      rawDuration:         `PT${Math.floor(durMins/60)}H${durMins%60}M`,
      numberOfStops:       0,
    };
  });

  const totalMins   = item.total_duration || 0;
  const price       = String(item.price || 0);
  const isRoundTrip = (item.type || "").toLowerCase().includes("round");

  // For round trip SerpAPI may return two itineraries inside "flights" separated
  // by a return leg. For now put everything in one itinerary (same as Amadeus oneWay).
  return {
    id:     String(idx),
    source: "SERPAPI",
    oneWay: !isRoundTrip,
    price:  { total: price, currency: currency || "USD", grandTotal: price },
    itineraries: [{
      duration:    minsToDuration(totalMins),
      rawDuration: `PT${Math.floor(totalMins/60)}H${totalMins%60}M`,
      segments,
    }],
    travelerPricings: [],
    validatingAirlineCodes: segments[0]?.carrierCode ? [segments[0].carrierCode] : [],
    _raw: {},
  };
}

async function searchFlightsViaSerpAPI({ origin, destination, departureDate, returnDate, adults, travelClass, nonStop, max, currency }) {
  if (!SERPAPI_KEY) throw new Error("SERPAPI_KEY not configured");

  const isRoundTrip = !!returnDate;
  const params = {
    engine:         "google_flights",
    departure_id:   origin.toUpperCase(),
    arrival_id:     destination.toUpperCase(),
    outbound_date:  departureDate,
    type:           isRoundTrip ? "1" : "2",
    adults:         String(adults || 1),
    travel_class:   String(TRAVEL_CLASS_MAP[travelClass?.toUpperCase()] || 1),
    currency:       currency || "USD",
    api_key:        SERPAPI_KEY,
    hl:             "en",
  };
  if (isRoundTrip) params.return_date = returnDate;

  const resp = await axios.get("https://serpapi.com/search.json", { params, timeout: 20000 });

  let rawFlights = [
    ...(resp.data.best_flights   || []),
    ...(resp.data.other_flights  || []),
  ];

  if (nonStop) {
    rawFlights = rawFlights.filter(f => !f.layovers?.length);
  }

  rawFlights = rawFlights.slice(0, max || 15);

  const cur = resp.data.search_parameters?.currency || currency || "USD";
  return rawFlights.map((f, i) => serpFlightToOffer(f, i, cur));
}

// ─── RapidAPI Google Flights search ───────────────────────────────────────────
async function searchFlightsViaRapidAPI({ origin, destination, departureDate, returnDate, adults, travelClass, nonStop, max, currency }) {
  if (!RAPIDAPI_FLIGHTS_KEY) throw new Error("RAPIDAPI_FLIGHTS_KEY not configured");

  const isRoundTrip = !!returnDate;
  const params = {
    departure_id:   origin.toUpperCase(),
    arrival_id:     destination.toUpperCase(),
    outbound_date:  departureDate,
    adults:         String(adults || 1),
    travel_class:   travelClass?.toUpperCase() || "ECONOMY",
    currency:       currency || "USD",
    language_code:  "en-US",
    country_code:   "US",
    show_hidden:    "1",
    search_type:    "best",
  };
  if (isRoundTrip) params.return_date = returnDate;

  const resp = await axios.get(
    `https://${RAPIDAPI_FLIGHTS_HOST}/api/v1/searchFlights`,
    {
      params,
      headers: {
        "x-rapidapi-host": RAPIDAPI_FLIGHTS_HOST,
        "x-rapidapi-key":  RAPIDAPI_FLIGHTS_KEY,
        "Content-Type":    "application/json",
      },
      timeout: 20000,
    }
  );

  // RapidAPI google-flights2 returns the same shape as SerpAPI google_flights
  let rawFlights = [
    ...(resp.data?.best_flights   || []),
    ...(resp.data?.other_flights  || []),
    // Some versions nest under data.data
    ...(resp.data?.data?.best_flights  || []),
    ...(resp.data?.data?.other_flights || []),
  ];

  if (nonStop) rawFlights = rawFlights.filter(f => !f.layovers?.length);
  rawFlights = rawFlights.slice(0, max || 15);

  const cur = resp.data?.search_parameters?.currency
    || resp.data?.data?.search_parameters?.currency
    || currency || "USD";

  return rawFlights.map((f, i) => ({
    ...serpFlightToOffer(f, i, cur),
    source: "RAPIDAPI",
  }));
}

// ─── Token Cache ──────────────────────────────────────────────────────────────
let _tokenCache = { access_token: null, expires_at: 0 };

async function getAmadeusToken() {
  const now = Date.now() / 1000;
  if (_tokenCache.access_token && _tokenCache.expires_at > now + 30) {
    return _tokenCache.access_token;
  }
  const resp = await axios.post(
    `${AMADEUS_BASE_URL}/v1/security/oauth2/token`,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: AMADEUS_CLIENT_ID,
      client_secret: AMADEUS_CLIENT_SECRET,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 }
  );
  _tokenCache.access_token = resp.data.access_token;
  _tokenCache.expires_at   = now + (resp.data.expires_in || 1799);
  return _tokenCache.access_token;
}

async function amadeusHeaders() {
  const token = await getAmadeusToken();
  return { Authorization: `Bearer ${token}` };
}

// ─── Duration helper ──────────────────────────────────────────────────────────
function fmtDuration(iso) {
  if (!iso) return "";
  const h = iso.match(/(\d+)H/);
  const m = iso.match(/(\d+)M/);
  return [h ? `${h[1]}h` : "", m ? `${m[1]}m` : ""].filter(Boolean).join(" ");
}

// ─── Process raw Amadeus offer ────────────────────────────────────────────────
function processOffer(offer, dictionaries) {
  const carriers    = dictionaries?.carriers    || {};
  const aircraftMap = dictionaries?.aircraft    || {};

  const itineraries = (offer.itineraries || []).map(itin => ({
    duration: fmtDuration(itin.duration),
    rawDuration: itin.duration,
    segments: (itin.segments || []).map(seg => {
      const cc  = seg.carrierCode || "";
      const occ = seg.operating?.carrierCode || cc;
      return {
        departure:  { iataCode: seg.departure?.iataCode, terminal: seg.departure?.terminal || "—", at: seg.departure?.at },
        arrival:    { iataCode: seg.arrival?.iataCode,   terminal: seg.arrival?.terminal   || "—", at: seg.arrival?.at   },
        carrierCode:        cc,
        carrierName:        carriers[cc]  || cc,
        operatingCarrier:   carriers[occ] || occ,
        operatingCarrierCode: occ,
        flightNumber:  seg.number || "",
        aircraft:      aircraftMap[seg.aircraft?.code || ""] || seg.aircraft?.code || "",
        aircraftCode:  seg.aircraft?.code || "",
        duration:      fmtDuration(seg.duration),
        rawDuration:   seg.duration,
        numberOfStops: seg.numberOfStops || 0,
      };
    }),
  }));

  const travelerPricings = (offer.travelerPricings || []).map(tp => ({
    travelerId:   tp.travelerId,
    travelerType: tp.travelerType,
    price:        tp.price,
    fareDetailsBySegment: (tp.fareDetailsBySegment || []).map(fds => ({
      segmentId:   fds.segmentId,
      cabin:       fds.cabin || "",
      fareBasis:   fds.fareBasis || "",
      brandedFare: fds.brandedFare || "",
      class:       fds.class || "",
      includedCheckedBags: {
        weight:     fds.includedCheckedBags?.weight     ?? null,
        weightUnit: fds.includedCheckedBags?.weightUnit || "KG",
        quantity:   fds.includedCheckedBags?.quantity   ?? null,
      },
    })),
  }));

  return {
    id:        offer.id,
    source:    offer.source,
    oneWay:    offer.oneWay,
    price:     offer.price,
    itineraries,
    travelerPricings,
    validatingAirlineCodes: offer.validatingAirlineCodes || [],
    _raw: offer,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────
export function registerFlightRoutes(app) {

  // GET /api/flights/locations?keyword=bkk
  // Serves local offline results immediately; Amadeus is not required
  app.get("/api/flights/locations", async (req, res) => {
    const keyword = (req.query.keyword || "").trim();
    if (keyword.length < 2) return res.json([]);

    // 1. Instant local search (always works)
    const local = searchAirportsLocal(keyword, 10);

    // 2. Try to augment with Amadeus (silently skip on any error)
    let amadeusExtra = [];
    try {
      const headers = await amadeusHeaders();
      const resp = await axios.get(`${AMADEUS_BASE_URL}/v1/reference-data/locations`, {
        headers,
        params: {
          subType: "AIRPORT,CITY",
          keyword,
          "page[limit]": 8,
          sort: "analytics.travelers.score",
          view: "LIGHT",
        },
        timeout: 6000,
      });
      const localCodes = new Set(local.map(a => a.iataCode));
      amadeusExtra = (resp.data?.data || [])
        .map(loc => ({
          iataCode:    loc.iataCode || "",
          name:        loc.name    || "",
          cityName:    loc.address?.cityName    || "",
          countryCode: loc.address?.countryCode || "",
          subType:     loc.subType || "AIRPORT",
        }))
        .filter(a => a.iataCode && !localCodes.has(a.iataCode));
    } catch (_) {
      // Amadeus unavailable — local results are sufficient
    }

    const combined = [...local, ...amadeusExtra].slice(0, 10);
    return res.json(combined);
  });

  // POST /api/flights/search
  app.post("/api/flights/search", async (req, res) => {
    const {
      origin, destination, departureDate, returnDate,
      adults = 1, children = 0, infants = 0,
      travelClass = "ECONOMY", nonStop = false, max = 15,
    } = req.body;

    if (!origin || !destination || !departureDate) {
      return res.status(400).json({ error: "origin, destination and departureDate are required" });
    }

    try {
      const headers = await amadeusHeaders();
      const params = {
        originLocationCode:      origin.toUpperCase(),
        destinationLocationCode: destination.toUpperCase(),
        departureDate,
        adults:      Number(adults),
        travelClass: travelClass.toUpperCase(),
        nonStop:     String(nonStop).toLowerCase(),
        max:         Number(max),
        currencyCode: "USD",
      };
      if (returnDate)        params.returnDate = returnDate;
      if (Number(children))  params.children   = Number(children);
      if (Number(infants))   params.infants    = Number(infants);

      const resp = await axios.get(`${AMADEUS_BASE_URL}/v2/shopping/flight-offers`, {
        headers, params, timeout: 30000,
      });

      let offers       = resp.data?.data        || [];
      const dictionaries = resp.data?.dictionaries || {};

      let processed = offers.map(o => processOffer(o, dictionaries));

      // Enforce non-stop server-side (Amadeus param is advisory)
      if (nonStop) {
        processed = processed.filter(o =>
          o.itineraries.every(itin =>
            itin.segments.length === 1 && itin.segments.every(s => s.numberOfStops === 0)
          )
        );
      }

      return res.json({ offers: processed, dictionaries });
    } catch (err) {
      const status = err?.response?.status || 500;
      const detail = err?.response?.data?.errors || [{ detail: err.message }];
      console.error("Amadeus search error (status=%d):", status, detail);

      // ── 1. Try RapidAPI Google Flights ────────────────────────────────────
      if (RAPIDAPI_FLIGHTS_KEY) {
        try {
          console.log(`Amadeus error ${status} — trying RapidAPI Google Flights`);
          const offers = await searchFlightsViaRapidAPI({
            origin, destination, departureDate, returnDate,
            adults: Number(adults), travelClass, nonStop, max: Number(max),
            currency: "USD",
          });
          if (offers.length > 0) {
            return res.json({ offers, dictionaries: {}, source: "rapidapi" });
          }
          console.log("RapidAPI returned 0 flights — trying SerpAPI next");
        } catch (rapidErr) {
          console.error("RapidAPI fallback error:", rapidErr.message);
        }
      }

      // ── 2. Try SerpAPI Google Flights ────────────────────────────────────
      if (SERPAPI_KEY) {
        try {
          console.log("Trying SerpAPI Google Flights fallback");
          const offers = await searchFlightsViaSerpAPI({
            origin, destination, departureDate, returnDate,
            adults: Number(adults), travelClass, nonStop, max: Number(max),
            currency: "USD",
          });
          if (offers.length > 0) {
            return res.json({ offers, dictionaries: {}, source: "serpapi" });
          }
          console.log("SerpAPI also returned 0 flights — returning 502");
        } catch (serpErr) {
          console.error("SerpAPI fallback error:", serpErr.message);
        }
      }

      return res.status(502).json({ error: "Flight search unavailable", detail });
    }
  });

  // POST /api/flights/price  (confirm price for a specific offer)
  app.post("/api/flights/price", async (req, res) => {
    const { flightOffer } = req.body;
    if (!flightOffer) return res.status(400).json({ error: "flightOffer is required" });

    try {
      const headers = await amadeusHeaders();
      const resp = await axios.post(
        `${AMADEUS_BASE_URL}/v1/shopping/flight-offers/pricing`,
        { data: { type: "flight-offers-pricing", flightOffers: [flightOffer] } },
        {
          headers: { ...headers, "Content-Type": "application/json", "X-HTTP-Method-Override": "GET" },
          params:  { include: "detailed-fare-rules", forceClass: "false" },
          timeout: 30000,
        }
      );

      const pricedOffers = (resp.data?.data?.flightOffers || []).map(o =>
        processOffer(o, resp.data?.dictionaries || {})
      );
      return res.json({ pricedOffers, dictionaries: resp.data?.dictionaries || {} });
    } catch (err) {
      const status = err?.response?.status || 500;
      const detail = err?.response?.data?.errors || [{ detail: err.message }];
      return res.status(status).json({ error: "Pricing failed", detail });
    }
  });
}
