# ============================================================
# utils/gdrive_search.py
# Google Drive search integration using the Drive API v3.
# Supports searching by filename, text content, and image
# similarity (via Vision API if configured).
# ============================================================

from __future__ import annotations

import io
import logging
import os
import pickle
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional imports
# ---------------------------------------------------------------------------
try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseDownload

    GOOGLE_API_AVAILABLE = True
except ImportError:
    GOOGLE_API_AVAILABLE = False
    logger.warning(
        "Google API libraries not installed. "
        "Run: pip install google-auth google-auth-oauthlib google-api-python-client"
    )

try:
    from PIL import Image

    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

# ============================================================
# CONSTANTS
# ============================================================

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

# Google Drive MIME types
GDRIVE_MIME_TYPES = {
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
        "text/csv",
        "text/html",
        "application/json",
        "text/markdown",
    ],
    "doc": [
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.google-apps.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.google-apps.spreadsheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.google-apps.presentation",
    ],
}

# Google Docs export MIME types (for downloading native Google files as text)
GDOCS_EXPORT_MIME = {
    "application/vnd.google-apps.document": "text/plain",
    "application/vnd.google-apps.spreadsheet": "text/csv",
    "application/vnd.google-apps.presentation": "text/plain",
}

# Fields to request for each file from the Drive API
FILE_FIELDS = (
    "id, name, mimeType, size, createdTime, modifiedTime, "
    "webViewLink, webContentLink, parents, description, "
    "thumbnailLink, iconLink, owners"
)


# ============================================================
# AUTHENTICATION
# ============================================================


def get_drive_service(
    credentials_file: str | Path = "credentials.json",
    token_file: str | Path = "token.json",
    scopes: list[str] | None = None,
) -> Any | None:
    """
    Authenticate with Google Drive and return a Drive API service object.

    On first run this opens a browser window for OAuth consent.
    Subsequent runs reuse the cached token.

    Parameters
    ----------
    credentials_file : str | Path
        Path to the OAuth 2.0 credentials JSON downloaded from Google Cloud Console.
    token_file : str | Path
        Path where the access/refresh token will be cached.
    scopes : list[str] | None
        OAuth scopes. Defaults to read-only Drive access.

    Returns
    -------
    googleapiclient.discovery.Resource | None
        Authenticated Drive API service, or None on failure.
    """
    if not GOOGLE_API_AVAILABLE:
        logger.error("Google API libraries are not installed.")
        return None

    scopes = scopes or SCOPES
    credentials_file = Path(credentials_file)
    token_file = Path(token_file)
    creds = None

    # Load cached token
    if token_file.exists():
        try:
            with open(token_file, "rb") as fh:
                creds = pickle.load(fh)
        except Exception as exc:
            logger.warning("Could not load cached token (%s). Re-authenticating.", exc)
            creds = None

    # Refresh or obtain new credentials
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception as exc:
                logger.warning("Token refresh failed: %s. Re-authenticating.", exc)
                creds = None

        if not creds:
            if not credentials_file.exists():
                logger.error(
                    "credentials.json not found at '%s'. "
                    "Please download it from Google Cloud Console.",
                    credentials_file,
                )
                return None
            try:
                flow = InstalledAppFlow.from_client_secrets_file(
                    str(credentials_file), scopes
                )
                creds = flow.run_local_server(port=0)
            except Exception as exc:
                logger.error("OAuth flow failed: %s", exc)
                return None

        # Cache the token
        try:
            with open(token_file, "wb") as fh:
                pickle.dump(creds, fh)
        except Exception as exc:
            logger.warning("Could not save token: %s", exc)

    try:
        service = build("drive", "v3", credentials=creds)
        logger.info("Google Drive service authenticated successfully.")
        return service
    except Exception as exc:
        logger.error("Failed to build Drive service: %s", exc)
        return None


def revoke_token(token_file: str | Path = "token.json") -> bool:
    """
    Delete the cached OAuth token, forcing re-authentication on next run.

    Returns True if token was deleted, False if it didn't exist.
    """
    token_path = Path(token_file)
    if token_path.exists():
        token_path.unlink()
        logger.info("OAuth token revoked.")
        return True
    return False


def is_authenticated(token_file: str | Path = "token.json") -> bool:
    """Return True if a (possibly expired) cached token exists."""
    return Path(token_file).exists()


