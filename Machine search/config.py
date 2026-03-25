# ============================================================
# config.py - Centralized Configuration Loader
# ============================================================

import os
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# ============================================================
# BASE PATHS
# ============================================================
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_FOLDER = BASE_DIR / os.getenv("UPLOAD_FOLDER", "uploads")
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)

# ============================================================
# FLASK SETTINGS
# ============================================================
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-please-change")
FLASK_ENV = os.getenv("FLASK_ENV", "development")
DEBUG = os.getenv("DEBUG", "True").lower() in ("true", "1", "yes")
PORT = int(os.getenv("PORT", 5000))
MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", 100))
MAX_CONTENT_LENGTH = MAX_UPLOAD_SIZE_MB * 1024 * 1024  # bytes

# ============================================================
# ALLOWED FILE TYPES
# ============================================================
ALLOWED_IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".webp",
    ".tiff",
    ".tif",
}
ALLOWED_PDF_EXTENSIONS = {".pdf"}
ALLOWED_TEXT_EXTENSIONS = {
    ".txt",
    ".md",
    ".csv",
    ".json",
    ".xml",
    ".html",
    ".htm",
    ".rtf",
}
ALLOWED_DOC_EXTENSIONS = {".doc", ".docx", ".odt", ".xls", ".xlsx", ".ppt", ".pptx"}

ALLOWED_EXTENSIONS = (
    ALLOWED_IMAGE_EXTENSIONS
    | ALLOWED_PDF_EXTENSIONS
    | ALLOWED_TEXT_EXTENSIONS
    | ALLOWED_DOC_EXTENSIONS
)

# MIME type mappings
MIME_TYPE_CATEGORY = {
    "image": [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/bmp",
        "image/webp",
        "image/tiff",
    ],
    "pdf": ["application/pdf"],
    "text": [
        "text/plain",
        "text/markdown",
        "text/csv",
        "text/html",
        "application/json",
        "application/xml",
        "text/xml",
    ],
    "doc": [
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.oasis.opendocument.text",
    ],
}

# ============================================================
# GOOGLE DRIVE SETTINGS
# ============================================================
GOOGLE_CREDENTIALS_FILE = BASE_DIR / os.getenv(
    "GOOGLE_CREDENTIALS_FILE", "credentials.json"
)
GOOGLE_TOKEN_FILE = BASE_DIR / os.getenv("GOOGLE_TOKEN_FILE", "token.json")
GOOGLE_DRIVE_SCOPES = [
    scope.strip()
    for scope in os.getenv(
        "GOOGLE_DRIVE_SCOPES", "https://www.googleapis.com/auth/drive.readonly"
    ).split(",")
]
GOOGLE_VISION_API_KEY = os.getenv("GOOGLE_VISION_API_KEY", "")

# ============================================================
# LOCAL SEARCH SETTINGS
# ============================================================
_raw_local_paths = os.getenv(
    "LOCAL_SEARCH_PATHS",
    ",".join(
        [
            str(Path.home() / "Documents"),
            str(Path.home() / "Downloads"),
            str(Path.home() / "Desktop"),
            str(Path.home() / "Pictures"),
        ]
    ),
)
LOCAL_SEARCH_PATHS = [Path(p.strip()) for p in _raw_local_paths.split(",") if p.strip()]

LOCAL_SEARCH_MAX_DEPTH = int(os.getenv("LOCAL_SEARCH_MAX_DEPTH", 10))
LOCAL_SEARCH_MAX_FILE_SIZE_MB = int(os.getenv("LOCAL_SEARCH_MAX_FILE_SIZE_MB", 50))
LOCAL_SEARCH_MAX_FILE_SIZE_BYTES = LOCAL_SEARCH_MAX_FILE_SIZE_MB * 1024 * 1024

_raw_exclude = os.getenv(
    "LOCAL_EXCLUDE_EXTENSIONS", ".exe,.dll,.sys,.bin,.iso,.img,.vmdk,.tmp,.log,.dat,.db"
)
LOCAL_EXCLUDE_EXTENSIONS = {
    ext.strip().lower() for ext in _raw_exclude.split(",") if ext.strip()
}

# Directories to always skip during local search
LOCAL_EXCLUDE_DIRS = {
    "$Recycle.Bin",
    "System Volume Information",
    "Windows",
    "Program Files",
    "Program Files (x86)",
    "ProgramData",
    "node_modules",
    ".git",
    "__pycache__",
    ".venv",
    "venv",
    "AppData\\Local\\Temp",
    "Temp",
    "tmp",
}

