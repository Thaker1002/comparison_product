# ============================================================
# app.py - Main Flask Application
# Multi-Source File Search: Google Drive + Local + WhatsApp
# ============================================================

from __future__ import annotations

import logging
import os
import time
import uuid
from pathlib import Path

from flask import (
    Flask,
    jsonify,
    render_template,
    request,
    send_from_directory,
)
from werkzeug.utils import secure_filename

import config
from utils.file_handler import (
    human_readable_size,
    is_supported,
    process_plain_text,
    process_uploaded_file,
)

# ============================================================
# LOGGING
# ============================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ============================================================
# APP INIT
# ============================================================
app = Flask(__name__)
app.secret_key = config.SECRET_KEY
app.config["MAX_CONTENT_LENGTH"] = config.MAX_CONTENT_LENGTH
app.config["UPLOAD_FOLDER"] = str(config.UPLOAD_FOLDER)


# ============================================================
# HELPERS
# ============================================================


def allowed_file(filename: str) -> bool:
    return is_supported(filename)


def _parse_sources(sources_raw: str) -> set[str]:
    """
    Parse the sources parameter which may be:
      - a comma-separated string: "gdrive,local,whatsapp"
      - a JSON array string:      '["gdrive","local","whatsapp"]'
      - a single value:           "local"
    Returns a set of lowercase source names.
    """
    import json as _json

    sources_raw = (sources_raw or "").strip()
    if sources_raw.startswith("["):
        try:
            parsed = _json.loads(sources_raw)
            return {str(s).strip().lower() for s in parsed if str(s).strip()}
        except Exception:
            pass
    return {s.strip().lower() for s in sources_raw.split(",") if s.strip()}


def save_upload(file_storage) -> tuple[Path, str]:
    """
    Save an uploaded FileStorage object to the uploads folder.
    Returns (saved_path, original_filename).
    """
    original_name = secure_filename(file_storage.filename)
    ext = Path(original_name).suffix
    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path = config.UPLOAD_FOLDER / unique_name
    file_storage.save(str(save_path))
    return save_path, original_name


def cleanup_upload(filepath: Path) -> None:
    """Delete a temporary upload file."""
    try:
        if filepath and filepath.exists():
            filepath.unlink()
    except OSError as exc:
        logger.warning("Could not delete temp file %s: %s", filepath, exc)


# ============================================================
# ROUTES – Pages
# ============================================================


@app.route("/")
def index():
    """Main search page."""
    cfg_summary = config.summarise()
    return render_template("index.html", config=cfg_summary)


@app.route("/config")
def show_config():
    """Return current configuration as JSON (for debugging)."""
    return jsonify(config.summarise())


# ============================================================
# ROUTES – Search API
# ============================================================