# ============================================================
# CORE SEARCH FUNCTIONS
# ============================================================


def search_drive_by_text(
    service: Any,
    query_text: str,
    max_results: int = 20,
    file_types: list[str] | None = None,
) -> list[dict]:
    """
    Search Google Drive files whose name or full-text content contains query_text.

    Parameters
    ----------
    service : Resource
        Authenticated Drive API service (from get_drive_service()).
    query_text : str
        Text to search for.
    max_results : int
        Maximum number of results to return.
    file_types : list[str] | None
        Filter by category. One or more of: 'image', 'pdf', 'text', 'doc'.
        If None, all types are searched.

    Returns
    -------
    list[dict]
        List of file metadata dicts enriched with 'source' and 'match_type' keys.
    """
    if not service:
        return []

    query_parts: list[str] = [
        "trashed = false",
        f"(name contains {_q(query_text)} or fullText contains {_q(query_text)})",
    ]

    if file_types:
        mime_conditions = _build_mime_filter(file_types)
        if mime_conditions:
            query_parts.append(f"({mime_conditions})")

    drive_query = " and ".join(query_parts)
    return _execute_search(service, drive_query, max_results)


def search_drive_by_filename(
    service: Any,
    filename_query: str,
    max_results: int = 20,
    file_types: list[str] | None = None,
) -> list[dict]:
    """
    Search Google Drive for files whose name contains filename_query.

    Parameters
    ----------
    service : Resource
        Authenticated Drive API service.
    filename_query : str
        Partial or full filename to search for.
    max_results : int
        Maximum number of results.
    file_types : list[str] | None
        Optional MIME-type category filter.

    Returns
    -------
    list[dict]
        Matching file metadata dicts.
    """
    if not service:
        return []

    query_parts: list[str] = [
        "trashed = false",
        f"name contains {_q(filename_query)}",
    ]

    if file_types:
        mime_conditions = _build_mime_filter(file_types)
        if mime_conditions:
            query_parts.append(f"({mime_conditions})")

    drive_query = " and ".join(query_parts)
    return _execute_search(service, drive_query, max_results)


def search_drive_by_keywords(
    service: Any,
    keywords: list[str],
    max_results: int = 20,
    file_types: list[str] | None = None,
    match_all: bool = False,
) -> list[dict]:
    """
    Search Google Drive using multiple keywords.

    Parameters
    ----------
    service : Resource
        Authenticated Drive API service.
    keywords : list[str]
        List of keywords to search for.
    max_results : int
        Maximum number of results.
    file_types : list[str] | None
        Optional MIME-type category filter.
    match_all : bool
        If True, ALL keywords must be present (AND logic).
        If False, ANY keyword triggers a match (OR logic).

    Returns
    -------
    list[dict]
        Deduplicated matching file metadata dicts.
    """
    if not service or not keywords:
        return []

    operator = " and " if match_all else " or "
    keyword_conditions = operator.join(
        f"(name contains {_q(kw)} or fullText contains {_q(kw)})"
        for kw in keywords
        if kw.strip()
    )

    query_parts: list[str] = ["trashed = false", f"({keyword_conditions})"]

    if file_types:
        mime_conditions = _build_mime_filter(file_types)
        if mime_conditions:
            query_parts.append(f"({mime_conditions})")

    drive_query = " and ".join(query_parts)
    results = _execute_search(service, drive_query, max_results)

    # Deduplicate by file id
    seen: set[str] = set()
    unique: list[dict] = []
    for item in results:
        fid = item.get("id", "")
        if fid not in seen:
            seen.add(fid)
            unique.append(item)

    return unique


def search_drive_images(
    service: Any,
    max_results: int = 50,
) -> list[dict]:
    """
    Retrieve all image files from Google Drive (for local similarity comparison).

    Parameters
    ----------
    service : Resource
        Authenticated Drive API service.
    max_results : int
        Maximum number of images to retrieve metadata for.

    Returns
    -------
    list[dict]
        Image file metadata dicts.
    """
    if not service:
        return []

    mime_conditions = _build_mime_filter(["image"])
    query = f"trashed = false and ({mime_conditions})"
    return _execute_search(service, query, max_results)


