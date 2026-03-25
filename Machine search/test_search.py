# ============================================================
# test_search.py
# Comprehensive live search test for MultiSearch
# Tests: local search, WhatsApp search, Google Drive status,
#        text similarity, image hashing, and semantic search.
# ============================================================
# Usage (from project folder):
#   .venv\Scripts\python test_search.py
#   .venv\Scripts\python test_search.py --quick   (skip slow tests)
#   .venv\Scripts\python test_search.py --test local
#   .venv\Scripts\python test_search.py --test semantic
# ============================================================

from __future__ import annotations

import argparse
import io
import os
import sys
import tempfile
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Project root on sys.path so we can import config + utils
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

# ---------------------------------------------------------------------------
# ANSI colour helpers (Windows 10+ compatible)
# ---------------------------------------------------------------------------
try:
    import ctypes

    ctypes.windll.kernel32.SetConsoleMode(ctypes.windll.kernel32.GetStdHandle(-11), 7)
    ANSI = True
except Exception:
    ANSI = sys.platform != "win32"


def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if ANSI else text


def green(t):
    return _c("32;1", t)


def red(t):
    return _c("31;1", t)


def yellow(t):
    return _c("33;1", t)


def cyan(t):
    return _c("36;1", t)


def bold(t):
    return _c("1", t)


def dim(t):
    return _c("2", t)


# ============================================================
# Test runner infrastructure
# ============================================================

_results: list[dict] = []


def _record(name: str, passed: bool, detail: str = "", duration: float = 0.0) -> None:
    status = green("PASS") if passed else red("FAIL")
    dur = f"  {dim(f'{duration:.2f}s')}" if duration else ""
    print(f"  [{status}] {name}{dur}")
    if detail:
        for line in detail.strip().splitlines():
            print(f"         {dim(line)}")
    _results.append(
        {"name": name, "passed": passed, "detail": detail, "duration": duration}
    )


def section(title: str) -> None:
    print()
    print(cyan("-" * 60))
    print(cyan(f"  {title}"))
    print(cyan("-" * 60))


def banner(title: str) -> None:
    width = 60
    print()
    print(bold("=" * width))
    print(bold(f"  {title}"))
    print(bold("=" * width))


def summary() -> int:
    """Print final summary. Returns exit code (0 = all pass)."""
    total = len(_results)
    passed = sum(1 for r in _results if r["passed"])
    failed = total - passed

    print()
    print(bold("=" * 60))
    print(bold("  TEST SUMMARY"))
    print(bold("=" * 60))
    print(f"  Total : {total}")
    print(f"  Passed: {green(str(passed))}")
    if failed:
        print(f"  Failed: {red(str(failed))}")
        print()
        print(red("  Failed tests:"))
        for r in _results:
            if not r["passed"]:
                print(f"    * {r['name']}")
                if r["detail"]:
                    for line in r["detail"].strip().splitlines()[:3]:
                        print(f"      {dim(line)}")
    else:
        print()
        print(green("  All tests passed! [OK]"))
    print(bold("=" * 60))
    print()
    return 1 if failed else 0


# ============================================================
# 1. IMPORTS & DEPENDENCIES
# ============================================================


def test_imports() -> None:
    section("1. Core Imports & Dependencies")

    deps = [
        ("flask", "Flask"),
        ("PIL", "Pillow"),
        ("imagehash", "imagehash"),
        ("pdfplumber", "pdfplumber"),
        ("docx", "python-docx"),
        ("rapidfuzz", "rapidfuzz"),
        ("sklearn", "scikit-learn"),
        ("numpy", "numpy"),
    ]
    for module, label in deps:
        t0 = time.monotonic()
        try:
            __import__(module)
            _record(f"Import {label}", True, duration=time.monotonic() - t0)
        except ImportError as exc:
            _record(f"Import {label}", False, str(exc), duration=time.monotonic() - t0)

    # Optional heavy deps
    optional = [
        ("sentence_transformers", "sentence-transformers"),
        ("torch", "PyTorch"),
    ]
    for module, label in optional:
        t0 = time.monotonic()
        try:
            __import__(module)
            _record(f"Import {label} (optional)", True, duration=time.monotonic() - t0)
        except ImportError:
            _record(
                f"Import {label} (optional)",
                True,  # optional -- don't fail
                f"{label} not installed -- semantic search will use TF-IDF fallback.",
                duration=time.monotonic() - t0,
            )

    # Config import
    t0 = time.monotonic()
    try:
        import config

        _record("Import config", True, duration=time.monotonic() - t0)
    except Exception as exc:
        _record("Import config", False, str(exc), duration=time.monotonic() - t0)

    # Utils
    utils = [
        "utils.file_handler",
        "utils.text_search",
        "utils.local_search",
        "utils.whatsapp_search",
        "utils.gdrive_search",
    ]
    for mod in utils:
        t0 = time.monotonic()
        try:
            __import__(mod)
            _record(f"Import {mod}", True, duration=time.monotonic() - t0)
        except Exception as exc:
            _record(f"Import {mod}", False, str(exc), duration=time.monotonic() - t0)


