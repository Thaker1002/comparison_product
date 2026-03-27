import axios from "axios";

// ─── Amadeus Config ────────────────────────────────────────────────────────────
const AMADEUS_CLIENT_ID     = process.env.AMADEUS_CLIENT_ID     || "";
const AMADEUS_CLIENT_SECRET = process.env.AMADEUS_CLIENT_SECRET || "";
const AMADEUS_BASE_URL      = process.env.AMADEUS_BASE_URL      || "https://test.api.amadeus.com";

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
  app.get("/api/flights/locations", async (req, res) => {
    const keyword = (req.query.keyword || "").trim();
    if (keyword.length < 2) return res.json([]);

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
        timeout: 10000,
      });

      const data = resp.data?.data || [];
      const results = data.map(loc => ({
        iataCode:    loc.iataCode || "",
        name:        loc.name    || "",
        cityName:    loc.address?.cityName    || "",
        countryCode: loc.address?.countryCode || "",
        subType:     loc.subType || "AIRPORT",
      }));
      return res.json(results);
    } catch (err) {
      console.error("Amadeus locations error:", err?.response?.data || err.message);
      return res.status(500).json({ error: "Location search failed" });
    }
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
      console.error("Amadeus search error:", detail);
      return res.status(status).json({ error: "Flight search failed", detail });
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