def search_drive_by_image_similarity(
    service: Any,
    query_file_info: Any,  # FileInfo from file_handler
    max_results: int = 20,
    similarity_threshold: float = 0.80,
    download_thumbnails: bool = True,
) -> list[dict]:
    """
    Find visually similar images in Google Drive by:
    1. Fetching all Drive image file metadata (with thumbnails).
    2. Downloading thumbnails and comparing perceptual hashes.

    Parameters
    ----------
    service : Resource
        Authenticated Drive API service.
    query_file_info : FileInfo
        FileInfo object for the uploaded image (must have image_hash set).
    max_results : int
        Maximum number of similar images to return.
    similarity_threshold : float
        Minimum image similarity score [0.0, 1.0] to include in results.
    download_thumbnails : bool
        Whether to download thumbnails for hash comparison.
        Set to False to only match by filename/metadata.

    Returns
    -------
    list[dict]
        Matching image file dicts with 'similarity_score' added.
    """
    if not service:
        return []

    if query_file_info.image_hash is None:
        logger.warning(
            "Query file has no image hash – falling back to filename search."
        )
        return search_drive_by_filename(
            service, query_file_info.filename, max_results, file_types=["image"]
        )

    # Fetch candidate images from Drive
    candidate_images = search_drive_images(service, max_results=200)
    if not candidate_images:
        return []

    results: list[dict] = []

    for file_meta in candidate_images:
        score = 0.0

        if download_thumbnails:
            thumb_url = file_meta.get("thumbnailLink")
            if thumb_url:
                score = _compare_thumbnail_hash(thumb_url, query_file_info, service)
        else:
            # Name-based heuristic only
            name_sim = _filename_similarity(
                query_file_info.filename, file_meta.get("name", "")
            )
            score = name_sim

        if score >= similarity_threshold:
            enriched = dict(file_meta)
            enriched["similarity_score"] = round(score, 4)
            enriched["match_type"] = "image_similarity"
            enriched["source"] = "google_drive"
            results.append(enriched)

    results.sort(key=lambda x: x["similarity_score"], reverse=True)
    return results[:max_results]


# ============================================================
# COMPREHENSIVE SEARCH (main entry point)
# ============================================================


