# ============================================================
# utils/whatsapp_search.py
# Searches WhatsApp for files and messages similar to the
# uploaded query. Supports:
#   1. WhatsApp Desktop media folder (Windows)
#   2. Exported WhatsApp chat text files (_chat.txt)
#   3. Android WhatsApp backup folders (if mounted/copied)
#   4. Any user-specified WhatsApp folder
# ============================================================

from __future__ import annotations

import logging
import os
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Generator

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional imports
# ---------------------------------------------------------------------------
try:
    from PIL import Image

    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

try:
    import imagehash

    IMAGEHASH_AVAILABLE = True
except ImportError:
    IMAGEHASH_AVAILABLE = False

# ============================================================
# CONSTANTS
# ============================================================

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif"}
PDF_EXTENSIONS = {".pdf"}
TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".json", ".xml", ".html", ".htm"}
DOC_EXTENSIONS = {".doc", ".docx", ".odt", ".xls", ".xlsx", ".ppt", ".pptx"}

ALL_MEDIA_EXTENSIONS = (
    IMAGE_EXTENSIONS | PDF_EXTENSIONS | TEXT_EXTENSIONS | DOC_EXTENSIONS
)

# WhatsApp exported chat filename pattern
WHATSAPP_CHAT_FILENAMES = {"_chat.txt", "whatsapp chat", "chat.txt"}

# Known WhatsApp Desktop paths on Windows
WHATSAPP_DESKTOP_PATHS_WINDOWS = [
    Path.home()
    / "AppData"
    / "Local"
    / "Packages"
    / "5319275A.WhatsAppDesktop_cv1g1gvanyjgm"
    / "LocalState"
    / "shared"
    / "transfers",
    Path.home() / "AppData" / "Local" / "WhatsApp",
    Path.home() / "AppData" / "Roaming" / "WhatsApp",
]

# Known WhatsApp media subfolders (Android backup structure)
WHATSAPP_MEDIA_SUBFOLDERS = [
    "WhatsApp Images",
    "WhatsApp Video",
    "WhatsApp Documents",
    "WhatsApp Audio",
    "WhatsApp Voice Notes",
    "WhatsApp Stickers",
    "Media",
    "transfers",
    "shared",
]

# WhatsApp chat message line pattern (supports multiple date formats)
# Examples:
#   [12/05/2024, 14:30:00] John Doe: Hello!
#   12/05/2024, 14:30 - John Doe: Hello!
#   [05/12/24, 2:30:00 PM] +91 98765 43210: Hi there
_WA_LINE_PATTERNS = [
    # [DD/MM/YYYY, HH:MM:SS] Sender: Message
    re.compile(
        r"^\[(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}),\s*"
        r"(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]\s*"
        r"([^:]+):\s+(.+)$",
        re.IGNORECASE,
    ),
    # DD/MM/YYYY, HH:MM - Sender: Message
    re.compile(
        r"^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}),\s*"
        r"(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s*-\s*"
        r"([^:]+):\s+(.+)$",
        re.IGNORECASE,
    ),
    # MM/DD/YYYY, HH:MM AM/PM - Sender: Message (US format)
    re.compile(
        r"^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}),\s*"
        r"(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*"
        r"([^:]+):\s+(.+)$",
        re.IGNORECASE,
    ),
]

# System message patterns (to skip non-user messages)
_SYSTEM_MSG_PATTERNS = [
    re.compile(r"messages and calls are end-to-end encrypted", re.IGNORECASE),
    re.compile(r"you created group", re.IGNORECASE),
    re.compile(r"added you", re.IGNORECASE),
    re.compile(r"changed the subject", re.IGNORECASE),
    re.compile(r"left|was removed|added \+", re.IGNORECASE),
    re.compile(r"<media omitted>", re.IGNORECASE),
    re.compile(r"this message was deleted", re.IGNORECASE),
    re.compile(r"null", re.IGNORECASE),
    re.compile(r"^\s*$"),
]

# ============================================================
# PUBLIC API
# ============================================================