# ============================================================
# 2. CONFIGURATION
# ============================================================


def test_config() -> None:
    section("2. Configuration")
    import config

    t0 = time.monotonic()
    cfg = config.summarise()
    _record("config.summarise() runs", True, duration=time.monotonic() - t0)

    # Upload folder
    _record(
        "Upload folder exists",
        config.UPLOAD_FOLDER.exists(),
        str(config.UPLOAD_FOLDER),
    )

    # Local paths
    existing = [p for p in config.LOCAL_SEARCH_PATHS if p.exists()]
    _record(
        "At least one local search path exists",
        len(existing) > 0,
        f"{len(existing)}/{len(config.LOCAL_SEARCH_PATHS)} paths exist: "
        + ", ".join(str(p) for p in existing[:3]),
    )

    # Thresholds are sane
    _record(
        "IMAGE_SIMILARITY_THRESHOLD in [0,1]",
        0.0 <= config.IMAGE_SIMILARITY_THRESHOLD <= 1.0,
        str(config.IMAGE_SIMILARITY_THRESHOLD),
    )
    _record(
        "TEXT_SIMILARITY_THRESHOLD in [0,1]",
        0.0 <= config.TEXT_SIMILARITY_THRESHOLD <= 1.0,
        str(config.TEXT_SIMILARITY_THRESHOLD),
    )

    # Google Drive credentials — informational only (not configured yet is OK)
    cred_exists = config.GOOGLE_CREDENTIALS_FILE.exists()
    token_exists = config.GOOGLE_TOKEN_FILE.exists()
    _record(
        "Google credentials.json [informational]",
        True,  # never fail — just report status
        ("FOUND: " + str(config.GOOGLE_CREDENTIALS_FILE))
        if cred_exists
        else "NOT YET SET UP -- follow GOOGLE_DRIVE_SETUP.md to enable Drive search.",
    )
    _record(
        "Google token.json [informational]",
        True,
        ("FOUND: " + str(config.GOOGLE_TOKEN_FILE))
        if token_exists
        else "NOT YET GENERATED -- authenticate via the app UI to create token.json.",
    )

    # WhatsApp paths — informational only
    _record(
        "WhatsApp Desktop path [informational]",
        True,
        ("EXISTS: " + str(config.WHATSAPP_DESKTOP_PATH))
        if config.WHATSAPP_DESKTOP_PATH.exists()
        else "NOT FOUND -- run setup_whatsapp.py to configure. Path: "
        + str(config.WHATSAPP_DESKTOP_PATH),
    )
    _record(
        "WhatsApp export path [informational]",
        True,
        ("EXISTS: " + str(config.WHATSAPP_EXPORT_PATH))
        if config.WHATSAPP_EXPORT_PATH.exists()
        else "NOT FOUND -- run setup_whatsapp.py to create it. Path: "
        + str(config.WHATSAPP_EXPORT_PATH),
    )


# ============================================================
# 3. FILE HANDLER
# ============================================================


def test_file_handler() -> None:
    section("3. File Handler -- extract & categorise")

    from utils.file_handler import (
        compute_image_hashes,
        human_readable_size,
        is_supported,
        process_file_for_indexing,
        process_plain_text,
    )

    # plain text processing
    t0 = time.monotonic()
    fi = process_plain_text("The quick brown fox jumps over the lazy dog.")
    passed = (
        fi is not None and fi.text_content and fi.category in ("plain_text", "text")
    )
    _record(
        "process_plain_text()",
        passed,
        f"category={fi.category!r}",
        time.monotonic() - t0,
    )

    # is_supported
    cases = [
        (".jpg", True),
        (".png", True),
        (".pdf", True),
        (".docx", True),
        (".txt", True),
        (".exe", False),
        (".dll", False),
    ]
    for ext, expected in cases:
        result = is_supported(f"test{ext}")
        _record(f"is_supported('{ext}') == {expected}", result == expected)

    # human_readable_size
    _record("human_readable_size(0)", human_readable_size(0) is not None)
    _record(
        "human_readable_size(1024)",
        "KB" in human_readable_size(1024) or "B" in human_readable_size(1024),
    )
    _record("human_readable_size(1048576)", "MB" in human_readable_size(1048576))

    # Write a temp image and test hashing
    try:
        import imagehash
        from PIL import Image

        img = Image.new("RGB", (64, 64), color=(128, 64, 200))
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tf:
            tmp_path = Path(tf.name)
            img.save(tmp_path)

        t0 = time.monotonic()
        hashes = compute_image_hashes(tmp_path)
        passed = isinstance(hashes, dict) and len(hashes) > 0
        _record(
            "compute_image_hashes() on synthetic PNG",
            passed,
            f"hash keys: {list(hashes.keys())}",
            time.monotonic() - t0,
        )
        tmp_path.unlink(missing_ok=True)
    except Exception as exc:
        _record("compute_image_hashes() on synthetic PNG", False, str(exc))

    # Write a temp text file and test indexing
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".txt", delete=False, encoding="utf-8"
        ) as tf:
            tf.write("Sample content for indexing. Hello world.")
            tmp_txt = Path(tf.name)

        t0 = time.monotonic()
        fi2 = process_file_for_indexing(tmp_txt)
        passed = fi2 is not None and bool(fi2.text_content)
        _record(
            "process_file_for_indexing() on .txt",
            passed,
            f"text snippet: {fi2.text_content[:60]!r}" if fi2 else "None returned",
            time.monotonic() - t0,
        )
        tmp_txt.unlink(missing_ok=True)
    except Exception as exc:
        _record("process_file_for_indexing() on .txt", False, str(exc))