def search_google_drive(
    file_info: Any,  # FileInfo from file_handler
    credentials_file: str | Path = "credentials.json",
    token_file: str | Path = "token.json",
    max_results: int = 20,
    text_similarity_threshold: float = 0.40,
    image_similarity_threshold: float = 0.80,
) -> dict:
    """
    High-level function that performs a comprehensive Google Drive search
    based on the content type of the uploaded file/text.

    Parameters
    ----------
    file_info : FileInfo
        Populated FileInfo object from file_handler.process_uploaded_file()
        or file_handler.process_plain_text().
    credentials_file : str | Path
        Path to Google OAuth credentials JSON.
    token_file : str | Path
        Path to cached token file.
    max_results : int
        Maximum results per sub-search.
    text_similarity_threshold : float
        Minimum text similarity score for text-based results.
    image_similarity_threshold : float
        Minimum image similarity score for image results.

    Returns
    -------
    dict
        {
            'status': 'ok' | 'error' | 'not_authenticated',
            'authenticated': bool,
            'results': list[dict],
            'result_count': int,
            'error': str | None,
            'search_strategies': list[str],
        }
    """
    response: dict = {
        "status": "ok",
        "authenticated": False,
        "results": [],
        "result_count": 0,
        "error": None,
        "search_strategies": [],
        "source": "google_drive",
    }

    # 1. Authenticate
    service = get_drive_service(credentials_file, token_file)
    if not service:
        response["status"] = "not_authenticated"
        response["error"] = (
            "Could not authenticate with Google Drive. "
            "Please ensure credentials.json exists and complete the OAuth flow."
        )
        return response

    response["authenticated"] = True
    all_results: list[dict] = []
    seen_ids: set[str] = set()

    try:
        category = file_info.category

        # --- IMAGE ---
        if category == "image":
            # a) Perceptual hash similarity
            img_results = search_drive_by_image_similarity(
                service,
                file_info,
                max_results=max_results,
                similarity_threshold=image_similarity_threshold,
            )
            response["search_strategies"].append("image_perceptual_hash")
            _merge_results(all_results, seen_ids, img_results)

            # b) Filename-based search (catches renamed copies)
            stem = Path(file_info.filename).stem
            if stem:
                name_results = search_drive_by_filename(
                    service, stem, max_results, file_types=["image"]
                )
                for r in name_results:
                    r.setdefault("match_type", "filename")
                    r.setdefault("source", "google_drive")
                response["search_strategies"].append("image_filename")
                _merge_results(all_results, seen_ids, name_results)

            # c) If OCR text was extracted, search by that too
            if file_info.text_content:
                from utils.text_search import (
                    build_search_query_from_text,
                    extract_keywords,
                )

                kw_query = build_search_query_from_text(file_info.text_content)
                if kw_query:
                    ocr_results = search_drive_by_text(
                        service, kw_query[:100], max_results
                    )
                    for r in ocr_results:
                        r.setdefault("match_type", "ocr_text")
                        r.setdefault("source", "google_drive")
                    response["search_strategies"].append("image_ocr_text")
                    _merge_results(all_results, seen_ids, ocr_results)

        # --- PDF or DOC ---
        elif category in ("pdf", "doc"):
            from utils.text_search import (
                build_search_query_from_text,
                extract_keywords,
                rank_texts_by_similarity,
            )

            if file_info.text_content:
                # a) Full-text search using extracted keywords
                search_query = build_search_query_from_text(file_info.text_content)
                if search_query:
                    fulltext_results = search_drive_by_text(
                        service,
                        search_query[:100],
                        max_results,
                        file_types=["pdf", "doc"],
                    )
                    for r in fulltext_results:
                        r.setdefault("match_type", "fulltext_keywords")
                        r.setdefault("source", "google_drive")
                    response["search_strategies"].append("pdf_fulltext_keywords")
                    _merge_results(all_results, seen_ids, fulltext_results)

                # b) Individual top keywords
                keywords = extract_keywords(file_info.text_content, top_n=5)
                if keywords:
                    kw_results = search_drive_by_keywords(
                        service,
                        keywords,
                        max_results,
                        file_types=["pdf", "doc", "text"],
                    )
                    for r in kw_results:
                        r.setdefault("match_type", "keyword_match")
                        r.setdefault("source", "google_drive")
                    response["search_strategies"].append("pdf_keyword_search")
                    _merge_results(all_results, seen_ids, kw_results)

            # c) Filename search
            stem = Path(file_info.filename).stem
            if stem and stem != "<text_input>":
                fn_results = search_drive_by_filename(service, stem, max_results)
                for r in fn_results:
                    r.setdefault("match_type", "filename")
                    r.setdefault("source", "google_drive")
                response["search_strategies"].append("pdf_filename")
                _merge_results(all_results, seen_ids, fn_results)

        # --- TEXT / PLAIN TEXT ---
        elif category in ("text", "plain_text"):
            from utils.text_search import (
                build_search_query_from_text,
                extract_keywords,
            )

            text = file_info.text_content
            if text:
                # a) Full-text keyword query
                search_query = build_search_query_from_text(text)
                if search_query:
                    ft_results = search_drive_by_text(
                        service, search_query[:100], max_results
                    )
                    for r in ft_results:
                        r.setdefault("match_type", "fulltext_keywords")
                        r.setdefault("source", "google_drive")
                    response["search_strategies"].append("text_fulltext_keywords")
                    _merge_results(all_results, seen_ids, ft_results)

                # b) Individual keywords
                keywords = extract_keywords(text, top_n=6)
                if keywords:
                    kw_results = search_drive_by_keywords(
                        service, keywords, max_results
                    )
                    for r in kw_results:
                        r.setdefault("match_type", "keyword_match")
                        r.setdefault("source", "google_drive")
                    response["search_strategies"].append("text_keyword_search")
                    _merge_results(all_results, seen_ids, kw_results)

            # c) Filename search (for uploaded text files)
            if file_info.filename and file_info.filename != "<text_input>":
                stem = Path(file_info.filename).stem
                fn_results = search_drive_by_filename(service, stem, max_results)
                for r in fn_results:
                    r.setdefault("match_type", "filename")
                    r.setdefault("source", "google_drive")
                response["search_strategies"].append("text_filename")
                _merge_results(all_results, seen_ids, fn_results)

        else:
            # Unknown type – try generic text search on filename
            stem = Path(file_info.filename).stem if file_info.filename else ""
            if stem:
                generic_results = search_drive_by_filename(service, stem, max_results)
                for r in generic_results:
                    r.setdefault("match_type", "filename")
                    r.setdefault("source", "google_drive")
                response["search_strategies"].append("generic_filename")
                _merge_results(all_results, seen_ids, generic_results)

        # ---- Enrich & finalise ----
        enriched = [_enrich_file_meta(f) for f in all_results]
        enriched = enriched[:max_results]
        response["results"] = enriched
        response["result_count"] = len(enriched)

    except Exception as exc:
        logger.exception("Unexpected error during Google Drive search")
        response["status"] = "error"
        response["error"] = str(exc)

    return response


