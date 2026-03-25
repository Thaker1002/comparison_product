# 🔍 MultiSearch — Multi-Source File Search Application

Search for similar files and content across **Google Drive**, your **local computer**, and **WhatsApp** — all from one beautiful web interface.

Upload a screenshot, JPEG, PDF, Word document, text file, or simply type/paste text, and the app will find similar content across all your sources simultaneously.

---

## ✨ Features

| Feature | Details |
|---|---|
| **File Types** | JPEG, PNG, GIF, BMP, WebP, TIFF, PDF, TXT, MD, CSV, JSON, XML, HTML, DOCX, XLSX, PPTX, RTF, and more |
| **Input Methods** | Upload file, drag-and-drop, paste image from clipboard, or type plain text |
| **Google Drive** | Full-text search, keyword search, filename search, visual image similarity via thumbnail hashing |
| **Local Computer** | Recursive directory search with perceptual image hashing and text similarity |
| **WhatsApp** | Scans WhatsApp Desktop media files + searches exported chat (`_chat.txt`) files for relevant messages and offers |
| **Image Similarity** | Perceptual hashing (aHash, pHash, dHash, wHash) — finds visually similar images even if resaved or resized |
| **Text Similarity** | TF-IDF cosine similarity + rapidfuzz fuzzy matching + optional sentence-transformer semantic similarity |
| **PDF / Office Docs** | Full text extraction from PDFs, Word, Excel, RTF files for content-based matching |
| **OCR (optional)** | If Tesseract is installed, extracts text from images for cross-format matching |
| **Offer Detection** | Identifies WhatsApp messages that look like product offers/listings related to your search |

---

## 📋 Requirements