# ============================================================
# WHATSAPP SETTINGS
# ============================================================
_whatsapp_desktop_default = str(
    Path.home()
    / "AppData"
    / "Local"
    / "Packages"
    / "5319275A.WhatsAppDesktop_cv1g1gvanyjgm"
    / "LocalState"
    / "shared"
    / "transfers"
)

WHATSAPP_DESKTOP_PATH = Path(
    os.getenv("WHATSAPP_DESKTOP_PATH", _whatsapp_desktop_default)
)

WHATSAPP_EXPORT_PATH = Path(
    os.getenv("WHATSAPP_EXPORT_PATH", str(Path.home() / "Documents" / "WhatsApp Chats"))
)

WHATSAPP_ANDROID_BACKUP_PATH = os.getenv("WHATSAPP_ANDROID_BACKUP_PATH", "")
WHATSAPP_ANDROID_BACKUP_PATH = (
    Path(WHATSAPP_ANDROID_BACKUP_PATH) if WHATSAPP_ANDROID_BACKUP_PATH else None
)

# Common WhatsApp media subfolder names to look inside
WHATSAPP_MEDIA_SUBFOLDERS = [
    "WhatsApp Images",
    "WhatsApp Video",
    "WhatsApp Documents",
    "WhatsApp Audio",
    "WhatsApp Voice Notes",
    "Media",
    "transfers",
    "shared",
]

# ============================================================
# SIMILARITY / SEARCH THRESHOLDS
# ============================================================
IMAGE_SIMILARITY_THRESHOLD = float(os.getenv("IMAGE_SIMILARITY_THRESHOLD", 0.85))
TEXT_SIMILARITY_THRESHOLD = float(os.getenv("TEXT_SIMILARITY_THRESHOLD", 0.60))
PDF_SIMILARITY_THRESHOLD = float(os.getenv("PDF_SIMILARITY_THRESHOLD", 0.65))

# Maximum hash distance for perceptual image hashing (lower = stricter)
# imagehash distance: 0 = identical, 64 = completely different
IMAGE_HASH_MAX_DISTANCE = int(os.getenv("IMAGE_HASH_MAX_DISTANCE", 10))

MAX_RESULTS_PER_SOURCE = int(os.getenv("MAX_RESULTS_PER_SOURCE", 20))

# ============================================================
# OPENAI (optional – for semantic text search)
# ============================================================
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# ============================================================
# HELPER UTILITIES
# ============================================================


def get_file_category(filepath: str | Path) -> str:
    """
    Return one of: 'image', 'pdf', 'text', 'doc', or 'unknown'
    based on the file extension.
    """
    ext = Path(filepath).suffix.lower()
    if ext in ALLOWED_IMAGE_EXTENSIONS:
        return "image"
    if ext in ALLOWED_PDF_EXTENSIONS:
        return "pdf"
    if ext in ALLOWED_TEXT_EXTENSIONS:
        return "text"
    if ext in ALLOWED_DOC_EXTENSIONS:
        return "doc"
    return "unknown"


def is_allowed_file(filename: str) -> bool:
    """Return True if the filename has an allowed extension."""
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


def summarise() -> dict:
    """Return a dictionary summarising the current configuration (safe for logging)."""
    return {
        "upload_folder": str(UPLOAD_FOLDER),
        "flask_env": FLASK_ENV,
        "debug": DEBUG,
        "port": PORT,
        "max_upload_mb": MAX_UPLOAD_SIZE_MB,
        "google_credentials_exists": GOOGLE_CREDENTIALS_FILE.exists(),
        "google_token_exists": GOOGLE_TOKEN_FILE.exists(),
        "local_search_paths": [str(p) for p in LOCAL_SEARCH_PATHS],
        "local_max_depth": LOCAL_SEARCH_MAX_DEPTH,
        "local_max_file_size_mb": LOCAL_SEARCH_MAX_FILE_SIZE_MB,
        "whatsapp_desktop_path": str(WHATSAPP_DESKTOP_PATH),
        "whatsapp_desktop_exists": WHATSAPP_DESKTOP_PATH.exists(),
        "whatsapp_export_path": str(WHATSAPP_EXPORT_PATH),
        "whatsapp_export_exists": WHATSAPP_EXPORT_PATH.exists(),
        "image_similarity_threshold": IMAGE_SIMILARITY_THRESHOLD,
        "text_similarity_threshold": TEXT_SIMILARITY_THRESHOLD,
        "pdf_similarity_threshold": PDF_SIMILARITY_THRESHOLD,
        "max_results_per_source": MAX_RESULTS_PER_SOURCE,
        "openai_enabled": bool(OPENAI_API_KEY),
        "google_vision_enabled": bool(GOOGLE_VISION_API_KEY),
    }
