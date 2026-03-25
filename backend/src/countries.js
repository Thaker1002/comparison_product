// ─── Multi-Country Marketplace Configuration ─────────────────────────────────
// Each country has its own set of marketplaces, currency, and locale settings.

export const COUNTRIES = {
  TH: {
    code: "TH",
    name: "Thailand",
    flag: "🇹🇭",
    currency: "THB",
    languages: ["th", "en"],
    marketplaces: [
      {
        id: "shopee",
        name: "Shopee",
        domain: "shopee.co.th",
        color: "#EE4D2D",
        logo: "https://cf.shopee.co.th/file/sg-11134004-23030-sivjw8u2vcnvdf",
        searchUrl: (q) =>
          `https://shopee.co.th/search?keyword=${encodeURIComponent(q)}&sortBy=relevancy`,
      },
      {
        id: "lazada",
        name: "Lazada",
        domain: "lazada.co.th",
        color: "#0F146D",
        logo: "https://lzd-img-global.slatic.net/g/tps/tfs/TB1e_d8cOqAXuNjy1XdXXaYcVXa-234-58.png",
        searchUrl: (q) =>
          `https://www.lazada.co.th/catalog/?q=${encodeURIComponent(q)}&_keyori=ss&from=input`,
      },
      {
        id: "jdcentral",
        name: "JD Central",
        domain: "jdcentral.co.th",
        color: "#CC0000",
        logo: "https://www.jdcentral.co.th/static/version1/frontend/jdcth/default/images/logo.svg",
        searchUrl: (q) =>
          `https://www.jdcentral.co.th/c/search?keyword=${encodeURIComponent(q)}`,
      },
      {
        id: "bigc",
        name: "Big C",
        domain: "bigc.co.th",
        color: "#F5A623",
        logo: "https://www.bigc.co.th/static/version1/frontend/bigc/default/images/logo.png",
        searchUrl: (q) =>
          `https://www.bigc.co.th/catalogsearch/result/?q=${encodeURIComponent(q)}`,
      },
      {
        id: "central",
        name: "Central",
        domain: "central.co.th",
        color: "#B22222",
        logo: "https://www.central.co.th/media/logo/default/central_logo.png",
        searchUrl: (q) =>
          `https://www.central.co.th/en/search?q=${encodeURIComponent(q)}`,
      },
      {
        id: "makro",
        name: "Makro",
        domain: "makro.pro",
        color: "#0057A8",
        logo: "https://makro.pro/static/version1/frontend/siam-makro/th/images/logo.svg",
        searchUrl: (q) =>
          `https://www.makro.pro/catalogsearch/result/?q=${encodeURIComponent(q)}`,
      },
    ],
  },

  IN: {
    code: "IN",
    name: "India",
    flag: "🇮🇳",
    currency: "INR",
    languages: ["hi", "en"],
    marketplaces: [
      {
        id: "amazon-in",
        name: "Amazon India",
        domain: "amazon.in",
        color: "#FF9900",
        logo: "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg",
        searchUrl: (q) =>
          `https://www.amazon.in/s?k=${encodeURIComponent(q)}`,
      },
      {
        id: "flipkart",
        name: "Flipkart",
        domain: "flipkart.com",
        color: "#2874F0",
        logo: "https://static-assets-web.flixcart.com/fk-p-linchpin-web/fk-cp-zion/img/flipkart-plus_8d85f4.png",
        searchUrl: (q) =>
          `https://www.flipkart.com/search?q=${encodeURIComponent(q)}`,
      },
      {
        id: "myntra",
        name: "Myntra",
        domain: "myntra.com",
        color: "#FF3F6C",
        logo: "https://constant.myntassets.com/web/assets/img/logo_2021.png",
        searchUrl: (q) =>
          `https://www.myntra.com/${encodeURIComponent(q)}`,
      },
      {
        id: "jiomart",
        name: "JioMart",
        domain: "jiomart.com",
        color: "#0078AD",
        logo: "https://www.jiomart.com/assets/ds2web/jds-icons/jiomart-logo.svg",
        searchUrl: (q) =>
          `https://www.jiomart.com/search/${encodeURIComponent(q)}`,
      },
      {
        id: "snapdeal",
        name: "Snapdeal",
        domain: "snapdeal.com",
        color: "#E40046",
        logo: "https://i1.sdlcdn.com/img/logo/sdLogoPrimary.png",
        searchUrl: (q) =>
          `https://www.snapdeal.com/search?keyword=${encodeURIComponent(q)}`,
      },
      {
        id: "croma",
        name: "Croma",
        domain: "croma.com",
        color: "#0F7D1C",
        logo: "https://media-ik.croma.com/prod/https://media.croma.com/image/upload/v1637759004/Croma%20Assets/CMS/Category%20icon/Final%20Category%20icon/croma-logo.png",
        searchUrl: (q) =>
          `https://www.croma.com/searchB?q=${encodeURIComponent(q)}`,
      },
    ],
  },

  US: {
    code: "US",
    name: "United States",
    flag: "🇺🇸",
    currency: "USD",
    languages: ["en"],
    marketplaces: [
      {
        id: "amazon-us",
        name: "Amazon",
        domain: "amazon.com",
        color: "#FF9900",
        logo: "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg",
        searchUrl: (q) =>
          `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
      },
      {
        id: "walmart",
        name: "Walmart",
        domain: "walmart.com",
        color: "#0071CE",
        logo: "https://i5.walmartimages.com/dfw/63fd9f59-b3e1/7a569e53-f29a-4c3d-bfaf-6f7a158bfadd/v1/walmartLogo.svg",
        searchUrl: (q) =>
          `https://www.walmart.com/search?q=${encodeURIComponent(q)}`,
      },
      {
        id: "bestbuy",
        name: "Best Buy",
        domain: "bestbuy.com",
        color: "#0046BE",
        logo: "https://pisces.bbystatic.com/image2/BestBuy_US/Gallery/BestBuy_Logo-190icons.png",
        searchUrl: (q) =>
          `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(q)}`,
      },
      {
        id: "target",
        name: "Target",
        domain: "target.com",
        color: "#CC0000",
        logo: "https://target.scene7.com/is/content/Target/GUEST_44ec3e4d-8e77-4069-8e28-8a7a9ea5e2e3",
        searchUrl: (q) =>
          `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}`,
      },
      {
        id: "ebay",
        name: "eBay",
        domain: "ebay.com",
        color: "#E53238",
        logo: "https://ir.ebaystatic.com/cr/v/c01/s_1x2.png",
        searchUrl: (q) =>
          `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`,
      },
      {
        id: "costco",
        name: "Costco",
        domain: "costco.com",
        color: "#E31837",
        logo: "https://www.costco.com/wcsstore/CostcoGLOBALSAS/images/Costco_Logo.png",
        searchUrl: (q) =>
          `https://www.costco.com/CatalogSearch?keyword=${encodeURIComponent(q)}`,
      },
    ],
  },

  UK: {
    code: "UK",
    name: "United Kingdom",
    flag: "🇬🇧",
    currency: "GBP",
    languages: ["en"],
    marketplaces: [
      {
        id: "amazon-uk",
        name: "Amazon UK",
        domain: "amazon.co.uk",
        color: "#FF9900",
        logo: "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg",
        searchUrl: (q) =>
          `https://www.amazon.co.uk/s?k=${encodeURIComponent(q)}`,
      },
      {
        id: "argos",
        name: "Argos",
        domain: "argos.co.uk",
        color: "#D82B2B",
        logo: "https://media.4rgos.it/s/Argos/argos-logo",
        searchUrl: (q) =>
          `https://www.argos.co.uk/search/${encodeURIComponent(q)}/`,
      },
      {
        id: "currys",
        name: "Currys",
        domain: "currys.co.uk",
        color: "#2D0A6E",
        logo: "https://media.currys.biz/i/currysprod/m003_currys_logo",
        searchUrl: (q) =>
          `https://www.currys.co.uk/search/${encodeURIComponent(q)}`,
      },
      {
        id: "tesco",
        name: "Tesco",
        domain: "tesco.com",
        color: "#00539F",
        logo: "https://www.tesco.com/groceries/assets/images/tesco-logo.png",
        searchUrl: (q) =>
          `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(q)}`,
      },
      {
        id: "johnlewis",
        name: "John Lewis",
        domain: "johnlewis.com",
        color: "#002C1B",
        logo: "https://www.johnlewis.com/content/dam/jl/logos/john-lewis-logo.png",
        searchUrl: (q) =>
          `https://www.johnlewis.com/search?search-term=${encodeURIComponent(q)}`,
      },
      {
        id: "ebay-uk",
        name: "eBay UK",
        domain: "ebay.co.uk",
        color: "#E53238",
        logo: "https://ir.ebaystatic.com/cr/v/c01/s_1x2.png",
        searchUrl: (q) =>
          `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(q)}`,
      },
    ],
  },

  SG: {
    code: "SG",
    name: "Singapore",
    flag: "🇸🇬",
    currency: "SGD",
    languages: ["en", "zh"],
    marketplaces: [
      {
        id: "shopee-sg",
        name: "Shopee SG",
        domain: "shopee.sg",
        color: "#EE4D2D",
        logo: "https://cf.shopee.sg/file/sg-11134004-23030-sivjw8u2vcnvdf",
        searchUrl: (q) =>
          `https://shopee.sg/search?keyword=${encodeURIComponent(q)}`,
      },
      {
        id: "lazada-sg",
        name: "Lazada SG",
        domain: "lazada.sg",
        color: "#0F146D",
        logo: "https://lzd-img-global.slatic.net/g/tps/tfs/TB1e_d8cOqAXuNjy1XdXXaYcVXa-234-58.png",
        searchUrl: (q) =>
          `https://www.lazada.sg/catalog/?q=${encodeURIComponent(q)}`,
      },
      {
        id: "amazon-sg",
        name: "Amazon SG",
        domain: "amazon.sg",
        color: "#FF9900",
        logo: "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg",
        searchUrl: (q) =>
          `https://www.amazon.sg/s?k=${encodeURIComponent(q)}`,
      },
      {
        id: "fairprice",
        name: "FairPrice",
        domain: "fairprice.com.sg",
        color: "#0066CC",
        logo: "https://media.nedigital.sg/fairprice/logo/fairprice-logo.png",
        searchUrl: (q) =>
          `https://www.fairprice.com.sg/search?query=${encodeURIComponent(q)}`,
      },
      {
        id: "courts",
        name: "COURTS",
        domain: "courts.com.sg",
        color: "#EC1C24",
        logo: "https://www.courts.com.sg/media/logo/default/courts-logo.svg",
        searchUrl: (q) =>
          `https://www.courts.com.sg/catalogsearch/result/?q=${encodeURIComponent(q)}`,
      },
    ],
  },

  MY: {
    code: "MY",
    name: "Malaysia",
    flag: "🇲🇾",
    currency: "MYR",
    languages: ["ms", "en"],
    marketplaces: [
      {
        id: "shopee-my",
        name: "Shopee MY",
        domain: "shopee.com.my",
        color: "#EE4D2D",
        logo: "https://cf.shopee.com.my/file/sg-11134004-23030-sivjw8u2vcnvdf",
        searchUrl: (q) =>
          `https://shopee.com.my/search?keyword=${encodeURIComponent(q)}`,
      },
      {
        id: "lazada-my",
        name: "Lazada MY",
        domain: "lazada.com.my",
        color: "#0F146D",
        logo: "https://lzd-img-global.slatic.net/g/tps/tfs/TB1e_d8cOqAXuNjy1XdXXaYcVXa-234-58.png",
        searchUrl: (q) =>
          `https://www.lazada.com.my/catalog/?q=${encodeURIComponent(q)}`,
      },
      {
        id: "pgmall",
        name: "PG Mall",
        domain: "pgmall.my",
        color: "#D81E05",
        logo: "https://www.pgmall.my/assets/images/logo.png",
        searchUrl: (q) =>
          `https://www.pgmall.my/search?keyword=${encodeURIComponent(q)}`,
      },
    ],
  },

  JP: {
    code: "JP",
    name: "Japan",
    flag: "🇯🇵",
    currency: "JPY",
    languages: ["ja", "en"],
    marketplaces: [
      {
        id: "amazon-jp",
        name: "Amazon Japan",
        domain: "amazon.co.jp",
        color: "#FF9900",
        logo: "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg",
        searchUrl: (q) =>
          `https://www.amazon.co.jp/s?k=${encodeURIComponent(q)}`,
      },
      {
        id: "rakuten",
        name: "Rakuten",
        domain: "search.rakuten.co.jp",
        color: "#BF0000",
        logo: "https://r.r10s.jp/com/img/home/top/rakuten-logo.svg",
        searchUrl: (q) =>
          `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/`,
      },
      {
        id: "yahoo-jp",
        name: "Yahoo Shopping JP",
        domain: "shopping.yahoo.co.jp",
        color: "#FF0033",
        logo: "https://s.yimg.jp/images/shopping/pc/top/v2/logo.png",
        searchUrl: (q) =>
          `https://shopping.yahoo.co.jp/search?p=${encodeURIComponent(q)}`,
      },
      {
        id: "yodobashi",
        name: "Yodobashi",
        domain: "yodobashi.com",
        color: "#CC0000",
        logo: "https://www.yodobashi.com/ec/images/logo.gif",
        searchUrl: (q) =>
          `https://www.yodobashi.com/search/?word=${encodeURIComponent(q)}`,
      },
    ],
  },

  AE: {
    code: "AE",
    name: "UAE",
    flag: "🇦🇪",
    currency: "AED",
    languages: ["ar", "en"],
    marketplaces: [
      {
        id: "amazon-ae",
        name: "Amazon UAE",
        domain: "amazon.ae",
        color: "#FF9900",
        logo: "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg",
        searchUrl: (q) =>
          `https://www.amazon.ae/s?k=${encodeURIComponent(q)}`,
      },
      {
        id: "noon",
        name: "Noon",
        domain: "noon.com",
        color: "#FEEE00",
        logo: "https://f.nooncdn.com/s/app/com/noon/design-system/noon-logo.svg",
        searchUrl: (q) =>
          `https://www.noon.com/uae-en/search/?q=${encodeURIComponent(q)}`,
      },
      {
        id: "carrefour-ae",
        name: "Carrefour UAE",
        domain: "carrefouruae.com",
        color: "#004E98",
        logo: "https://www.carrefouruae.com/mafuae/en/images/carrefour-logo.svg",
        searchUrl: (q) =>
          `https://www.carrefouruae.com/mafuae/en/v4/search?keyword=${encodeURIComponent(q)}`,
      },
      {
        id: "lulu-ae",
        name: "Lulu Hypermarket",
        domain: "luluhypermarket.com",
        color: "#009933",
        logo: "https://www.luluhypermarket.com/medias/lulu-logo.svg",
        searchUrl: (q) =>
          `https://www.luluhypermarket.com/en-ae/search?q=${encodeURIComponent(q)}`,
      },
    ],
  },

  CA: {
    code: "CA",
    name: "Canada",
    flag: "🇨🇦",
    currency: "CAD",
    languages: ["en", "fr"],
    marketplaces: [
      {
        id: "amazon-ca",
        name: "Amazon Canada",
        domain: "amazon.ca",
        color: "#FF9900",
        logo: "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg",
        searchUrl: (q) =>
          `https://www.amazon.ca/s?k=${encodeURIComponent(q)}`,
      },
      {
        id: "walmart-ca",
        name: "Walmart Canada",
        domain: "walmart.ca",
        color: "#0071DC",
        logo: "https://www.walmart.ca/favicon.ico",
        searchUrl: (q) =>
          `https://www.walmart.ca/search?q=${encodeURIComponent(q)}`,
      },
      {
        id: "bestbuy-ca",
        name: "Best Buy Canada",
        domain: "bestbuy.ca",
        color: "#0046BE",
        logo: "https://www.bestbuy.ca/favicon.ico",
        searchUrl: (q) =>
          `https://www.bestbuy.ca/en-ca/search?search=${encodeURIComponent(q)}`,
      },
      {
        id: "canadiantire",
        name: "Canadian Tire",
        domain: "canadiantire.ca",
        color: "#D71920",
        logo: "https://www.canadiantire.ca/favicon.ico",
        searchUrl: (q) =>
          `https://www.canadiantire.ca/en/search-results.html?q=${encodeURIComponent(q)}`,
      },
    ],
  },
  TR: {
    code: "TR",
    name: "Turkey",
    flag: "🇹🇷",
    currency: "TRY",
    languages: ["tr"],
    marketplaces: [
      {
        id: "trendyol",
        name: "Trendyol",
        domain: "trendyol.com",
        color: "#F27A1A",
        logo: "https://www.trendyol.com/favicon.ico",
        searchUrl: (q) =>
          `https://www.trendyol.com/sr?q=${encodeURIComponent(q)}`,
      },
      {
        id: "hepsiburada",
        name: "Hepsiburada",
        domain: "hepsiburada.com",
        color: "#FF6000",
        logo: "https://www.hepsiburada.com/favicon.ico",
        searchUrl: (q) =>
          `https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}`,
      },
      {
        id: "n11",
        name: "n11.com",
        domain: "n11.com",
        color: "#7B2D8E",
        logo: "https://www.n11.com/favicon.ico",
        searchUrl: (q) =>
          `https://www.n11.com/arama?q=${encodeURIComponent(q)}`,
      },
      {
        id: "amazon-tr",
        name: "Amazon Turkey",
        domain: "amazon.com.tr",
        color: "#FF9900",
        logo: "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg",
        searchUrl: (q) =>
          `https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}`,
      },
      {
        id: "ciceksepeti",
        name: "Çiçeksepeti",
        domain: "ciceksepeti.com",
        color: "#E3007E",
        logo: "https://www.ciceksepeti.com/favicon.ico",
        searchUrl: (q) =>
          `https://www.ciceksepeti.com/arama?q=${encodeURIComponent(q)}`,
      },
    ],
  },
};

// Helper to get all country codes
export function getCountryCodes() {
  return Object.keys(COUNTRIES);
}

// Helper to get country config by code
export function getCountry(code) {
  return COUNTRIES[code?.toUpperCase()] || null;
}

// Helper to list countries for the API
export function listCountries() {
  return Object.values(COUNTRIES).map(({ code, name, flag, currency, marketplaces }) => ({
    code,
    name,
    flag,
    currency,
    marketplaceCount: marketplaces.length,
    marketplaces: marketplaces.map(({ id, name, domain, color, logo }) => ({
      id,
      name,
      domain,
      color,
      logo,
    })),
  }));
}
