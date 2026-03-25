# 🛒 Thaker's Quest Thailand — Smart Product Price Comparison

> Compare product prices across **Shopee**, **Lazada**, **JD Central**, **Big C**, **Central**, and **Makro** — all powered by **Firecrawl AI** web scraping.

![Thaker's Quest Thailand](https://img.shields.io/badge/Thailand-🇹🇭-red) ![Firecrawl](https://img.shields.io/badge/Powered%20by-Firecrawl-orange) ![React](https://img.shields.io/badge/React-18-blue) ![TanStack Query](https://img.shields.io/badge/TanStack%20Query-v5-purple) ![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-latest-black)

---

## ✨ Features

- 📸 **Image Upload** — Upload a product photo (drag & drop, paste from clipboard)
- 🔍 **Multi-Marketplace Search** — Simultaneously search 6 Thai marketplaces
- 🤖 **AI-Powered Extraction** — Firecrawl extracts structured product data with AI
- 📊 **Price Comparison Chart** — Visual bar chart comparing min/avg/max prices
- 🏷️ **Product Details** — Name, price, capacity, quantity, brand, rating, reviews, seller
- 💰 **Best Price Indicator** — Instantly highlights the cheapest option
- 📋 **3 View Modes** — Grid, List, and Compare (table) views
- 🌙 **Dark Mode** — Beautiful dark UI by default with light mode toggle
- ⚡ **Real-time** — Live scraping via Firecrawl API
- 🇹🇭 **Thailand-focused** — Thai Baht pricing, Thai marketplaces

---

## 🏪 Supported Marketplaces

| Marketplace | Domain | Type |
|-------------|--------|------|
| 🟠 Shopee | shopee.co.th | E-commerce |
| 🔵 Lazada | lazada.co.th | E-commerce |
| 🔴 JD Central | jdcentral.co.th | E-commerce |
| 🟡 Big C | bigc.co.th | Supermarket |
| 🏬 Central | central.co.th | Department Store |
| 🏪 Makro | makro.pro | Wholesale |

---

## 🛠️ Tech Stack

### Frontend
- **React 18** + **Vite** + **TypeScript**
- **TanStack Query v5** — Server state management & mutations
- **shadcn/ui** — Beautiful, accessible UI components
- **Tailwind CSS v3** — Utility-first styling with custom animations
- **Recharts** — Price comparison bar charts
- **Framer Motion** — Smooth animations
- **react-dropzone** — Drag & drop image upload
- **lucide-react** — Icon library

### Backend
- **Node.js** + **Express** — REST API
- **Firecrawl JS SDK** — AI-powered web scraping
- **Multer** — Image upload handling
- **CORS** — Cross-origin resource sharing

---

## 📁 Project Structure

```
product_comparision/
├── frontend/                    # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/              # shadcn/ui components
│   │   │   │   ├── button.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── badge.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── skeleton.tsx
│   │   │   │   ├── tabs.tsx
│   │   │   │   ├── select.tsx
│   │   │   │   ├── label.tsx
│   │   │   │   └── progress.tsx
│   │   │   ├── Header.tsx       # App header with theme toggle
│   │   │   ├── ImageUpload.tsx  # Drag & drop image uploader
│   │   │   ├── SearchBar.tsx    # Search input + filters
│   │   │   ├── ProductCard.tsx  # Individual product card
│   │   │   └── ResultsGrid.tsx  # Results grid + chart + table
│   │   ├── lib/
│   │   │   ├── utils.ts         # Helper functions
│   │   │   └── api.ts           # API client functions
│   │   ├── types/
│   │   │   └── index.ts         # TypeScript types
│   │   ├── App.tsx              # Main app with TanStack Query
│   │   ├── main.tsx             # React entry point
│   │   └── index.css            # Global styles + Tailwind
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── package.json
│
├── backend/                     # Express API server
│   ├── src/
│   │   └── index.js             # Main server + Firecrawl integration
│   ├── .env                     # API keys (gitignored in production)
│   └── package.json
│
├── start.ps1                    # Windows PowerShell startup script
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher
- A **Firecrawl API key** (already configured!)

### 1. Install Dependencies

**Backend:**
```bash
cd backend
npm install
```

**Frontend:**
```bash
cd frontend
npm install
```

### 2. Configure Environment

The backend `.env` file should already be present in `backend/.env`. It needs the following variables (see `backend/.env.example` for a template):

```env
FIRECRAWL_API_KEY=fc-your-key-here
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

> **Note:** Get your Firecrawl API key from [firecrawl.dev](https://firecrawl.dev). Never commit your `.env` file to version control — it is listed in `.gitignore`.

### 3. Start the Servers

**Option A: Use the startup script (Windows PowerShell)**
```powershell
.\start.ps1
```

**Option B: Start manually**

Terminal 1 — Backend:
```bash
cd backend
npm run dev
```

Terminal 2 — Frontend:
```bash
cd frontend
npm run dev
```

### 4. Open the App

Navigate to: **http://localhost:5173**

---

## 🔍 How It Works

### Search Flow

```
User Input (text + optional image)
         ↓
  Express Backend API
         ↓
  Firecrawl Scrape/Search
  (parallel for all marketplaces)
         ↓
  ┌─────────────────────────────┐
  │  Shopee  │  Lazada  │  JD  │
  │  Big C   │ Central  │Makro │
  └─────────────────────────────┘
         ↓
  AI Extraction (structured JSON)
  - name, price, originalPrice
  - discount, image, URL
  - rating, reviews, sold count
  - capacity, quantity, brand
  - seller, location, badge
         ↓
  Aggregated & Sorted Results
         ↓
  Beautiful React UI
```

### Search Modes

| Mode | Description | Speed | Accuracy |
|------|-------------|-------|----------|
| **Scrape** | Directly visits marketplace search pages | Slower | Higher |
| **Search** | Uses Firecrawl web search (Google) | Faster | Good |

---

## 📡 API Endpoints

### `POST /api/search`
Search for products across marketplaces.

**Request (multipart/form-data):**
```
query         string    Product name to search (required, min 2 chars)
marketplaces  string[]  Marketplace IDs to search (optional)
searchMode    string    'scrape' or 'search' (default: 'scrape')
image         File      Product image (optional)
```

**Response:**
```json
{
  "query": "Coca-Cola 1.5L",
  "totalResults": 24,
  "marketplacesSearched": 6,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "summary": [
    {
      "marketplaceId": "shopee",
      "marketplaceName": "Shopee",
      "count": 8,
      "minPrice": 25,
      "maxPrice": 45,
      "avgPrice": 32
    }
  ],
  "products": [
    {
      "id": "shopee-1705312200-abc123",
      "name": "Coca-Cola 1.5L x 6 bottles",
      "price": 89,
      "originalPrice": 120,
      "discount": 26,
      "image": "https://...",
      "url": "https://shopee.co.th/...",
      "rating": 4.8,
      "reviewCount": 1250,
      "soldCount": 5000,
      "seller": "Official Coca-Cola Store",
      "capacity": "1.5L",
      "quantity": "6 bottles",
      "brand": "Coca-Cola",
      "marketplace": "shopee",
      "marketplaceName": "Shopee",
      "currency": "THB"
    }
  ]
}
```

### `GET /api/marketplaces`
Get list of available marketplaces.

### `POST /api/product/detail`
Get detailed product info for a specific URL.

**Request:**
```json
{ "url": "https://shopee.co.th/product/12345" }
```

### `GET /health`
Health check endpoint.

---

## 🎨 UI Features

### Product Cards
- Product image with lazy loading
- Marketplace badge with brand colors
- Star rating display
- Price with original price strike-through
- Discount percentage badge
- Capacity & quantity specs
- "Best Price" indicator for cheapest item
- Hover animations with quick view
- Favorite & share buttons

### Price Comparison Chart
- Bar chart showing min/avg/max per marketplace
- Average price reference line
- Custom tooltip with THB formatting
- Color-coded by price tier

### Marketplace Summary Cards
- Product count per marketplace
- Min/Average/Max price breakdown
- Progress bar for relative coverage
- "Cheapest" badge for best marketplace

### Stats Banner
- Lowest price found
- Average price across results
- Price spread percentage
- Number of discounted items

---

## 🔧 Configuration

### Adding More Marketplaces

Edit `backend/src/index.js` and add to the `MARKETPLACES` array:

```javascript
{
  id: 'tesco',
  name: 'Tesco Lotus',
  domain: 'tescolotus.com',
  color: '#E31837',
  logo: 'https://...',
  searchUrl: (q) => `https://www.tescolotus.com/search?q=${encodeURIComponent(q)}`,
  currency: 'THB',
  flag: '🇹🇭',
}
```

### Customizing Extraction

Modify the AI extraction prompt in `scrapeMarketplace()` to extract additional fields.

---

## 🐛 Troubleshooting

### "Search Failed" Error
- Make sure the backend is running on port 3001
- Check your Firecrawl API key is valid
- Thai marketplaces may require additional time — the timeout is set to 2 minutes

### No Results Found
- Try switching between Scrape and Search modes
- Simplify your search query (fewer words)
- Some marketplaces may block scraping temporarily

### Slow Results
- Firecrawl AI extraction takes 10-30 seconds per marketplace
- All 6 marketplaces run in parallel
- Consider selecting fewer marketplaces in the filter panel

### Image Upload Issues
- Max file size: 10MB
- Supported formats: JPG, PNG, WebP, GIF, BMP
- You can also paste an image from clipboard (Ctrl+V)

---

## 📝 Notes

- **Image Search**: Images are uploaded and sent to the backend for context, but Firecrawl does not natively perform image recognition. Pair your image with a text query for best results.
- **Rate Limits**: Be mindful of Firecrawl API rate limits on your plan.
- **Marketplace Availability**: Prices and availability change frequently. Results reflect real-time scraping.
- **Thai Language**: Some product names and descriptions will be in Thai — this is expected for Thai marketplace listings.

---

## 📄 License

MIT License — free to use and modify.

---

<div align="center">
  <strong>Made with ❤️ for Thai shoppers</strong><br>
  Powered by <a href="https://firecrawl.dev">Firecrawl</a> · Built with <a href="https://ui.shadcn.com">shadcn/ui</a> · Queries by <a href="https://tanstack.com/query">TanStack Query</a>
</div>