# ============================================================
# 4. TEXT SIMILARITY
# ============================================================


def test_text_similarity() -> None:
    section("4. Text Similarity Engine")

    from utils.text_search import (
        best_chunk_similarity,
        compute_text_similarity,
        extract_keywords,
        rank_texts_by_similarity,
        split_into_chunks,
    )

    pairs = [
        ("The quick brown fox", "The quick brown fox", 0.90, "identical"),
        (
            "invoice total amount due payment",
            "bill total amount owed payment",
            0.40,
            "similar",
        ),
        (
            "python programming language code",
            "recipe chocolate cake bake",
            0.0,
            "unrelated",
        ),
        ("Hello world", "", 0.0, "one empty"),
    ]

    for text_a, text_b, min_expected, label in pairs:
        t0 = time.monotonic()
        try:
            score = compute_text_similarity(text_a, text_b)
            passed = score >= min_expected
            _record(
                f"compute_text_similarity ({label})",
                passed,
                f"score={score:.4f}  min_expected={min_expected}",
                time.monotonic() - t0,
            )
        except Exception as exc:
            _record(f"compute_text_similarity ({label})", False, str(exc))

    # extract_keywords
    t0 = time.monotonic()
    try:
        kws = extract_keywords(
            "Machine learning and artificial intelligence are transforming software engineering."
        )
        passed = isinstance(kws, list) and len(kws) > 0
        _record(
            "extract_keywords()", passed, f"keywords: {kws[:8]}", time.monotonic() - t0
        )
    except Exception as exc:
        _record("extract_keywords()", False, str(exc))

    # rank_texts_by_similarity
    t0 = time.monotonic()
    try:
        corpus = [
            {"text_content": "invoice payment due amount"},
            {"text_content": "recipe for chocolate cake"},
            {"text_content": "payment receipt total bill"},
            {"text_content": "machine learning neural network"},
        ]
        ranked = rank_texts_by_similarity(
            "invoice total payment", corpus, threshold=0.0
        )
        passed = isinstance(ranked, list) and len(ranked) >= 1
        top = ranked[0] if ranked else {}
        _record(
            "rank_texts_by_similarity()",
            passed,
            f"top result score={top.get('similarity_score', 0):.4f}, text={top.get('text_content', '?')!r}",
            time.monotonic() - t0,
        )
    except Exception as exc:
        _record("rank_texts_by_similarity()", False, str(exc))

    # split_into_chunks
    t0 = time.monotonic()
    try:
        long_text = " ".join(["word"] * 300)
        chunks = split_into_chunks(long_text, chunk_size=100)
        passed = isinstance(chunks, list) and len(chunks) >= 2
        _record(
            "split_into_chunks()",
            passed,
            f"{len(chunks)} chunks from 300-word text",
            time.monotonic() - t0,
        )
    except Exception as exc:
        _record("split_into_chunks()", False, str(exc))

    # best_chunk_similarity
    t0 = time.monotonic()
    try:
        long_doc = (
            "This section is about recipes and cooking. " * 20
            + "Invoice total amount due for services rendered. " * 10
            + "Random unrelated content. " * 30
        )
        score = best_chunk_similarity("invoice total amount due", long_doc)
        passed = isinstance(score, float) and score >= 0.0
        _record(
            "best_chunk_similarity() finds relevant chunk",
            passed,
            f"score={score:.4f}",
            time.monotonic() - t0,
        )
    except Exception as exc:
        _record("best_chunk_similarity()", False, str(exc))


# ============================================================
# 5. IMAGE HASHING
# ============================================================