def search_whatsapp(
    file_info: Any,  # FileInfo from file_handler
    whatsapp_paths: list[str | Path] | None = None,
    max_results: int = 20,
    image_similarity_threshold: float = 0.75,
    text_similarity_threshold: float = 0.40,
    timeout_seconds: float = 45.0,
    scan_chats: bool = True,
    scan_media: bool = True,
) -> dict:
    """
    High-level function that searches WhatsApp for content similar to the
    uploaded file or text.

    Searches:
      1. WhatsApp media files (images, PDFs, documents) by visual/content similarity.
      2. WhatsApp exported chat files (_chat.txt) for relevant messages.

    Parameters
    ----------
    file_info : FileInfo
        Populated FileInfo object from file_handler.
    whatsapp_paths : list[str | Path] | None
        Explicit paths to search. Auto-detected if None.
    max_results : int
        Maximum number of results to return.
    image_similarity_threshold : float
        Minimum image similarity score [0.0, 1.0].
    text_similarity_threshold : float
        Minimum text similarity score [0.0, 1.0].
    timeout_seconds : float
        Abort search after this many seconds.
    scan_chats : bool
        Whether to scan exported WhatsApp chat text files.
    scan_media : bool
        Whether to scan WhatsApp media files.

    Returns
    -------
    dict
        {
            'status': 'ok' | 'timeout' | 'error' | 'no_paths',
            'results': list[dict],          # media file matches
            'chat_results': list[dict],     # chat message matches
            'result_count': int,
            'chat_result_count': int,
            'paths_searched': list[str],
            'chat_files_found': int,
            'media_files_scanned': int,
            'elapsed_seconds': float,
            'error': str | None,
            'source': 'whatsapp',
        }
    """
    start_time = time.monotonic()

    response: dict = {
        "status": "ok",
        "results": [],
        "chat_results": [],
        "result_count": 0,
        "chat_result_count": 0,
        "paths_searched": [],
        "chat_files_found": 0,
        "media_files_scanned": 0,
        "elapsed_seconds": 0.0,
        "error": None,
        "source": "whatsapp",
    }

    # ---- Resolve WhatsApp paths ----
    resolved_paths = _resolve_whatsapp_paths(whatsapp_paths)
    if not resolved_paths:
        response["status"] = "no_paths"
        response["error"] = (
            "No WhatsApp directories found. "
            "Please configure WHATSAPP_DESKTOP_PATH or WHATSAPP_EXPORT_PATH in your .env file, "
            "or export your WhatsApp chats manually."
        )
        return response

    response["paths_searched"] = [str(p) for p in resolved_paths]

    media_results: list[dict] = []
    chat_results: list[dict] = []
    media_scanned = 0
    chat_files_found = 0
    timed_out = False

    try:
        category = file_info.category
        query_text = file_info.text_content or ""

        # ================================================================
        # SCAN MEDIA FILES
        # ================================================================
        if scan_media:
            for filepath in _walk_whatsapp_media(resolved_paths):
                if time.monotonic() - start_time > timeout_seconds:
                    timed_out = True
                    break

                ext = filepath.suffix.lower()
                file_category = _ext_to_category(ext)
                media_scanned += 1

                # --- Image vs Image ---
                if category == "image" and file_category == "image":
                    result = _compare_image_files(
                        filepath, file_info, image_similarity_threshold
                    )
                    if result:
                        media_results.append(result)

                # --- Image OCR text vs media text files ---
                elif (
                    category == "image"
                    and query_text
                    and file_category in ("pdf", "text", "doc")
                ):
                    result = _compare_text_content(
                        filepath,
                        query_text,
                        text_similarity_threshold,
                        match_type="ocr_vs_document",
                    )
                    if result:
                        media_results.append(result)

                # --- PDF/Doc vs PDF/Doc ---
                elif category in ("pdf", "doc") and file_category in (
                    "pdf",
                    "doc",
                    "text",
                ):
                    result = _compare_text_content(
                        filepath,
                        query_text,
                        text_similarity_threshold,
                        match_type="document_similarity",
                    )
                    if result:
                        media_results.append(result)

                # --- Text vs text files ---
                elif category in ("text", "plain_text") and file_category in (
                    "text",
                    "pdf",
                    "doc",
                ):
                    result = _compare_text_content(
                        filepath,
                        query_text,
                        text_similarity_threshold,
                        match_type="text_similarity",
                    )
                    if result:
                        media_results.append(result)

        # ================================================================
        # SCAN EXPORTED CHAT FILES
        # ================================================================
        if scan_chats and not timed_out:
            chat_files = _find_chat_files(resolved_paths)
            chat_files_found = len(chat_files)

            for chat_file in chat_files:
                if time.monotonic() - start_time > timeout_seconds:
                    timed_out = True
                    break

                chat_matches = _search_chat_file(
                    chat_file,
                    file_info,
                    text_similarity_threshold,
                    max_results=max_results * 2,
                )
                chat_results.extend(chat_matches)

    except Exception as exc:
        logger.exception("Unexpected error during WhatsApp search")
        response["status"] = "error"
        response["error"] = str(exc)

    # ---- Sort and trim ----
    media_results.sort(key=lambda r: r.get("similarity_score", 0.0), reverse=True)
    chat_results.sort(key=lambda r: r.get("similarity_score", 0.0), reverse=True)

    media_results = media_results[:max_results]
    chat_results = chat_results[:max_results]

    elapsed = time.monotonic() - start_time

    response["results"] = media_results
    response["chat_results"] = chat_results
    response["result_count"] = len(media_results)
    response["chat_result_count"] = len(chat_results)
    response["media_files_scanned"] = media_scanned
    response["chat_files_found"] = chat_files_found
    response["elapsed_seconds"] = round(elapsed, 2)

    if timed_out and response["status"] == "ok":
        response["status"] = "timeout"

    return response


