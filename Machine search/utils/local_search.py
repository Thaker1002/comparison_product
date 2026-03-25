# ============================================================
# utils/local_search.py
# Searches the local file system for files similar to the
# uploaded query (image, PDF, text, or plain text input).
# ============================================================

from __future__ import annotations

import logging
import os
import threading
import time
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
TEXT_EXTENSIONS = {
    ".txt",
    ".md",
    ".csv",
    ".json",
    ".xml",
    ".html",
    ".htm",
    ".yaml",
    ".yml",
    ".ini",
    ".cfg",
    ".rst",
    ".log",
}
DOC_EXTENSIONS = {".doc", ".docx", ".odt", ".xls", ".xlsx", ".ppt", ".pptx", ".rtf"}

ALL_SUPPORTED = IMAGE_EXTENSIONS | PDF_EXTENSIONS | TEXT_EXTENSIONS | DOC_EXTENSIONS

# Directories that should never be traversed
DEFAULT_SKIP_DIRS = {
    "$recycle.bin",
    "system volume information",
    "windows",
    "program files",
    "program files (x86)",
    "programdata",
    "node_modules",
    ".git",
    "__pycache__",
    ".venv",
    "venv",
    "env",
    ".env",
    "site-packages",
    "dist-packages",
    "appdata\\local\\temp",
    "appdata\\roaming\\microsoft",
    "temp",
    "tmp",
}

# Maximum file size (bytes) to attempt content extraction on
DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

# Default timeout for the entire local search (seconds)
DEFAULT_SEARCH_TIMEOUT = 60


# ============================================================
# PUBLIC API
# ============================================================


def search_local(
    file_info: Any,  # FileInfo from file_handler
    search_paths: list[str | Path] | None = None,
    max_results: int = 20,
    max_depth: int = 10,
    max_file_size_bytes: int = DEFAULT_MAX_FILE_SIZE,
    image_similarity_threshold: float = 0.80,
    text_similarity_threshold: float = 0.50,
    timeout_seconds: float = DEFAULT_SEARCH_TIMEOUT,
    skip_dirs: set[str] | None = None,
    extra_extensions: set[str] | None = None,
) -> dict:
    """
    Search the local file system for files similar to the given FileInfo.

    Parameters
    ----------
    file_info : FileInfo
        Populated FileInfo object from file_handler.
    search_paths : list[str | Path] | None
        Root directories to search. Defaults to common user folders.
    max_results : int
        Maximum number of results to return.
    max_depth : int
        Maximum directory traversal depth (0 = unlimited).
    max_file_size_bytes : int
        Files larger than this are skipped for content comparison.
    image_similarity_threshold : float
        Minimum perceptual hash similarity [0.0, 1.0] for image matches.
    text_similarity_threshold : float
        Minimum text similarity score [0.0, 1.0] for text/PDF matches.
    timeout_seconds : float
        Abort search after this many seconds.
    skip_dirs : set[str] | None
        Additional directory names (lowercase) to skip.
    extra_extensions : set[str] | None
        Additional file extensions to include in the search.

    Returns
    -------
    dict
        {
            'status': 'ok' | 'timeout' | 'error',
            'results': list[dict],
            'result_count': int,
            'files_scanned': int,
            'search_paths': list[str],
            'elapsed_seconds': float,
            'error': str | None,
            'source': 'local',
        }
    """
    start_time = time.monotonic()

    response: dict = {
        "status": "ok",
        "results": [],
        "result_count": 0,
        "files_scanned": 0,
        "search_paths": [],
        "elapsed_seconds": 0.0,
        "error": None,
        "source": "local",
    }

    # ---- Resolve search paths ----
    resolved_paths = _resolve_search_paths(search_paths)
    response["search_paths"] = [str(p) for p in resolved_paths]

    if not resolved_paths:
        response["status"] = "error"
        response["error"] = "No valid search paths found."
        return response

    # ---- Build the skip-dir set ----
    all_skip = set(DEFAULT_SKIP_DIRS)
    if skip_dirs:
        all_skip |= {d.lower() for d in skip_dirs}

    # ---- Build the extension set ----
    target_extensions = set(ALL_SUPPORTED)
    if extra_extensions:
        target_extensions |= {e.lower() for e in extra_extensions}

    category = file_info.category

    results: list[dict] = []
    files_scanned = 0
    timed_out = False

    try:
        for filepath in _walk_files(
            resolved_paths,
            target_extensions,
            all_skip,
            max_depth,
        ):
            # Timeout guard
            elapsed = time.monotonic() - start_time
            if elapsed > timeout_seconds:
                timed_out = True
                logger.info(
                    "Local search timed out after %.1f s (scanned %d files).",
                    elapsed,
                    files_scanned,
                )
                break

            # Skip files that are too large for content search
            try:
                file_size = filepath.stat().st_size
            except OSError:
                continue

            files_scanned += 1
            ext = filepath.suffix.lower()
            file_category = _ext_to_category(ext)

            # ---- IMAGE vs IMAGE ----
            if category == "image" and file_category == "image":
                result = _compare_image(
                    filepath,
                    file_info,
                    image_similarity_threshold,
                    max_file_size_bytes,
                )
                if result:
                    results.append(result)

            # ---- TEXT/PDF/DOC vs TEXT/PDF/DOC ----
            elif category in ("text", "plain_text", "pdf", "doc") and file_category in (
                "text",
                "pdf",
                "doc",
            ):
                if file_size > max_file_size_bytes:
                    continue
                result = _compare_text_file(
                    filepath,
                    file_info,
                    text_similarity_threshold,
                )
                if result:
                    results.append(result)

            # ---- IMAGE with OCR text vs TEXT files ----
            elif (
                category == "image"
                and file_info.text_content
                and file_category in ("text", "pdf", "doc")
            ):
                if file_size > max_file_size_bytes:
                    continue
                result = _compare_text_file(
                    filepath,
                    file_info,
                    text_similarity_threshold,
                    match_type="ocr_text_vs_file",
                )
                if result:
                    results.append(result)

            # ---- PLAIN TEXT vs any text-bearing file ----
            elif category == "plain_text" and file_category in ("text", "pdf", "doc"):
                if file_size > max_file_size_bytes:
                    continue
                result = _compare_text_file(
                    filepath,
                    file_info,
                    text_similarity_threshold,
                )
                if result:
                    results.append(result)

            # Stop early if we have enough high-confidence results
            if len(results) >= max_results * 3:
                # We over-collect then sort; trim later
                pass

    except Exception as exc:
        logger.exception("Unexpected error during local search")
        response["status"] = "error"
        response["error"] = str(exc)

    # ---- Sort and trim results ----
    results.sort(key=lambda r: r.get("similarity_score", 0.0), reverse=True)
    results = results[:max_results]

    elapsed = time.monotonic() - start_time
    response["results"] = results
    response["result_count"] = len(results)
    response["files_scanned"] = files_scanned
    response["elapsed_seconds"] = round(elapsed, 2)
    if timed_out:
        response["status"] = "timeout"

    return response