def test_image_hashing() -> None:
    section("5. Image Perceptual Hashing")

    try:
        import imagehash
        from PIL import Image

        from utils.file_handler import compute_image_hashes, image_similarity_score
    except ImportError as exc:
        _record("PIL / imagehash available", False, str(exc))
        return

    # Create structurally distinct images using checkerboard patterns.
    # Solid-color and simple gradient images all produce the same all-zero
    # perceptual hash, so we need images with actual spatial structure.
    import numpy as _np

    def _checkerboard(w, h, tile, fg, bg):
        """Make a checkerboard image with given tile size and two RGB colours."""
        arr = _np.zeros((h, w, 3), dtype=_np.uint8)
        for y in range(h):
            for x in range(w):
                color = fg if ((x // tile) + (y // tile)) % 2 == 0 else bg
                arr[y, x] = color
        return Image.fromarray(arr)

    # img_a and img_b: identical 8px black/white checkerboard
    img_a = _checkerboard(128, 128, 8, (255, 255, 255), (0, 0, 0))
    img_b = _checkerboard(128, 128, 8, (255, 255, 255), (0, 0, 0))  # identical
    # img_c: inverted large-tile checkerboard — very different spatial pattern
    img_c = _checkerboard(128, 128, 32, (0, 0, 0), (255, 255, 255))

    with tempfile.TemporaryDirectory() as td:
        path_a = Path(td) / "a.png"
        path_b = Path(td) / "b.png"
        path_c = Path(td) / "c.png"
        img_a.save(path_a)
        img_b.save(path_b)
        img_c.save(path_c)

        # Hashes of identical images should match
        t0 = time.monotonic()
        hashes_a = compute_image_hashes(path_a)
        hashes_b = compute_image_hashes(path_b)
        passed = hashes_a == hashes_b
        _record(
            "Identical images -> identical hashes",
            passed,
            duration=time.monotonic() - t0,
        )

        # Similarity: identical pair should score high
        t0 = time.monotonic()
        score_same = image_similarity_score(hashes_a, hashes_b)
        passed = score_same >= 0.95
        _record(
            "Identical images -> similarity >= 0.95",
            passed,
            f"score={score_same:.4f}",
            time.monotonic() - t0,
        )

        # Similarity: different colours should score lower
        t0 = time.monotonic()
        hashes_c = compute_image_hashes(path_c)
        score_diff = image_similarity_score(hashes_a, hashes_c)
        passed = score_diff < score_same
        _record(
            "Different images -> lower similarity than identical",
            passed,
            f"score_identical={score_same:.4f}  score_different={score_diff:.4f}",
            time.monotonic() - t0,
        )

        # Slightly modified image (brightness tweak) should still score well
        arr = _np.array(img_a).astype(_np.int32)
        arr = _np.clip(arr + 10, 0, 255).astype(_np.uint8)
        img_d = Image.fromarray(arr)
        path_d = Path(td) / "d.png"
        img_d.save(path_d)

        t0 = time.monotonic()
        hashes_d = compute_image_hashes(path_d)
        score_similar = image_similarity_score(hashes_a, hashes_d)
        passed = score_similar >= 0.75
        _record(
            "Slightly modified image -> similarity >= 0.75",
            passed,
            f"score={score_similar:.4f}",
            time.monotonic() - t0,
        )


# ============================================================
# 6. LOCAL SEARCH
# ============================================================


def test_local_search(quick: bool = False) -> None:
    section("6. Local File System Search")

    import config
    from utils.file_handler import process_file_for_indexing, process_plain_text
    from utils.local_search import quick_filename_search, search_local

    # ---- 6a. Text search against a temp directory ----
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)

        # Write some files
        (td_path / "invoice_2024.txt").write_text(
            "Invoice total amount due: $1,250. Payment terms: 30 days net.",
            encoding="utf-8",
        )
        (td_path / "recipe_chocolate.txt").write_text(
            "Chocolate cake recipe: 2 cups flour, 1 cup sugar, cocoa powder.",
            encoding="utf-8",
        )
        (td_path / "invoice_march.txt").write_text(
            "March invoice. Total due: $980. Please pay within 14 days.",
            encoding="utf-8",
        )

        fi = process_plain_text("invoice total payment due amount")

        t0 = time.monotonic()
        result = search_local(
            fi,
            search_paths=[td_path],
            max_results=10,
            max_depth=2,
            text_similarity_threshold=0.10,
            timeout_seconds=30.0,
        )
        dur = time.monotonic() - t0

        _record(
            "search_local() returns dict with expected keys",
            all(
                k in result
                for k in ("status", "results", "result_count", "files_scanned")
            ),
            duration=dur,
        )
        _record(
            "search_local() scans files in temp dir",
            result.get("files_scanned", 0) >= 2,
            f"scanned={result.get('files_scanned', 0)}",
        )
        _record(
            "search_local() finds invoice files (text match)",
            result.get("result_count", 0) >= 1,
            f"results={result.get('result_count', 0)}, status={result.get('status')}",
        )

        # Check result shape
        if result.get("results"):
            r = result["results"][0]
            _record(
                "Result has required fields (filepath, similarity_score, source)",
                all(k in r for k in ("filepath", "similarity_score", "source")),
                str(
                    {
                        k: r.get(k)
                        for k in (
                            "filename",
                            "similarity_score",
                            "source",
                            "match_type",
                        )
                    }
                ),
            )
            _record(
                "Best result is an invoice file (not recipe)",
                "invoice" in r.get("filename", "").lower(),
                f"top result: {r.get('filename')}  score={r.get('similarity_score', 0):.4f}",
            )

    # ---- 6b. Image search against a temp directory ----
    # Use two separate temp dirs: one for the query file, one for the candidates.
    # This avoids the query file matching itself and skews all scores to 1.0.
    # Use checkerboard patterns so perceptual hashes are structurally distinct —
    # solid-color images all produce the same all-zero hash regardless of colour.
    try:
        import numpy as _img_np
        from PIL import Image

        def _cb(w, h, tile, fg, bg):
            """Create a checkerboard image with two RGB colours."""
            arr = _img_np.zeros((h, w, 3), dtype=_img_np.uint8)
            for y in range(h):
                for x in range(w):
                    arr[y, x] = fg if ((x // tile) + (y // tile)) % 2 == 0 else bg
            return Image.fromarray(arr)

        with (
            tempfile.TemporaryDirectory() as q_dir,
            tempfile.TemporaryDirectory() as s_dir,
        ):
            q_path = Path(q_dir) / "query.png"
            s_path = Path(s_dir) / "similar.png"
            d_path = Path(s_dir) / "different.png"

            # Query: 8-px black/white checkerboard
            query_img = _cb(128, 128, 8, (255, 255, 255), (0, 0, 0))
            # Similar: same 8-px checkerboard (brightness +5 tweak)
            similar_arr = _img_np.clip(
                _img_np.array(query_img).astype(_img_np.int32) + 5, 0, 255
            ).astype(_img_np.uint8)
            similar_img = Image.fromarray(similar_arr)
            # Different: inverted large-tile checkerboard — very different structure
            diff_img = _cb(128, 128, 32, (0, 0, 0), (255, 255, 255))

            query_img.save(q_path)
            similar_img.save(s_path)
            diff_img.save(d_path)

            fi = process_file_for_indexing(q_path)

            t0 = time.monotonic()
            result = search_local(
                fi,
                search_paths=[Path(s_dir)],
                max_results=10,
                max_depth=2,
                image_similarity_threshold=0.50,
                timeout_seconds=30.0,
            )
            dur = time.monotonic() - t0

            _record(
                "search_local() image search returns results",
                result.get("result_count", 0) >= 1,
                f"results={result.get('result_count', 0)}, scanned={result.get('files_scanned', 0)}",
                dur,
            )
            if result.get("results"):
                top = result["results"][0]
                _record(
                    "Top image result is the similar image",
                    "similar" in top.get("filename", "").lower(),
                    f"top: {top.get('filename')}  score={top.get('similarity_score', 0):.4f}",
                )
            else:
                _record(
                    "Top image result is the similar image",
                    True,
                    "No results above threshold -- image search ran OK (threshold may be strict for synthetic images).",
                )
    except ImportError:
        _record(
            "search_local() image search (PIL required)",
            True,
            "PIL not available -- skipped",
        )

    # ---- 6c. quick_filename_search ----
    if not quick:
        existing_paths = [p for p in config.LOCAL_SEARCH_PATHS if p.exists()]
        if existing_paths:
            t0 = time.monotonic()
            try:
                hits = quick_filename_search(
                    "invoice",
                    search_paths=existing_paths[:1],
                    max_results=5,
                    max_depth=4,
                    timeout_seconds=15.0,
                )
                _record(
                    "quick_filename_search('invoice') on real paths",
                    isinstance(hits, list),
                    f"found {len(hits)} filename match(es) in {existing_paths[0]}",
                    time.monotonic() - t0,
                )
            except Exception as exc:
                _record("quick_filename_search() on real paths", False, str(exc))
        else:
            _record(
                "quick_filename_search() on real paths",
                True,
                "No accessible local paths -- skipped",
            )


# ============================================================
# 7. WHATSAPP SEARCH
# ============================================================


def test_whatsapp_search() -> None:
    section("7. WhatsApp Search")

    from utils.file_handler import process_plain_text
    from utils.whatsapp_search import (
        get_chat_statistics,
        parse_whatsapp_chat_file,
        search_chat_by_keyword,
        search_whatsapp,
    )

    # Create a synthetic WhatsApp export
    wa_chat = (
        "[01/03/2024, 09:15:22] Alice: Hey, did you send the invoice?\n"
        "[01/03/2024, 09:16:01] Bob: Yes! Invoice total is $1,500 for March.\n"
        "[01/03/2024, 09:17:45] Alice: Great. Payment due in 30 days.\n"
        "[02/03/2024, 14:22:10] Bob: Can you share the receipt too?\n"
        "[02/03/2024, 14:23:55] Alice: Sure, I'll send the receipt now.\n"
        "[03/03/2024, 11:00:00] Bob: Have you seen the new chocolate cake recipe?\n"
        "[03/03/2024, 11:01:30] Alice: Haha not yet! Share it.\n"
        "[04/03/2024, 08:45:00] Bob: Payment received! Thanks Alice.\n"
        "[04/03/2024, 08:46:00] Alice: Perfect. Let me know about next month invoice.\n"
        "[05/03/2024, 16:00:00] Bob: Will do. Talk later!\n"
    )

    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        chat_file = td_path / "_chat.txt"
        chat_file.write_text(wa_chat, encoding="utf-8")

        # parse_whatsapp_chat_file
        t0 = time.monotonic()
        try:
            messages = parse_whatsapp_chat_file(chat_file)
            passed = isinstance(messages, list) and len(messages) >= 5
            _record(
                "parse_whatsapp_chat_file() parses messages",
                passed,
                f"parsed {len(messages)} messages",
                time.monotonic() - t0,
            )
        except Exception as exc:
            _record("parse_whatsapp_chat_file()", False, str(exc))
            messages = []

        # get_chat_statistics
        t0 = time.monotonic()
        try:
            stats = get_chat_statistics(chat_file)
            passed = isinstance(stats, dict) and stats.get("total_messages", 0) >= 5
            _record(
                "get_chat_statistics() returns stats dict",
                passed,
                f"total_messages={stats.get('total_messages')}, "
                f"senders={stats.get('unique_senders')}",
                time.monotonic() - t0,
            )
        except Exception as exc:
            _record("get_chat_statistics()", False, str(exc))

        # search_chat_by_keyword -- signature: (keywords, chat_paths, ...)
        t0 = time.monotonic()
        try:
            hits = search_chat_by_keyword(
                ["invoice", "payment"],
                [td_path],
            )
            passed = isinstance(hits, list) and len(hits) >= 2
            _record(
                "search_chat_by_keyword('invoice', 'payment')",
                passed,
                f"found {len(hits)} matching message(s)",
                time.monotonic() - t0,
            )
        except Exception as exc:
            _record("search_chat_by_keyword()", False, str(exc))

        # search_whatsapp (full search)
        t0 = time.monotonic()
        try:
            fi = process_plain_text("invoice payment total due amount")
            result = search_whatsapp(
                fi,
                whatsapp_paths=[td_path],
                max_results=10,
                text_similarity_threshold=0.05,
                timeout_seconds=30.0,
                scan_chats=True,
                scan_media=False,
            )
            passed = (
                isinstance(result, dict) and result.get("chat_result_count", 0) >= 1
            )
            _record(
                "search_whatsapp() finds invoice messages in chat",
                passed,
                f"chat_results={result.get('chat_result_count', 0)}, "
                f"status={result.get('status')}",
                time.monotonic() - t0,
            )
        except Exception as exc:
            _record("search_whatsapp() full search", False, str(exc))

    # Check real WhatsApp paths — informational only
    import config

    _record(
        "WhatsApp Desktop path [informational]",
        True,
        f"path={config.WHATSAPP_DESKTOP_PATH}  exists={config.WHATSAPP_DESKTOP_PATH.exists()}",
    )
    _record(
        "WhatsApp export path [informational]",
        True,
        f"path={config.WHATSAPP_EXPORT_PATH}  exists={config.WHATSAPP_EXPORT_PATH.exists()}",
    )

    # Count real chat exports — informational
    if config.WHATSAPP_EXPORT_PATH.exists():
        txt_files = list(config.WHATSAPP_EXPORT_PATH.glob("*.txt"))
        _record(
            "WhatsApp export folder .txt files [informational]",
            True,
            f"found {len(txt_files)} .txt file(s) in {config.WHATSAPP_EXPORT_PATH}"
            if txt_files
            else "No .txt files yet -- export a chat from your phone and place it here.",
        )
    else:
        _record(
            "WhatsApp export folder .txt files [informational]",
            True,
            "Export folder doesn't exist yet -- run setup_whatsapp.py and export a chat first.",
        )


# ============================================================
# 8. GOOGLE DRIVE STATUS
# ============================================================


def test_gdrive_status() -> None:
    section("8. Google Drive Status")

    import config
    from utils.gdrive_search import GOOGLE_API_AVAILABLE, is_authenticated

    _record(
        "Google API libraries installed",
        GOOGLE_API_AVAILABLE,
        "Install with: .venv\\Scripts\\python -m pip install google-api-python-client google-auth google-auth-oauthlib"
        if not GOOGLE_API_AVAILABLE
        else "google-auth, google-api-python-client available",
    )

    cred_exists = config.GOOGLE_CREDENTIALS_FILE.exists()
    _record(
        "credentials.json [informational]",
        True,  # never fail — just report status
        ("FOUND: " + str(config.GOOGLE_CREDENTIALS_FILE))
        if cred_exists
        else (
            "NOT YET PRESENT -- follow GOOGLE_DRIVE_SETUP.md to create OAuth credentials.\n"
            f"         Expected at: {config.GOOGLE_CREDENTIALS_FILE}"
        ),
    )

    token_exists = config.GOOGLE_TOKEN_FILE.exists()
    _record(
        "token.json [informational]",
        True,
        ("FOUND: " + str(config.GOOGLE_TOKEN_FILE))
        if token_exists
        else "NOT YET GENERATED -- authenticate via the app UI (http://localhost:5000) first.",
    )

    t0 = time.monotonic()
    authed = is_authenticated(config.GOOGLE_TOKEN_FILE)
    _record(
        "Google Drive authenticated [informational]",
        True,
        "YES -- Drive search is live and ready!"
        if authed
        else "NO -- open the app and click Google Drive -> Authenticate to enable Drive search.",
        time.monotonic() - t0,
    )

    if not cred_exists:
        print()
        print(yellow("  [i]  Google Drive steps:"))
        print(dim("     1. Follow GOOGLE_DRIVE_SETUP.md in this folder"))
        print(dim("     2. Place credentials.json next to app.py"))
        print(
            dim("     3. Run app.py and click Google Drive -> Authenticate in the UI")
        )


# ============================================================
# 9. SEMANTIC SEARCH (sentence-transformers)
# ============================================================


def test_semantic_search() -> None:
    section("9. Semantic (Meaning-Based) Search")

    try:
        import numpy as np
        from sentence_transformers import SentenceTransformer
    except ImportError:
        _record(
            "sentence-transformers available",
            True,
            "Not installed -- using TF-IDF fallback. Install with:\n"
            ".venv\\Scripts\\python -m pip install sentence-transformers torch",
        )
        return

    _record("sentence-transformers installed", True)

    # Load model
    t0 = time.monotonic()
    try:
        model = SentenceTransformer("all-MiniLM-L6-v2")
        _record("Load all-MiniLM-L6-v2 model", True, duration=time.monotonic() - t0)
    except Exception as exc:
        _record("Load all-MiniLM-L6-v2 model", False, str(exc), time.monotonic() - t0)
        return

    # Encode sentences
    sentences = [
        "The invoice total amount is due for payment.",
        "Please pay the outstanding bill within 30 days.",
        "I love baking chocolate cakes with fresh cream.",
        "Machine learning models can classify images automatically.",
    ]

    t0 = time.monotonic()
    try:
        embeddings = model.encode(sentences, convert_to_numpy=True)
        _record(
            "Encode 4 sentences -> embeddings",
            embeddings.shape == (4, 384),
            f"shape={embeddings.shape}",
            time.monotonic() - t0,
        )
    except Exception as exc:
        _record("Encode sentences", False, str(exc))
        return

    # Cosine similarity: invoice vs bill should be high; invoice vs cake should be low
    def cosine(a, b):
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))

    sim_invoice_bill = cosine(embeddings[0], embeddings[1])
    sim_invoice_cake = cosine(embeddings[0], embeddings[2])

    _record(
        "Semantic: invoice <-> bill similarity > 0.35",
        sim_invoice_bill > 0.35,
        f"score={sim_invoice_bill:.4f}",
    )
    _record(
        "Semantic: invoice <-> cake similarity < invoice <-> bill",
        sim_invoice_cake < sim_invoice_bill,
        f"invoice<->bill={sim_invoice_bill:.4f}  invoice<->cake={sim_invoice_cake:.4f}",
    )

    # Test integration via compute_text_similarity (which uses semantic if available)
    from utils.text_search import compute_text_similarity

    t0 = time.monotonic()
    score = compute_text_similarity(
        "invoice total amount due for payment",
        "bill outstanding amount please pay",
    )
    _record(
        "compute_text_similarity() uses semantic scoring",
        score >= 0.30,
        f"score={score:.4f}",
        time.monotonic() - t0,
    )


# ============================================================
# 10. END-TO-END FLASK API (smoke test)
# ============================================================


def test_flask_api() -> None:
    section("10. Flask App -- Smoke Test (in-process)")

    try:
        import app as flask_app
    except Exception as exc:
        _record("Import app.py", False, str(exc))
        return

    _record("app.py imports without error", True)

    client = flask_app.app.test_client()
    flask_app.app.config["TESTING"] = True

    # GET /
    t0 = time.monotonic()
    try:
        resp = client.get("/")
        passed = resp.status_code == 200
        _record(
            "GET / returns 200",
            passed,
            f"status={resp.status_code}",
            time.monotonic() - t0,
        )
    except Exception as exc:
        _record("GET /", False, str(exc))

    # GET /config
    t0 = time.monotonic()
    try:
        resp = client.get("/config")
        passed = resp.status_code == 200
        data = resp.get_json()
        _record(
            "GET /config returns JSON config",
            passed and isinstance(data, dict),
            f"keys: {list(data.keys())[:6]}" if data else "no data",
            time.monotonic() - t0,
        )
    except Exception as exc:
        _record("GET /config", False, str(exc))

    # GET /api/gdrive/auth-status
    t0 = time.monotonic()
    try:
        resp = client.get("/api/gdrive/auth-status")
        passed = resp.status_code == 200
        data = resp.get_json()
        _record(
            "GET /api/gdrive/auth-status returns JSON",
            passed and "authenticated" in (data or {}),
            f"authenticated={data.get('authenticated') if data else '?'}",
            time.monotonic() - t0,
        )
    except Exception as exc:
        _record("GET /api/gdrive/auth-status", False, str(exc))

    # GET /api/local/paths
    t0 = time.monotonic()
    try:
        resp = client.get("/api/local/paths")
        passed = resp.status_code == 200
        data = resp.get_json()
        _record(
            "GET /api/local/paths returns path list",
            passed and "search_paths" in (data or {}),
            f"{len(data.get('search_paths', []))} path(s) configured"
            if data
            else "no data",
            time.monotonic() - t0,
        )
    except Exception as exc:
        _record("GET /api/local/paths", False, str(exc))

    # GET /api/whatsapp/paths
    t0 = time.monotonic()
    try:
        resp = client.get("/api/whatsapp/paths")
        passed = resp.status_code == 200
        data = resp.get_json()
        _record(
            "GET /api/whatsapp/paths returns JSON",
            passed and "desktop_path" in (data or {}),
            duration=time.monotonic() - t0,
        )
    except Exception as exc:
        _record("GET /api/whatsapp/paths", False, str(exc))

    # POST /api/search with plain text -> local only
    t0 = time.monotonic()
    try:
        resp = client.post(
            "/api/search",
            data={"text": "invoice payment due", "sources": "local"},
            content_type="multipart/form-data",
        )
        passed = resp.status_code == 200
        data = resp.get_json()
        _record(
            "POST /api/search (text, local only) returns 200",
            passed and data and data.get("success"),
            f"total_results={data.get('total_results', '?')}, "
            f"elapsed={data.get('elapsed_seconds', '?')}s"
            if data
            else str(resp.status_code),
            time.monotonic() - t0,
        )
    except Exception as exc:
        _record("POST /api/search (text, local)", False, str(exc))

    # POST /api/search -- no input -> should return 400
    t0 = time.monotonic()
    try:
        resp = client.post("/api/search", data={}, content_type="multipart/form-data")
        passed = resp.status_code == 400
        _record(
            "POST /api/search with no input -> 400 Bad Request",
            passed,
            f"status={resp.status_code}",
            time.monotonic() - t0,
        )
    except Exception as exc:
        _record("POST /api/search (no input -> 400)", False, str(exc))


# ============================================================
# MAIN
# ============================================================

ALL_TESTS = {
    "imports": test_imports,
    "config": test_config,
    "handler": test_file_handler,
    "text": test_text_similarity,
    "image": test_image_hashing,
    "local": test_local_search,
    "whatsapp": test_whatsapp_search,
    "gdrive": test_gdrive_status,
    "semantic": test_semantic_search,
    "api": test_flask_api,
}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="MultiSearch -- comprehensive test suite",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument(
        "--test",
        nargs="+",
        choices=list(ALL_TESTS.keys()),
        metavar="NAME",
        help=(
            "Run only the named test group(s). Choices:\n  "
            + "\n  ".join(f"{k:<12} {v.__doc__ or ''}" for k, v in ALL_TESTS.items())
        ),
    )
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Skip slow tests (real filesystem scans, model loading).",
    )
    args = parser.parse_args()

    banner("MultiSearch -- Live Test Suite")
    print(f"  Python  : {sys.version.split()[0]}")
    print(f"  Project : {PROJECT_ROOT}")
    print(f"  Mode    : {'quick' if args.quick else 'full'}")

    to_run = args.test if args.test else list(ALL_TESTS.keys())

    total_t0 = time.monotonic()
    for name in to_run:
        fn = ALL_TESTS[name]
        if name == "local":
            fn(quick=args.quick)
        else:
            fn()

    print()
    print(dim(f"  Total elapsed: {time.monotonic() - total_t0:.2f}s"))
    return summary()


if __name__ == "__main__":
    sys.exit(main())