# ============================================================
# CHAT FILE PARSING
# ============================================================


def parse_whatsapp_chat_file(filepath: str | Path) -> list[dict]:
    """
    Parse a WhatsApp exported chat file into a list of message dicts.

    Supports both iOS and Android export formats. Multi-line messages
    are merged with their parent message.

    Parameters
    ----------
    filepath : str | Path
        Path to the exported _chat.txt file.

    Returns
    -------
    list[dict]
        Each dict contains:
          - 'date': str           -- message date string
          - 'time': str           -- message time string
          - 'sender': str         -- sender name or phone number
          - 'message': str        -- full message text
          - 'is_system': bool     -- True if this is a system/notification message
          - 'chat_file': str      -- path to the source chat file
          - 'line_number': int    -- line number where message starts
    """
    filepath = Path(filepath)
    messages: list[dict] = []

    try:
        raw = filepath.read_bytes()
        # Detect encoding
        encoding = _detect_encoding(raw)
        text = raw.decode(encoding, errors="replace")
    except OSError as exc:
        logger.warning("Cannot read chat file %s: %s", filepath, exc)
        return []

    current: dict | None = None
    line_num = 0

    for line in text.splitlines():
        line_num += 1
        line_stripped = line.strip()

        if not line_stripped:
            if current:
                current["message"] += "\n"
            continue

        parsed = _parse_chat_line(line_stripped)
        if parsed:
            # Save previous message
            if current:
                current["message"] = current["message"].strip()
                messages.append(current)

            date_str, time_str, sender, message = parsed
            is_system = _is_system_message(sender, message)

            current = {
                "date": date_str,
                "time": time_str,
                "sender": sender.strip(),
                "message": message.strip(),
                "is_system": is_system,
                "chat_file": str(filepath),
                "chat_file_name": filepath.parent.name or filepath.stem,
                "line_number": line_num,
                "timestamp_str": f"{date_str} {time_str}",
            }
        else:
            # Continuation of previous message
            if current:
                current["message"] += "\n" + line_stripped

    # Don't forget the last message
    if current:
        current["message"] = current["message"].strip()
        messages.append(current)

    logger.debug("Parsed %d messages from %s", len(messages), filepath.name)
    return messages