- **Python 3.10 or higher** — [Download here](https://www.python.org/downloads/)
- **Windows 10/11** (primary target; also works on macOS/Linux with minor path differences)
- Internet connection (for Google Drive API and downloading ML models on first run)

---

## 🚀 Quick Start

### Step 1 — Clone / Download the project

Place the project folder anywhere on your computer, e.g.:
```
C:\Users\YourName\Projects\Machine search\
```

### Step 2 — Run the setup script

Open a terminal (PowerShell or Command Prompt) in the project folder and run:

```
python setup.py
```

This will automatically:
- Create a Python virtual environment (`.venv/`)
- Install all required packages
- Create your `.env` configuration file
- Verify the installation

> **Note:** The first run downloads ML models (~100 MB). This only happens once.

### Step 3 — Start the application

```
.venv\Scripts\python.exe app.py
```

Or activate the virtual environment first:

```
.venv\Scripts\activate
python app.py
```

### Step 4 — Open in browser

Navigate to: **http://localhost:5000**

---

## 🔑 Google Drive Setup (Required for Drive Search)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Go to **APIs & Services → Library**
4. Search for **"Google Drive API"** and click **Enable**
5. Go to **APIs & Services → Credentials**
6. Click **Create Credentials → OAuth 2.0 Client IDs**
7. Choose **Desktop app** as the application type
8. Click **Download JSON**
9. Rename the downloaded file to **`credentials.json`**
10. Place it in the project folder (same folder as `app.py`)
11. Open the app in your browser, click **"Google Drive"** in the header
12. Click **"Authenticate Google Drive"** — a browser window will open for you to sign in
13. After signing in, the token is saved and you won't need to sign in again

> **Security note:** `credentials.json` and `token.json` are listed in `.gitignore` and should NEVER be committed to version control.

---

## 💬 WhatsApp Setup

The app can search WhatsApp in two ways:

### Method 1 — WhatsApp Desktop (Automatic)

If you have [WhatsApp Desktop](https://www.whatsapp.com/download) installed on Windows, the app automatically detects and scans the media transfer folder:

```
C:\Users\YourName\AppData\Local\Packages\5319275A.WhatsAppDesktop_cv1g1gvanyjgm\LocalState\shared\transfers\
```

### Method 2 — Exported Chat Files (Recommended for chat search)

1. Open WhatsApp on your **phone**
2. Open any chat
3. Tap **⋮ (More options)** → **More** → **Export chat**
4. Choose **Without media** (for chat text only) or **Include media**
5. Send/save the export file to your PC
6. Extract the ZIP if needed
7. Place the folder (containing `_chat.txt`) here:
   ```
   C:\Users\YourName\Documents\WhatsApp Chats\
   ```
8. The app will automatically find all `_chat.txt` files in that folder

### Method 3 — Android Backup (Advanced)

If you have connected your Android phone as a drive or have a backup:

```
Phone\Internal Storage\WhatsApp\Media\
```

Set the path in your `.env` file:
```
WHATSAPP_ANDROID_BACKUP_PATH=E:\Phone\Internal Storage\WhatsApp
```

---

## 💻 Local Computer Search

By default, the app searches these folders on your computer:
- `Documents`
- `Downloads`
- `Desktop`
- `Pictures`
- `OneDrive\Documents`
- `OneDrive\Desktop`

### Adding More Folders

**Option A — Edit `.env`:**
```
LOCAL_SEARCH_PATHS=C:\Users\YourName\Documents,D:\Projects,E:\Backups
```

**Option B — Use the UI:**
In the search form, expand **"Advanced options"** and enter extra paths in the "Extra local paths" field.

---

## ⚙️ Configuration (`.env` file)

After setup, edit the `.env` file in the project folder to customise behaviour:

```ini
# ── Flask Settings ──────────────────────────────────────────
SECRET_KEY=change-this-to-a-random-string
PORT=5000
DEBUG=True

# ── Google Drive ─────────────────────────────────────────────
GOOGLE_CREDENTIALS_FILE=credentials.json
GOOGLE_TOKEN_FILE=token.json

# ── Local Search ─────────────────────────────────────────────
LOCAL_SEARCH_PATHS=C:\Users\YourName\Documents,C:\Users\YourName\Downloads
LOCAL_SEARCH_MAX_DEPTH=10
LOCAL_SEARCH_MAX_FILE_SIZE_MB=50

# ── WhatsApp ─────────────────────────────────────────────────
WHATSAPP_DESKTOP_PATH=C:\Users\YourName\AppData\Local\Packages\...
WHATSAPP_EXPORT_PATH=C:\Users\YourName\Documents\WhatsApp Chats
WHATSAPP_ANDROID_BACKUP_PATH=

# ── Similarity Thresholds (0.0 to 1.0) ───────────────────────
# Higher = stricter matching (fewer but more accurate results)
IMAGE_SIMILARITY_THRESHOLD=0.85
TEXT_SIMILARITY_THRESHOLD=0.60
PDF_SIMILARITY_THRESHOLD=0.65

# ── Result Limits ─────────────────────────────────────────────
MAX_RESULTS_PER_SOURCE=20
MAX_UPLOAD_SIZE_MB=100
```

---

## 🖥️ Using the Application

### Upload a File

1. Click **"Upload File"** tab (default)
2. **Drag & drop** a file onto the upload area, or click to browse
3. You can also **paste an image from your clipboard** (Ctrl+V) directly onto the page
4. Optionally add extra context text in the "Additional context" box
5. Select which sources to search (Google Drive, Local, WhatsApp)
6. Click **🔍 Search All Sources** or press **Ctrl+Enter**

### Search by Text

1. Click **"Enter Text"** tab
2. Type or paste any text — a description, keywords, product name, invoice text, etc.
3. Select sources and click Search

### Reading Results

Results are shown in tabs:
- **All Results** — everything, sorted by similarity score, grouped by source
- **Google Drive** — files found in your Drive
- **Local** — files found on your computer
- **WhatsApp** — media files + chat messages

Each result card shows:
- **Match score** (green = high, yellow = medium, blue = low)
- **Source badge** (Drive / Local / WhatsApp)
- **Match type** (visual match / content match / keyword match / offer match)
- **File size and date**
- **Text preview** (for text/PDF matches)
- **Action buttons** — open in Drive, copy file path

### WhatsApp Offer Detection

When searching for a product or item, the app automatically detects WhatsApp messages that look like **offers or listings** — messages containing price-related words (price, sell, rate, RS, negotiable, etc.) combined with your search keywords. These appear with a 💰 "Offer match" badge.

---

## 📁 Project Structure

```
Machine search/
├── app.py                  ← Main Flask application
├── config.py               ← Configuration loader (reads .env)
├── setup.py                ← One-time setup script
├── requirements.txt        ← Python package dependencies
├── .env                    ← Your configuration (created by setup.py)
├── .env.example            ← Configuration template
├── credentials.json        ← Google OAuth credentials (you provide)
├── token.json              ← Cached Google auth token (auto-created)
├── uploads/                ← Temporary upload storage (auto-cleared)
├── templates/
│   └── index.html          ← Main UI template
├── static/
│   ├── css/
│   │   └── style.css       ← Stylesheet
│   └── js/
│       └── main.js         ← Frontend JavaScript
└── utils/
    ├── __init__.py
    ├── file_handler.py     ← File type detection & content extraction
    ├── text_search.py      ← Text similarity (TF-IDF, fuzzy, semantic)
    ├── gdrive_search.py    ← Google Drive API search
    ├── local_search.py     ← Local file system search
    └── whatsapp_search.py  ← WhatsApp media + chat search
```

---

## 🔬 How Similarity Works

### Images
Uses **perceptual hashing** — converts images into compact fingerprints that are robust to:
- Resizing / rescaling
- Minor colour adjustments
- JPEG compression artefacts
- Cropping (partial match via pHash)

Four hash types are averaged: **aHash** (average), **pHash** (perceptual), **dHash** (difference), **wHash** (wavelet).

A score of **1.0 = identical**, **0.85+ = very similar**, **0.70–0.85 = probably related**.

### Text / PDF / Documents
Uses a combination of:
1. **TF-IDF cosine similarity** — compares word importance across documents (fast, no GPU)
2. **Fuzzy matching** (rapidfuzz) — handles typos, word order differences, partial matches
3. **Sentence transformers** (optional, requires `sentence-transformers`) — understands semantic meaning (e.g. "car" ≈ "automobile")

Long documents are split into overlapping chunks; the best-matching chunk score is used.

### Keyword Extraction
The top 6–10 keywords are automatically extracted from your uploaded content using TF-IDF, then used to query Google Drive's full-text index.

---

## 🧩 Optional: OCR (Text from Images)

To extract text from images (e.g. screenshots of documents), install **Tesseract OCR**:

1. Download from: https://github.com/UB-Mannheim/tesseract/wiki
2. Install and note the installation path (e.g. `C:\Program Files\Tesseract-OCR\`)
3. Add Tesseract to your PATH, or set it in Python:
   ```python
   # In utils/file_handler.py, add near the top:
   import pytesseract
   pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
   ```
4. Install the Python binding:
   ```
   .venv\Scripts\pip install pytesseract
   ```

Once installed, text from screenshots will be extracted and used for cross-format search (e.g. upload a screenshot of an invoice → find the original invoice PDF on Drive).

---

## 🛠️ Troubleshooting

### "No results found" for Google Drive
- Check that `credentials.json` is in the project folder
- Click "Google Drive" in the header to verify authentication status
- Make sure the Google Drive API is enabled in your Google Cloud project
- Try lowering `TEXT_SIMILARITY_THRESHOLD` in `.env` (e.g. to `0.40`)

### Local search is slow
- Reduce `LOCAL_SEARCH_MAX_DEPTH` in `.env` (try `5`)
- Narrow `LOCAL_SEARCH_PATHS` to specific folders
- Reduce `LOCAL_SEARCH_MAX_FILE_SIZE_MB`

### WhatsApp chat search finds nothing
- Make sure the exported chat folder contains a `_chat.txt` file
- Check `WHATSAPP_EXPORT_PATH` in `.env` points to the correct folder
- Click "WhatsApp" in the header to see which paths were detected
- Try lowering `TEXT_SIMILARITY_THRESHOLD` to `0.30`

### App won't start — port in use
Change the port in `.env`:
```
PORT=5001
```
Then access the app at `http://localhost:5001`

### Google OAuth "redirect_uri_mismatch" error
- In Google Cloud Console, go to your OAuth client
- Under "Authorised redirect URIs", add: `http://localhost`
- Also add: `http://localhost:5000`

### Large files cause the app to hang
Increase `LOCAL_SEARCH_MAX_FILE_SIZE_MB` or decrease it to skip large files faster.
For the upload limit, change `MAX_UPLOAD_SIZE_MB` in `.env`.

### sentence-transformers takes too long to load
The first load downloads a ~90 MB model. Subsequent starts are fast (model is cached).
If you don't want semantic search, the app works fine without it — TF-IDF + fuzzy matching are used instead.

---

## 🔒 Privacy & Security

- **Google Drive:** Only requests **read-only** access (`drive.readonly` scope). The app cannot modify, delete, or create files in your Drive.
- **Local files:** Files are read locally — no content is sent to any external server (except Google Drive API calls, which go to Google).
- **WhatsApp:** Chat files are parsed entirely locally. No message content leaves your machine.
- **Uploads:** Files uploaded to the search form are saved temporarily to the `uploads/` folder and deleted immediately after the search completes.
- **Credentials:** `credentials.json` and `token.json` are never transmitted anywhere. Keep them out of version control.

---

## 📦 Dependencies

| Package | Purpose |
|---|---|
| `flask` | Web server |
| `Pillow` | Image loading and processing |
| `imagehash` | Perceptual image hashing |
| `pdfplumber` / `PyPDF2` | PDF text extraction |
| `python-docx` | Word document text extraction |
| `openpyxl` | Excel file text extraction |
| `striprtf` | RTF file text extraction |
| `rapidfuzz` | Fast fuzzy text matching |
| `scikit-learn` | TF-IDF vectorisation and cosine similarity |
| `sentence-transformers` | Semantic text similarity (optional) |
| `chardet` | Character encoding detection |
| `google-auth` + `google-api-python-client` | Google Drive API |
| `requests` | HTTP requests (thumbnail download) |
| `python-dotenv` | `.env` file loading |

---

## 📄 License

This project is for personal use. Feel free to modify and extend it for your own needs.

---

## 💡 Tips & Tricks

- **Screenshot search:** Take a screenshot of any file, document, or product image and upload it — the app will find visually similar files.
- **Invoice matching:** Upload an invoice PDF → finds similar invoices in Drive and on your computer.
- **Product comparison:** Type a product name like "Dell XPS 15 i7 16GB" → finds matching offers in your WhatsApp chats, product sheets in Drive, and comparison files locally.
- **Clipboard paste:** Copy any image (e.g. from a website or another app) and press Ctrl+V while on the "Upload File" tab — the image is instantly used as the search query.
- **Ctrl+Enter:** Keyboard shortcut to start a search from anywhere on the page.
- **Multiple exports:** You can have many WhatsApp chat exports in `Documents\WhatsApp Chats\` — the app searches all of them.
- **Adjusting thresholds:** If you're getting too many irrelevant results, increase the threshold values in `.env`. If missing obvious matches, decrease them.