def quick_filename_search(
    query_filename: str,
    search_paths: list[str | Path] | None = None,
    max_results: int = 20,
    max_depth: int = 10,
    timeout_seconds: float = 30.0,
) -> list[dict]:
    """
    Fast filename-only search (no content extraction).

    Finds files whose name is similar to query_filename.

    Parameters
    ----------
    query_filename : str
        The filename to search for (stem is used for matching).
    search_paths : list[str | Path] | None
        Root directories to search.
    max_results : int
        Maximum number of results.
    max_depth : int
        Maximum directory traversal depth.
    timeout_seconds : float
        Search timeout.

    Returns
    -------
    list[dict]
        Matching file dicts with 'similarity_score', 'filepath', 'filename' keys.
    """
    query_stem = Path(query_filename).stem.lower()
    resolved_paths = _resolve_search_paths(search_paths)
    results: list[dict] = []
    start = time.monotonic()

    for filepath in _walk_files(
        resolved_paths, ALL_SUPPORTED, DEFAULT_SKIP_DIRS, max_depth
    ):
        if time.monotonic() - start > timeout_seconds:
            break

        score = _filename_similarity_score(query_stem, filepath.stem.lower())
        if score > 0.5:
            try:
                stat = filepath.stat()
                size_bytes = stat.st_size
                mtime = stat.st_mtime
            except OSError:
                size_bytes = 0
                mtime = 0.0

            results.append(
                {
                    "filepath": str(filepath),
                    "filename": filepath.name,
                    "directory": str(filepath.parent),
                    "extension": filepath.suffix.lower(),
                    "file_category": _ext_to_category(filepath.suffix.lower()),
                    "size_bytes": size_bytes,
                    "size_human": _human_size(size_bytes),
                    "modified_time": mtime,
                    "similarity_score": round(score, 4),
                    "match_type": "filename",
                    "source": "local",
                }
            )

    results.sort(key=lambda r: r["similarity_score"], reverse=True)
    return results[:max_results]