@app.route("/api/search", methods=["POST"])
def api_search():
    """
    Main search endpoint.

    Accepts multipart/form-data with:
      - file       : optional uploaded file (image, PDF, text, doc)
      - text       : optional plain text to search for
      - sources    : comma-separated list of sources to search
                     ('gdrive', 'local', 'whatsapp') – default: all
      - local_paths: optional comma-separated extra local paths to search

    Returns JSON with results from each requested source.
    """
    start_time = time.monotonic()

    # ---- Parse input ----
    uploaded_file = request.files.get("file")
    plain_text = (request.form.get("text") or "").strip()
    sources_raw = request.form.get("sources", "gdrive,local,whatsapp")
    sources = _parse_sources(sources_raw)
    extra_local_paths_raw = request.form.get("local_paths", "")
    extra_local_paths = [
        p.strip() for p in extra_local_paths_raw.split(",") if p.strip()
    ]

    # Validate: at least one input must be provided
    if not uploaded_file and not plain_text:
        return jsonify(
            {
                "success": False,
                "error": "Please upload a file or enter text to search.",
            }
        ), 400

    if uploaded_file and not allowed_file(uploaded_file.filename):
        return jsonify(
            {
                "success": False,
                "error": (
                    f"File type '{Path(uploaded_file.filename).suffix}' is not supported. "
                    "Supported types: images (jpg, png, …), PDF, text files, Word/Excel docs."
                ),
            }
        ), 400

    # ---- Process the input ----
    saved_path: Path | None = None
    file_info = None

    try:
        if uploaded_file and uploaded_file.filename:
            saved_path, original_name = save_upload(uploaded_file)
            logger.info("Processing uploaded file: %s", original_name)
            file_info = process_uploaded_file(saved_path, original_name)

            # If user also typed text, append it to the extracted text
            if plain_text:
                file_info.text_content = (
                    plain_text + "\n\n" + file_info.text_content
                ).strip()
        else:
            logger.info("Processing plain text input (%d chars)", len(plain_text))
            file_info = process_plain_text(plain_text)

        if file_info.error and not file_info.text_content and file_info.image is None:
            return jsonify(
                {
                    "success": False,
                    "error": f"Could not process the uploaded file: {file_info.error}",
                }
            ), 422

    except Exception as exc:
        logger.exception("Error processing input")
        cleanup_upload(saved_path)
        return jsonify({"success": False, "error": str(exc)}), 500

    # ---- Run searches in parallel-ish (sequential for simplicity) ----
    results: dict = {
        "success": True,
        "file_info": file_info.to_dict(),
        "sources_searched": list(sources),
        "gdrive": None,
        "local": None,
        "whatsapp": None,
        "total_results": 0,
        "elapsed_seconds": 0.0,
    }

    # --- Google Drive ---
    if "gdrive" in sources:
        try:
            from utils.gdrive_search import search_google_drive

            logger.info("Searching Google Drive…")
            gdrive_result = search_google_drive(
                file_info,
                credentials_file=config.GOOGLE_CREDENTIALS_FILE,
                token_file=config.GOOGLE_TOKEN_FILE,
                max_results=config.MAX_RESULTS_PER_SOURCE,
                text_similarity_threshold=config.TEXT_SIMILARITY_THRESHOLD,
                image_similarity_threshold=config.IMAGE_SIMILARITY_THRESHOLD,
            )
            results["gdrive"] = gdrive_result
            results["total_results"] += gdrive_result.get("result_count", 0)
        except Exception as exc:
            logger.exception("Google Drive search failed")
            results["gdrive"] = {
                "status": "error",
                "error": str(exc),
                "results": [],
                "result_count": 0,
                "source": "google_drive",
            }

    # --- Local File System ---
    if "local" in sources:
        try:
            from utils.local_search import search_local

            logger.info("Searching local file system…")

            search_paths = list(config.LOCAL_SEARCH_PATHS)
            for ep in extra_local_paths:
                p = Path(ep)
                if p.exists() and p not in search_paths:
                    search_paths.append(p)

            local_result = search_local(
                file_info,
                search_paths=search_paths if search_paths else None,
                max_results=config.MAX_RESULTS_PER_SOURCE,
                max_depth=config.LOCAL_SEARCH_MAX_DEPTH,
                max_file_size_bytes=config.LOCAL_SEARCH_MAX_FILE_SIZE_BYTES,
                image_similarity_threshold=config.IMAGE_SIMILARITY_THRESHOLD,
                text_similarity_threshold=config.TEXT_SIMILARITY_THRESHOLD,
                timeout_seconds=45.0,
            )
            results["local"] = local_result
            results["total_results"] += local_result.get("result_count", 0)
        except Exception as exc:
            logger.exception("Local search failed")
            results["local"] = {
                "status": "error",
                "error": str(exc),
                "results": [],
                "result_count": 0,
                "source": "local",
            }

    # --- WhatsApp ---
    if "whatsapp" in sources:
        try:
            from utils.whatsapp_search import search_whatsapp

            logger.info("Searching WhatsApp…")

            wa_paths: list[Path] = []
            if config.WHATSAPP_DESKTOP_PATH.exists():
                wa_paths.append(config.WHATSAPP_DESKTOP_PATH)
            if config.WHATSAPP_EXPORT_PATH.exists():
                wa_paths.append(config.WHATSAPP_EXPORT_PATH)
            if (
                config.WHATSAPP_ANDROID_BACKUP_PATH
                and config.WHATSAPP_ANDROID_BACKUP_PATH.exists()
            ):
                wa_paths.append(config.WHATSAPP_ANDROID_BACKUP_PATH)

            whatsapp_result = search_whatsapp(
                file_info,
                whatsapp_paths=wa_paths if wa_paths else None,
                max_results=config.MAX_RESULTS_PER_SOURCE,
                image_similarity_threshold=config.IMAGE_SIMILARITY_THRESHOLD,
                text_similarity_threshold=config.TEXT_SIMILARITY_THRESHOLD,
                timeout_seconds=45.0,
                scan_chats=True,
                scan_media=True,
            )
            results["whatsapp"] = whatsapp_result
            results["total_results"] += whatsapp_result.get("result_count", 0)
            results["total_results"] += whatsapp_result.get("chat_result_count", 0)
        except Exception as exc:
            logger.exception("WhatsApp search failed")
            results["whatsapp"] = {
                "status": "error",
                "error": str(exc),
                "results": [],
                "chat_results": [],
                "result_count": 0,
                "chat_result_count": 0,
                "source": "whatsapp",
            }

    elapsed = time.monotonic() - start_time
    results["elapsed_seconds"] = round(elapsed, 2)

    logger.info(
        "Search complete in %.2fs – total results: %d",
        elapsed,
        results["total_results"],
    )

    # Cleanup temp upload
    cleanup_upload(saved_path)

    return jsonify(results)