def _parse_chat_line(line: str) -> tuple[str, str, str, str] | None:
    """
    Try to parse a line as a WhatsApp chat message header.

    Returns (date, time, sender, message) tuple, or None if no match.
    """
    for pattern in _WA_LINE_PATTERNS:
        match = pattern.match(line)
        if match:
            return (
                match.group(1),  # date
                match.group(2),  # time
                match.group(3),  # sender
                match.group(4),  # message
            )
    return None


def _is_system_message(sender: str, message: str) -> bool:
    """Return True if the sender/message looks like a WhatsApp system notification."""
    # System messages often have no recognisable sender name
    combined = f"{sender}: {message}".lower()
    for pattern in _SYSTEM_MSG_PATTERNS:
        if pattern.search(combined):
            return True
    return False


# ============================================================
# CHAT SEARCH
# ============================================================


def _search_chat_file(
    chat_file: Path,
    file_info: Any,
    threshold: float,
    max_results: int = 40,
) -> list[dict]:
    """
    Search a single exported WhatsApp chat file for messages
    similar to the query in file_info.

    Returns a list of matching message dicts with 'similarity_score' added.
    """
    messages = parse_whatsapp_chat_file(chat_file)
    if not messages:
        return []

    # Filter out system messages
    user_messages = [m for m in messages if not m.get("is_system", False)]

    query_text = file_info.text_content or ""
    category = file_info.category

    if not query_text:
        return []

    # Import text search utilities
    try:
        from utils.text_search import (
            compute_text_similarity,
            extract_keywords,
            search_whatsapp_messages,
            summarise_whatsapp_offers,
        )
    except ImportError as exc:
        logger.warning("text_search import failed: %s", exc)
        return []

    # --- Keyword extraction for offer detection ---
    keywords = extract_keywords(query_text, top_n=8)

    # --- Similarity search ---
    matched = search_whatsapp_messages(
        query_text,
        user_messages,
        threshold=threshold,
        top_k=max_results,
    )

    # --- Also surface offer-like messages ---
    if keywords:
        offer_matches = summarise_whatsapp_offers(user_messages, keywords)
        # Merge: add offer matches that aren't already in matched
        matched_lines = {m.get("line_number") for m in matched}
        for om in offer_matches[:10]:
            if om.get("line_number") not in matched_lines:
                om["similarity_score"] = om.get("similarity_score", 0.35)
                om["match_type"] = "offer_keyword"
                matched.append(om)

    # Enrich each match
    results: list[dict] = []
    for msg in matched:
        enriched = dict(msg)
        enriched.setdefault("similarity_score", threshold)
        enriched["source"] = "whatsapp_chat"
        enriched["match_type"] = enriched.get("match_type", "text_similarity")
        enriched["message_preview"] = msg.get("message", "")[:300]
        results.append(enriched)

    return results


def search_chat_by_keyword(
    keywords: list[str],
    chat_paths: list[str | Path],
    max_results: int = 30,
    sender_filter: str | None = None,
) -> list[dict]:
    """
    Search WhatsApp chat files for messages containing any of the given keywords.

    Parameters
    ----------
    keywords : list[str]
        List of keywords to look for (case-insensitive).
    chat_paths : list[str | Path]
        Directories or specific chat files to search.
    max_results : int
        Maximum results to return.
    sender_filter : str | None
        If set, only return messages from this sender (partial match).

    Returns
    -------
    list[dict]
        Matching messages with 'match_keywords' list added.
    """
    chat_files = _find_chat_files([Path(p) for p in chat_paths])
    results: list[dict] = []
    kw_lower = [k.lower() for k in keywords if k.strip()]

    for chat_file in chat_files:
        messages = parse_whatsapp_chat_file(chat_file)
        for msg in messages:
            if msg.get("is_system"):
                continue

            # Sender filter
            if (
                sender_filter
                and sender_filter.lower() not in msg.get("sender", "").lower()
            ):
                continue

            text_lower = msg.get("message", "").lower()
            matched_kws = [kw for kw in kw_lower if kw in text_lower]

            if matched_kws:
                enriched = dict(msg)
                enriched["match_keywords"] = matched_kws
                enriched["keyword_match_count"] = len(matched_kws)
                enriched["similarity_score"] = min(
                    1.0, len(matched_kws) / max(1, len(kw_lower))
                )
                enriched["source"] = "whatsapp_chat"
                enriched["match_type"] = "keyword"
                results.append(enriched)

        if len(results) >= max_results * 2:
            break

    results.sort(key=lambda r: r["keyword_match_count"], reverse=True)
    return results[:max_results]