def list_whatsapp_media(
    whatsapp_paths: list[str | Path],
    target_extensions: set[str] | None = None,
    max_files: int = 500,
) -> list[dict]:
    """
    List media files found inside known WhatsApp storage directories.

    Parameters
    ----------
    whatsapp_paths : list[str | Path]
        Paths to check for WhatsApp media (desktop app, export folders, etc.).
    target_extensions : set[str] | None
        File extensions to include. Defaults to all supported types.
    max_files : int
        Maximum number of files to return.

    Returns
    -------
    list[dict]
        File metadata dicts (filepath, filename, size_bytes, modified_time).
    """
    exts = target_extensions or ALL_SUPPORTED
    files: list[dict] = []

    for base_path in whatsapp_paths:
        base = Path(base_path)
        if not base.exists():
            continue

        for filepath in _walk_files([base], exts, set(), max_depth=8):
            try:
                stat = filepath.stat()
                files.append(
                    {
                        "filepath": str(filepath),
                        "filename": filepath.name,
                        "directory": str(filepath.parent),
                        "extension": filepath.suffix.lower(),
                        "file_category": _ext_to_category(filepath.suffix.lower()),
                        "size_bytes": stat.st_size,
                        "size_human": _human_size(stat.st_size),
                        "modified_time": stat.st_mtime,
                        "source": "whatsapp_local",
                    }
                )
            except OSError:
                continue

            if len(files) >= max_files:
                return files

    return files


# ============================================================
# FILE COMPARISON
# ============================================================


def _compare_image(
    filepath: Path,
    query_info: Any,
    threshold: float,
    max_file_size: int,
) -> dict | None:
    """
    Compare a local image file against the query image using perceptual hashing.

    Returns a result dict if similarity >= threshold, else None.
    """
    if not PIL_AVAILABLE or not IMAGEHASH_AVAILABLE:
        # Fallback: filename similarity only
        score = _filename_similarity_score(
            Path(query_info.filename).stem.lower(),
            filepath.stem.lower(),
        )
        if score >= threshold:
            return _make_result(filepath, score, "filename_fallback")
        return None

    try:
        file_size = filepath.stat().st_size
    except OSError:
        return None

    if file_size > max_file_size:
        # Still do filename comparison for large files
        score = _filename_similarity_score(
            Path(query_info.filename).stem.lower(), filepath.stem.lower()
        )
        if score >= threshold:
            return _make_result(filepath, score, "filename_large_file")
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
        logger.debug("Cannot open image %s: %s", filepath, exc)
        return None

    query_hashes = {
        "ahash": query_info.image_hash,
        "phash": query_info.image_phash,
        "dhash": query_info.image_dhash,
        "whash": query_info.image_whash,
    }

    score = _image_hash_similarity(query_hashes, candidate_hashes)

    if score >= threshold:
        result = _make_result(filepath, score, "image_perceptual_hash")
        try:
            result["image_size"] = candidate_img.size
        except Exception:
            pass
        return result

    return None


def _compare_text_file(
    filepath: Path,
    query_info: Any,
    threshold: float,
    match_type: str = "text_similarity",
) -> dict | None:
    """
    Compare a local text/PDF/doc file against the query using text similarity.

    Returns a result dict if similarity >= threshold, else None.
    """
    try:
        from utils.file_handler import extract_text_from_file
        from utils.text_search import best_chunk_similarity
    except ImportError as exc:
        logger.warning("Import error in _compare_text_file: %s", exc)
        return None

    # First do a quick filename check to boost obvious matches
    filename_score = _filename_similarity_score(
        Path(query_info.filename).stem.lower(), filepath.stem.lower()
    )

    candidate_text = extract_text_from_file(filepath)
    if not candidate_text and filename_score < threshold:
        return None

    query_text = query_info.text_content or ""

    if not query_text:
        # No text to compare – use filename only
        if filename_score >= threshold:
            return _make_result(filepath, filename_score, "filename_only")
        return None

    if not candidate_text:
        if filename_score >= threshold:
            return _make_result(filepath, filename_score, "filename_no_content")
        return None

    # Content similarity
    content_score = best_chunk_similarity(query_text, candidate_text)

    # Composite score: weight content more than filename
    composite = content_score * 0.80 + filename_score * 0.20

    if composite >= threshold:
        result = _make_result(filepath, composite, match_type)
        result["content_similarity"] = round(content_score, 4)
        result["filename_similarity"] = round(filename_score, 4)
        result["text_preview"] = candidate_text[:300].strip()
        return result

    return None


# ============================================================
# FILE SYSTEM WALKING
# ============================================================


def _walk_files(
    root_paths: list[Path],
    extensions: set[str],
    skip_dirs: set[str],
    max_depth: int,
) -> Generator[Path, None, None]:
    """
    Recursively yield file paths with matching extensions,
    skipping excluded directories and respecting max_depth.
    """
    for root in root_paths:
        if not root.exists() or not root.is_dir():
            continue
        yield from _recurse(root, extensions, skip_dirs, max_depth, current_depth=0)