@app.route("/api/search/text", methods=["POST"])
def api_search_text():
    """
    Convenience endpoint: search by plain text only.

    Accepts multipart/form-data OR JSON body:
      - text    : the text to search for
      - sources : comma-separated string OR JSON array of source names
    """
    # Support both FormData (from the frontend) and JSON body
    if request.content_type and "application/json" in request.content_type:
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()
        sources_raw = data.get("sources", "gdrive,local,whatsapp")
    else:
        text = (request.form.get("text") or "").strip()
        sources_raw = request.form.get("sources", "gdrive,local,whatsapp")

    if not text:
        return jsonify({"success": False, "error": "No text provided."}), 400

    # Parse sources — handle both JSON array strings and comma-separated strings
    sources = _parse_sources(sources_raw)

    file_info = process_plain_text(text)

    results: dict = {
        "success": True,
        "file_info": file_info.to_dict(),
        "sources_searched": list(sources),
        "gdrive": None,
        "local": None,
        "whatsapp": None,
        "total_results": 0,
        "elapsed_seconds": 0.0,
    }

    start_time = time.monotonic()

    if "gdrive" in sources:
        try:
            from utils.gdrive_search import search_google_drive

            gdrive_result = search_google_drive(
                file_info,
                credentials_file=config.GOOGLE_CREDENTIALS_FILE,
                token_file=config.GOOGLE_TOKEN_FILE,
                max_results=config.MAX_RESULTS_PER_SOURCE,
            )
            results["gdrive"] = gdrive_result
            results["total_results"] += gdrive_result.get("result_count", 0)
        except Exception as exc:
            results["gdrive"] = {
                "status": "error",
                "error": str(exc),
                "results": [],
                "result_count": 0,
            }

    if "local" in sources:
        try:
            from utils.local_search import search_local

            local_result = search_local(
                file_info,
                search_paths=config.LOCAL_SEARCH_PATHS
                if config.LOCAL_SEARCH_PATHS
                else None,
                max_results=config.MAX_RESULTS_PER_SOURCE,
                timeout_seconds=45.0,
            )
            results["local"] = local_result
            results["total_results"] += local_result.get("result_count", 0)
        except Exception as exc:
            results["local"] = {
                "status": "error",
                "error": str(exc),
                "results": [],
                "result_count": 0,
            }

    if "whatsapp" in sources:
        try:
            from utils.whatsapp_search import search_whatsapp

            whatsapp_result = search_whatsapp(
                file_info,
                max_results=config.MAX_RESULTS_PER_SOURCE,
                timeout_seconds=45.0,
            )
            results["whatsapp"] = whatsapp_result
            results["total_results"] += whatsapp_result.get("result_count", 0)
            results["total_results"] += whatsapp_result.get("chat_result_count", 0)
        except Exception as exc:
            results["whatsapp"] = {
                "status": "error",
                "error": str(exc),
                "results": [],
                "chat_results": [],
                "result_count": 0,
                "chat_result_count": 0,
            }

    results["elapsed_seconds"] = round(time.monotonic() - start_time, 2)
    return jsonify(results)


@app.route("/api/gdrive/auth-status")
def gdrive_auth_status():
    """Check whether a Google Drive OAuth token is cached."""
    from utils.gdrive_search import is_authenticated

    authenticated = is_authenticated(config.GOOGLE_TOKEN_FILE)
    credentials_exist = config.GOOGLE_CREDENTIALS_FILE.exists()
    return jsonify(
        {
            "authenticated": authenticated,
            "credentials_file_exists": credentials_exist,
            "credentials_file_path": str(config.GOOGLE_CREDENTIALS_FILE),
            "token_file_path": str(config.GOOGLE_TOKEN_FILE),
            "instructions": (
                "To authenticate: place credentials.json in the project folder "
                "and click 'Authenticate Google Drive' below."
            )
            if not authenticated
            else "Google Drive is authenticated.",
        }
    )