# ============================================================
# DOWNLOAD HELPERS
# ============================================================


def download_file_bytes(
    service: Any,
    file_id: str,
    mime_type: str,
    max_bytes: int = 5 * 1024 * 1024,
) -> bytes | None:
    """
    Download up to max_bytes of a Drive file's content.

    For Google Docs/Sheets/Slides, exports as plain text/CSV first.

    Parameters
    ----------
    service : Resource
        Authenticated Drive API service.
    file_id : str
        Google Drive file ID.
    mime_type : str
        The file's MIME type (used to determine export format).
    max_bytes : int
        Maximum bytes to download (to avoid huge downloads).

    Returns
    -------
    bytes | None
        Raw file content, or None on failure.
    """
    if not service:
        return None
    try:
        if mime_type in GDOCS_EXPORT_MIME:
            export_mime = GDOCS_EXPORT_MIME[mime_type]
            request = service.files().export_media(fileId=file_id, mimeType=export_mime)
        else:
            request = service.files().get_media(fileId=file_id)

        buffer = io.BytesIO()
        downloader = MediaIoBaseDownload(buffer, request, chunksize=max_bytes)
        done = False
        while not done:
            _, done = downloader.next_chunk()
            if buffer.tell() >= max_bytes:
                break

        return buffer.getvalue()
    except Exception as exc:
        logger.debug("Could not download Drive file %s: %s", file_id, exc)
        return None


def download_file_text(
    service: Any,
    file_id: str,
    mime_type: str,
) -> str:
    """
    Download a Drive file and return its content as a decoded string.

    Returns an empty string on failure.
    """
    raw = download_file_bytes(service, file_id, mime_type)
    if not raw:
        return ""
    try:
        import chardet

        enc = chardet.detect(raw[:10_000]).get("encoding") or "utf-8"
        return raw.decode(enc, errors="replace")
    except Exception:
        return raw.decode("utf-8", errors="replace")


# ============================================================
# INTERNAL HELPERS
# ============================================================


def _execute_search(service: Any, drive_query: str, max_results: int) -> list[dict]:
    """
    Execute a Drive API files.list query and return a flat list of file dicts.
    Handles pagination automatically up to max_results.
    """
    files: list[dict] = []
    page_token: str | None = None

    while len(files) < max_results:
        try:
            request_params: dict = {
                "q": drive_query,
                "spaces": "drive",
                "fields": f"nextPageToken, files({FILE_FIELDS})",
                "pageSize": min(max_results - len(files), 100),
                "orderBy": "modifiedTime desc",
            }
            if page_token:
                request_params["pageToken"] = page_token

            response = service.files().list(**request_params).execute()
            batch = response.get("files", [])
            files.extend(batch)

            page_token = response.get("nextPageToken")
            if not page_token or not batch:
                break
        except Exception as exc:
            logger.warning("Drive API search error: %s", exc)
            break

    return files[:max_results]


def _build_mime_filter(categories: list[str]) -> str:
    """
    Build a Drive query MIME-type filter string for the given categories.
    """
    conditions: list[str] = []
    for cat in categories:
        for mime in GDRIVE_MIME_TYPES.get(cat, []):
            conditions.append(f"mimeType = '{mime}'")
    return " or ".join(conditions)


def _enrich_file_meta(file_meta: dict) -> dict:
    """
    Add computed/normalised fields to a raw Drive API file dict.
    """
    enriched = dict(file_meta)
    enriched.setdefault("source", "google_drive")
    enriched.setdefault("match_type", "unknown")
    enriched.setdefault("similarity_score", None)

    # Human-readable size
    size_bytes = int(file_meta.get("size", 0) or 0)
    enriched["size_bytes"] = size_bytes
    enriched["size_human"] = _human_size(size_bytes)

    # Normalise owner info
    owners = file_meta.get("owners", [])
    enriched["owner_names"] = [o.get("displayName", "") for o in owners]
    enriched["owner_emails"] = [o.get("emailAddress", "") for o in owners]

    # Derive a simple file type label
    mime = file_meta.get("mimeType", "")
    enriched["file_type_label"] = _mime_to_label(mime)

    # Web link (prefer webViewLink, fall back to webContentLink)
    enriched["link"] = file_meta.get("webViewLink") or file_meta.get(
        "webContentLink", ""
    )

    return enriched