def get_unique_senders(chat_paths: list[str | Path]) -> list[str]:
    """
    Extract a list of unique sender names from all WhatsApp chat files
    in the given paths.

    Parameters
    ----------
    chat_paths : list[str | Path]
        Directories or specific chat files.

    Returns
    -------
    list[str]
        Sorted list of unique sender names.
    """
    chat_files = _find_chat_files([Path(p) for p in chat_paths])
    senders: set[str] = set()

    for chat_file in chat_files:
        messages = parse_whatsapp_chat_file(chat_file)
        for msg in messages:
            if not msg.get("is_system"):
                sender = msg.get("sender", "").strip()
                if sender:
                    senders.add(sender)

    return sorted(senders)


def get_chat_statistics(chat_file: str | Path) -> dict:
    """
    Compute statistics about a WhatsApp chat file.

    Returns a dict with message count, unique senders, date range, etc.
    """
    messages = parse_whatsapp_chat_file(chat_file)
    user_messages = [m for m in messages if not m.get("is_system", False)]

    senders: dict[str, int] = {}
    for msg in user_messages:
        sender = msg.get("sender", "Unknown")
        senders[sender] = senders.get(sender, 0) + 1

    dates = [m.get("date", "") for m in user_messages if m.get("date")]

    return {
        "total_messages": len(messages),
        "user_messages": len(user_messages),
        "system_messages": len(messages) - len(user_messages),
        "unique_senders": len(senders),
        "sender_message_counts": dict(
            sorted(senders.items(), key=lambda x: x[1], reverse=True)
        ),
        "first_date": dates[0] if dates else None,
        "last_date": dates[-1] if dates else None,
        "chat_file": str(chat_file),
    }


# ============================================================
# MEDIA FILE COMPARISON
# ============================================================


def _compare_image_files(
    filepath: Path,
    query_info: Any,
    threshold: float,
) -> dict | None:
    """
    Compare a WhatsApp media image against the query image using perceptual hashing.
    Returns a result dict if similarity >= threshold, else None.
    """
    if not PIL_AVAILABLE or not IMAGEHASH_AVAILABLE:
        # Fallback: filename similarity
        score = _filename_similarity(
            Path(query_info.filename).stem.lower(),
            filepath.stem.lower(),
        )
        if score >= threshold:
            return _make_media_result(filepath, score, "filename_fallback")
        return None

    if query_info.image_hash is None:
        return None

    try:
        candidate_img = Image.open(filepath).convert("RGB")
        candidate_hashes = {
            "ahash": imagehash.average_hash(candidate_img),
            "phash": imagehash.phash(candidate_img),
            "dhash": imagehash.dhash(candidate_img),
            "whash": imagehash.whash(candidate_img),
        }
    except Exception as exc:
        logger.debug("Cannot open WhatsApp image %s: %s", filepath, exc)
        return None

    query_hashes = {
        "ahash": query_info.image_hash,
        "phash": query_info.image_phash,
        "dhash": query_info.image_dhash,
        "whash": query_info.image_whash,
    }

    score = _image_hash_similarity(query_hashes, candidate_hashes)

    if score >= threshold:
        result = _make_media_result(filepath, score, "image_perceptual_hash")
        try:
            result["image_dimensions"] = f"{candidate_img.width}x{candidate_img.height}"
        except Exception:
            pass
        return result

    return None