@app.route("/api/gdrive/authenticate", methods=["POST"])
def gdrive_authenticate():
    """
    Trigger the Google Drive OAuth flow.
    This will open a browser window on the server machine.
    """
    if not config.GOOGLE_CREDENTIALS_FILE.exists():
        return jsonify(
            {
                "success": False,
                "error": (
                    "credentials.json not found. "
                    "Please download it from Google Cloud Console and place it in the project folder."
                ),
            }
        ), 400

    try:
        from utils.gdrive_search import get_drive_service

        service = get_drive_service(
            config.GOOGLE_CREDENTIALS_FILE,
            config.GOOGLE_TOKEN_FILE,
        )
        if service:
            return jsonify(
                {
                    "success": True,
                    "message": "Google Drive authenticated successfully!",
                }
            )
        else:
            return jsonify(
                {
                    "success": False,
                    "error": "Authentication failed. Check the server logs for details.",
                }
            ), 500
    except Exception as exc:
        logger.exception("Google Drive authentication error")
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route("/api/gdrive/revoke", methods=["POST"])
def gdrive_revoke():
    """Revoke the cached Google Drive OAuth token."""
    from utils.gdrive_search import revoke_token

    revoked = revoke_token(config.GOOGLE_TOKEN_FILE)
    return jsonify(
        {
            "success": True,
            "revoked": revoked,
            "message": "Token revoked." if revoked else "No token to revoke.",
        }
    )


@app.route("/api/whatsapp/paths")
def whatsapp_paths():
    """Return the WhatsApp paths that were found on this machine."""
    from utils.whatsapp_search import _resolve_whatsapp_paths

    paths = _resolve_whatsapp_paths(None)
    return jsonify(
        {
            "paths_found": [str(p) for p in paths],
            "desktop_path": str(config.WHATSAPP_DESKTOP_PATH),
            "desktop_path_exists": config.WHATSAPP_DESKTOP_PATH.exists(),
            "export_path": str(config.WHATSAPP_EXPORT_PATH),
            "export_path_exists": config.WHATSAPP_EXPORT_PATH.exists(),
            "instructions": (
                "To search WhatsApp chats: export a chat in WhatsApp (open chat > More options > "
                "Export chat) and save it to your Documents/WhatsApp Chats folder."
            ),
        }
    )


@app.route("/api/local/paths")
def local_paths():
    """Return the local search paths that will be used."""
    resolved = []
    for p in config.LOCAL_SEARCH_PATHS:
        resolved.append(
            {
                "path": str(p),
                "exists": p.exists(),
                "is_dir": p.is_dir() if p.exists() else False,
            }
        )
    return jsonify(
        {
            "search_paths": resolved,
            "max_depth": config.LOCAL_SEARCH_MAX_DEPTH,
            "max_file_size_mb": config.LOCAL_SEARCH_MAX_FILE_SIZE_MB,
        }
    )


@app.route("/api/whatsapp/chat-stats", methods=["POST"])
def whatsapp_chat_stats():
    """
    Parse and return statistics for an uploaded WhatsApp chat export file.

    Accepts multipart/form-data with a 'file' field containing a _chat.txt file.
    """
    chat_file = request.files.get("file")
    if not chat_file:
        return jsonify({"success": False, "error": "No file uploaded."}), 400

    saved_path, original_name = save_upload(chat_file)
    try:
        from utils.whatsapp_search import get_chat_statistics

        stats = get_chat_statistics(saved_path)
        stats["original_filename"] = original_name
        return jsonify({"success": True, "stats": stats})
    except Exception as exc:
        logger.exception("Chat stats error")
        return jsonify({"success": False, "error": str(exc)}), 500
    finally:
        cleanup_upload(saved_path)


# ============================================================
# ERROR HANDLERS
# ============================================================


@app.errorhandler(413)
def file_too_large(exc):
    return jsonify(
        {
            "success": False,
            "error": (
                f"File is too large. Maximum allowed size is "
                f"{config.MAX_UPLOAD_SIZE_MB} MB."
            ),
        }
    ), 413


@app.errorhandler(404)
def not_found(exc):
    return jsonify({"success": False, "error": "Endpoint not found."}), 404


@app.errorhandler(500)
def internal_error(exc):
    logger.exception("Internal server error")
    return jsonify({"success": False, "error": "Internal server error."}), 500


# ============================================================
# STATIC FILE SERVING (for uploads preview – optional)
# ============================================================


@app.route("/uploads/<path:filename>")
def serve_upload(filename):
    """Serve a file from the uploads folder (for previews)."""
    return send_from_directory(str(config.UPLOAD_FOLDER), filename)


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("  Multi-Source File Search Application")
    logger.info("=" * 60)
    logger.info("Configuration summary:")
    for key, val in config.summarise().items():
        logger.info("  %-35s %s", key + ":", val)
    logger.info("=" * 60)
    logger.info("Starting Flask server on http://localhost:%d", config.PORT)
    logger.info("Open your browser and navigate to http://localhost:%d", config.PORT)
    logger.info("=" * 60)

    app.run(
        host="0.0.0.0",
        port=config.PORT,
        debug=config.DEBUG,
        use_reloader=False,  # Disable reloader to avoid double-loading ML models
    )