def _compare_thumbnail_hash(
    thumb_url: str,
    query_file_info: Any,
    service: Any,
) -> float:
    """
    Download a Drive thumbnail, compute its perceptual hash,
    and compare with the query image's hashes.

    Returns a similarity score in [0.0, 1.0].
    """
    if not PIL_AVAILABLE:
        return 0.0

    try:
        import imagehash
        import requests

        # Drive thumbnail URLs require auth; use the service's credentials
        # Attempt an unauthenticated fetch first (public thumbnails work without auth)
        resp = requests.get(thumb_url, timeout=10)
        if resp.status_code != 200:
            return 0.0

        img = Image.open(io.BytesIO(resp.content)).convert("RGB")

        thumb_hashes = {
            "ahash": imagehash.average_hash(img),
            "phash": imagehash.phash(img),
            "dhash": imagehash.dhash(img),
            "whash": imagehash.whash(img),
        }

        query_hashes = {
            "ahash": query_file_info.image_hash,
            "phash": query_file_info.image_phash,
            "dhash": query_file_info.image_dhash,
            "whash": query_file_info.image_whash,
        }

        from utils.file_handler import image_similarity_score

        return image_similarity_score(query_hashes, thumb_hashes)

    except Exception as exc:
        logger.debug("Thumbnail hash comparison failed: %s", exc)
        return 0.0


def _filename_similarity(name_a: str, name_b: str) -> float:
    """
    Simple filename similarity using rapidfuzz, or character overlap as fallback.
    """
    stem_a = Path(name_a).stem.lower()
    stem_b = Path(name_b).stem.lower()

    try:
        from rapidfuzz import fuzz

        return fuzz.token_set_ratio(stem_a, stem_b) / 100.0
    except ImportError:
        pass

    # Jaccard over characters
    set_a = set(stem_a)
    set_b = set(stem_b)
    if not set_a or not set_b:
        return 0.0
    return len(set_a & set_b) / len(set_a | set_b)


def _merge_results(
    target: list[dict], seen_ids: set[str], new_items: list[dict]
) -> None:
    """Append items not already in seen_ids (by Drive file id) to target."""
    for item in new_items:
        fid = item.get("id", "")
        if fid and fid not in seen_ids:
            seen_ids.add(fid)
            target.append(item)
        elif not fid:
            target.append(item)


def _mime_to_label(mime: str) -> str:
    """Convert a MIME type string to a friendly file-type label."""
    mapping = {
        "image/jpeg": "JPEG Image",
        "image/png": "PNG Image",
        "image/gif": "GIF Image",
        "image/webp": "WebP Image",
        "image/tiff": "TIFF Image",
        "application/pdf": "PDF Document",
        "text/plain": "Text File",
        "text/csv": "CSV Spreadsheet",
        "text/html": "HTML File",
        "application/json": "JSON File",
        "application/msword": "Word Document (old)",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word Document",
        "application/vnd.google-apps.document": "Google Doc",
        "application/vnd.ms-excel": "Excel Spreadsheet (old)",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel Spreadsheet",
        "application/vnd.google-apps.spreadsheet": "Google Sheet",
        "application/vnd.ms-powerpoint": "PowerPoint (old)",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
        "application/vnd.google-apps.presentation": "Google Slides",
    }
    return mapping.get(mime, mime or "Unknown")


def _human_size(num_bytes: int) -> str:
    """Convert byte count to human-readable string."""
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(num_bytes) < 1024.0:
            return f"{num_bytes:3.1f} {unit}"
        num_bytes = int(num_bytes / 1024.0)
    return f"{num_bytes:.1f} PB"


def _q(value: str) -> str:
    """
    Escape a string value for use in a Drive API query.
    Drive queries use single quotes; escape any existing single quotes.
    """
    escaped = value.replace("\\", "\\\\").replace("'", "\\'")
    return f"'{escaped}'"