def _compare_text_content(
    filepath: Path,
    query_text: str,
    threshold: float,
    match_type: str = "text_similarity",
) -> dict | None:
    """
    Compare a WhatsApp document/PDF file's text content against query_text.
    Returns a result dict if similarity >= threshold, else None.
    """
    if not query_text:
        return None

    try:
        from utils.file_handler import extract_text_from_file
        from utils.text_search import best_chunk_similarity
    except ImportError as exc:
        logger.warning("Cannot import text utilities: %s", exc)
        return None

    try:
        candidate_text = extract_text_from_file(filepath)
    except Exception as exc:
        logger.debug("Cannot extract text from %s: %s", filepath, exc)
        return None

    if not candidate_text:
        return None

    score = best_chunk_similarity(query_text, candidate_text)

    if score >= threshold:
        result = _make_media_result(filepath, score, match_type)
        result["text_preview"] = candidate_text[:300].strip()
        return result

    return None


# ============================================================
# FILE SYSTEM HELPERS
# ============================================================


def _walk_whatsapp_media(
    base_paths: list[Path],
    max_depth: int = 6,
) -> Generator[Path, None, None]:
    """
    Yield media files found within WhatsApp directories.
    Prioritises known WhatsApp media subfolder names.
    """
    for base in base_paths:
        if not base.exists():
            continue
        yield from _recurse_media(base, ALL_MEDIA_EXTENSIONS, max_depth, 0)


def _recurse_media(
    directory: Path,
    extensions: set[str],
    max_depth: int,
    current_depth: int,
) -> Generator[Path, None, None]:
    """Recursive walker for WhatsApp media directories."""
    if max_depth > 0 and current_depth > max_depth:
        return

    try:
        entries = list(directory.iterdir())
    except (PermissionError, OSError):
        return

    for entry in entries:
        try:
            if entry.is_symlink():
                continue
            if entry.is_file():
                if entry.suffix.lower() in extensions:
                    yield entry
            elif entry.is_dir():
                yield from _recurse_media(
                    entry, extensions, max_depth, current_depth + 1
                )
        except OSError:
            continue


def _find_chat_files(search_paths: list[Path]) -> list[Path]:
    """
    Find all WhatsApp exported chat text files within the given directories.

    Looks for files named '_chat.txt', or .txt files inside folders
    that contain WhatsApp media subfolders.

    Returns a list of found chat file Paths.
    """
    chat_files: list[Path] = []
    seen: set[Path] = set()

    for base in search_paths:
        if not base.exists():
            continue

        # Walk and look for _chat.txt files
        for dirpath, dirnames, filenames in os.walk(str(base)):
            # Limit depth
            depth = len(Path(dirpath).relative_to(base).parts)
            if depth > 8:
                dirnames.clear()
                continue

            for fname in filenames:
                fname_lower = fname.lower()
                if fname_lower == "_chat.txt" or fname_lower == "chat.txt":
                    full_path = Path(dirpath) / fname
                    if full_path not in seen:
                        seen.add(full_path)
                        chat_files.append(full_path)
                        logger.debug("Found WhatsApp chat file: %s", full_path)

                # Also accept any .txt file that looks like a WhatsApp export
                elif fname_lower.endswith(".txt") and "whatsapp" in fname_lower:
                    full_path = Path(dirpath) / fname
                    if full_path not in seen:
                        seen.add(full_path)
                        chat_files.append(full_path)

    return chat_files


def _resolve_whatsapp_paths(
    user_paths: list[str | Path] | None,
) -> list[Path]:
    """
    Resolve WhatsApp paths from user config plus auto-detected defaults.
    Returns only paths that exist on disk.
    """
    candidates: list[Path] = []

    # User-provided paths take priority
    if user_paths:
        for p in user_paths:
            path = Path(p)
            if path.exists():
                candidates.append(path)
            else:
                logger.debug("WhatsApp path not found: %s", path)

    # Auto-detect WhatsApp Desktop paths (Windows)
    for default_path in WHATSAPP_DESKTOP_PATHS_WINDOWS:
        if default_path.exists() and default_path not in candidates:
            candidates.append(default_path)
            logger.info("Auto-detected WhatsApp Desktop path: %s", default_path)

    # Common user-level WhatsApp folders
    home = Path.home()
    extra_candidates = [
        home / "Documents" / "WhatsApp Chats",
        home / "Downloads" / "WhatsApp Chats",
        home / "Desktop" / "WhatsApp Chats",
        home / "WhatsApp",
        # Android phone mounted as drive
        Path("Phone") / "Internal Storage" / "WhatsApp",
        Path("Phone") / "Android" / "media" / "com.whatsapp" / "WhatsApp",
    ]
    for p in extra_candidates:
        if p.exists() and p not in candidates:
            candidates.append(p)
            logger.info("Found additional WhatsApp path: %s", p)

    return candidates