def _recurse(
    directory: Path,
    extensions: set[str],
    skip_dirs: set[str],
    max_depth: int,
    current_depth: int,
) -> Generator[Path, None, None]:
    """Recursive directory walker."""
    if max_depth > 0 and current_depth > max_depth:
        return

    try:
        entries = list(directory.iterdir())
    except PermissionError:
        return
    except OSError as exc:
        logger.debug("Cannot list directory %s: %s", directory, exc)
        return

    for entry in entries:
        try:
            if entry.is_symlink():
                continue  # Skip symlinks to avoid loops

            if entry.is_dir():
                dir_lower = entry.name.lower()
                if any(skip in dir_lower for skip in skip_dirs):
                    continue
                yield from _recurse(
                    entry, extensions, skip_dirs, max_depth, current_depth + 1
                )

            elif entry.is_file():
                if entry.suffix.lower() in extensions:
                    yield entry

        except OSError:
            continue


# ============================================================
# SIMILARITY HELPERS
# ============================================================


def _image_hash_similarity(hashes_a: dict, hashes_b: dict) -> float:
    """
    Compute average similarity across all available hash types.
    Returns a score in [0.0, 1.0].
    """
    scores: list[float] = []
    max_bits = 64  # 8x8 hash = 64 bits

    for key in ("ahash", "phash", "dhash", "whash"):
        ha = hashes_a.get(key)
        hb = hashes_b.get(key)
        if ha is not None and hb is not None:
            distance = ha - hb
            scores.append(max(0.0, 1.0 - distance / max_bits))

    if not scores:
        return 0.0
    return sum(scores) / len(scores)


def _filename_similarity_score(stem_a: str, stem_b: str) -> float:
    """
    Compute a filename stem similarity score in [0.0, 1.0].
    Uses rapidfuzz if available, otherwise character Jaccard.
    """
    if not stem_a or not stem_b:
        return 0.0

    # Exact match
    if stem_a == stem_b:
        return 1.0

    try:
        from rapidfuzz import fuzz

        token_score = fuzz.token_set_ratio(stem_a, stem_b) / 100.0
        partial_score = fuzz.partial_ratio(stem_a, stem_b) / 100.0
        return token_score * 0.6 + partial_score * 0.4
    except ImportError:
        pass

    # Jaccard fallback
    set_a = set(stem_a)
    set_b = set(stem_b)
    intersection = len(set_a & set_b)
    union = len(set_a | set_b)
    return intersection / union if union else 0.0


# ============================================================
# RESULT BUILDING
# ============================================================


def _make_result(
    filepath: Path,
    similarity_score: float,
    match_type: str,
) -> dict:
    """Build a standardised result dict for a local file match."""
    try:
        stat = filepath.stat()
        size_bytes = stat.st_size
        mtime = stat.st_mtime
    except OSError:
        size_bytes = 0
        mtime = 0.0

    return {
        "filepath": str(filepath),
        "filename": filepath.name,
        "directory": str(filepath.parent),
        "extension": filepath.suffix.lower(),
        "file_category": _ext_to_category(filepath.suffix.lower()),
        "size_bytes": size_bytes,
        "size_human": _human_size(size_bytes),
        "modified_time": mtime,
        "similarity_score": round(similarity_score, 4),
        "match_type": match_type,
        "source": "local",
    }


# ============================================================
# UTILITY HELPERS
# ============================================================


def _resolve_search_paths(
    search_paths: list[str | Path] | None,
) -> list[Path]:
    """
    Resolve user-supplied search paths, falling back to common user directories.
    Returns only paths that actually exist on disk.
    """
    if search_paths:
        resolved = []
        for p in search_paths:
            path = Path(p)
            if path.exists() and path.is_dir():
                resolved.append(path)
            else:
                logger.warning(
                    "Search path does not exist or is not a directory: %s", path
                )
        return resolved

    # Default: common user directories
    home = Path.home()
    candidates = [
        home / "Documents",
        home / "Downloads",
        home / "Desktop",
        home / "Pictures",
        home / "Videos",
        home / "OneDrive",
        home / "OneDrive" / "Documents",
        home / "OneDrive" / "Desktop",
        home / "Google Drive",
        # WhatsApp default locations
        home
        / "AppData"
        / "Local"
        / "Packages"
        / "5319275A.WhatsAppDesktop_cv1g1gvanyjgm"
        / "LocalState",
        home / "Documents" / "WhatsApp Chats",
    ]
    return [p for p in candidates if p.exists() and p.is_dir()]


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


def _human_size(num_bytes: int) -> str:
    """Convert byte count to a human-readable string."""
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(num_bytes) < 1024.0:
            return f"{num_bytes:3.1f} {unit}"
        num_bytes = int(num_bytes / 1024.0)
    return f"{num_bytes:.1f} PB"