# ============================================================
# SIMILARITY HELPERS
# ============================================================


def _image_hash_similarity(hashes_a: dict, hashes_b: dict) -> float:
    """
    Compute average perceptual hash similarity in [0.0, 1.0].
    Lower hash distance = higher similarity.
    """
    scores: list[float] = []
    max_bits = 64  # 8x8 image hash = 64 bits

    for key in ("ahash", "phash", "dhash", "whash"):
        ha = hashes_a.get(key)
        hb = hashes_b.get(key)
        if ha is not None and hb is not None:
            try:
                distance = ha - hb
                scores.append(max(0.0, 1.0 - distance / max_bits))
            except Exception:
                pass

    if not scores:
        return 0.0
    return sum(scores) / len(scores)


def _filename_similarity(stem_a: str, stem_b: str) -> float:
    """Simple filename stem similarity [0.0, 1.0]."""
    if not stem_a or not stem_b:
        return 0.0
    if stem_a == stem_b:
        return 1.0
    try:
        from rapidfuzz import fuzz

        return fuzz.token_set_ratio(stem_a, stem_b) / 100.0
    except ImportError:
        pass
    # Jaccard character overlap
    set_a, set_b = set(stem_a), set(stem_b)
    inter = len(set_a & set_b)
    union = len(set_a | set_b)
    return inter / union if union else 0.0


# ============================================================
# RESULT BUILDING
# ============================================================


def _make_media_result(
    filepath: Path,
    similarity_score: float,
    match_type: str,
) -> dict:
    """Build a standardised result dict for a WhatsApp media file match."""
    try:
        stat = filepath.stat()
        size_bytes = stat.st_size
        mtime = stat.st_mtime
        mtime_str = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")
    except OSError:
        size_bytes = 0
        mtime = 0.0
        mtime_str = "Unknown"

    return {
        "filepath": str(filepath),
        "filename": filepath.name,
        "directory": str(filepath.parent),
        "extension": filepath.suffix.lower(),
        "file_category": _ext_to_category(filepath.suffix.lower()),
        "size_bytes": size_bytes,
        "size_human": _human_size(size_bytes),
        "modified_time": mtime,
        "modified_time_str": mtime_str,
        "similarity_score": round(similarity_score, 4),
        "match_type": match_type,
        "source": "whatsapp_media",
    }


# ============================================================
# UTILITY HELPERS
# ============================================================


def _ext_to_category(ext: str) -> str:
    """Map a file extension to a category string."""
    if ext in IMAGE_EXTENSIONS:
        return "image"
    if ext in PDF_EXTENSIONS:
        return "pdf"
    if ext in TEXT_EXTENSIONS:
        return "text"
    if ext in DOC_EXTENSIONS:
        return "doc"
    return "unknown"


def _detect_encoding(raw: bytes) -> str:
    """Detect character encoding of raw bytes using chardet."""
    try:
        import chardet

        result = chardet.detect(raw[:10_000])
        return result.get("encoding") or "utf-8"
    except ImportError:
        return "utf-8"


def _human_size(num_bytes: int) -> str:
    """Convert byte count to a human-readable string."""
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(num_bytes) < 1024.0:
            return f"{num_bytes:3.1f} {unit}"
        num_bytes = int(num_bytes / 1024.0)
    return f"{num_bytes:.1f} PB"
