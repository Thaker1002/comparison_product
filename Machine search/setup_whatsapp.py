# ============================================================
# setup_whatsapp.py
# WhatsApp path setup helper for MultiSearch
# Run this once to create the required folders and print
# step-by-step instructions for connecting WhatsApp exports.
# ============================================================

from __future__ import annotations

import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Resolve project root so we can import config even if cwd differs
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

try:
    import config
except Exception as exc:
    print(f"[ERROR] Could not import config.py: {exc}")
    print("Make sure you run this script from inside the 'Machine search' folder.")
    sys.exit(1)

# ---------------------------------------------------------------------------
# ANSI colours (Windows 10+ supports them; fall back gracefully)
# ---------------------------------------------------------------------------
try:
    import ctypes

    kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
    kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
    ANSI = True
except Exception:
    ANSI = sys.platform != "win32"


def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if ANSI else text


def green(t: str) -> str:
    return _c("32;1", t)


def yellow(t: str) -> str:
    return _c("33;1", t)


def red(t: str) -> str:
    return _c("31;1", t)


def cyan(t: str) -> str:
    return _c("36;1", t)


def bold(t: str) -> str:
    return _c("1", t)


def dim(t: str) -> str:
    return _c("2", t)


# ============================================================
# HELPERS
# ============================================================


def banner(title: str) -> None:
    width = 62
    print()
    print(cyan("=" * width))
    print(cyan(f"  {title}"))
    print(cyan("=" * width))


def section(title: str) -> None:
    print()
    print(bold(f"-- {title}"))
    print(dim("-" * 50))


def ok(msg: str) -> None:
    print(f"  {green('[OK]')}  {msg}")


def warn(msg: str) -> None:
    print(f"  {yellow('[!]')}  {msg}")


def info(msg: str) -> None:
    print(f"  {cyan('[i]')}  {msg}")


def step(n: int, msg: str) -> None:
    print(f"\n  {bold(str(n) + '.')} {msg}")


def make_dir(path: Path, label: str) -> bool:
    """Create directory if it does not exist. Return True if newly created."""
    if path.exists():
        ok(f"{label} already exists:\n       {dim(str(path))}")
        return False
    try:
        path.mkdir(parents=True, exist_ok=True)
        ok(f"Created {label}:\n       {dim(str(path))}")
        return True
    except OSError as exc:
        warn(f"Could not create {label}: {exc}\n       Path: {path}")
        return False


# ============================================================
# DETECTION
# ============================================================


def detect_whatsapp_desktop() -> list[Path]:
    """
    Try to find WhatsApp Desktop transfer / media folders automatically.
    Checks both the Microsoft Store package location and the classic
    WhatsApp Desktop install paths.
    """
    candidates: list[Path] = []
    home = Path.home()

    # Microsoft Store version
    packages_dir = home / "AppData" / "Local" / "Packages"
    if packages_dir.exists():
        for pkg in packages_dir.iterdir():
            if "whatsapp" in pkg.name.lower():
                for sub in [
                    pkg / "LocalState" / "shared" / "transfers",
                    pkg / "LocalState" / "Media",
                    pkg / "LocalState",
                ]:
                    if sub.exists():
                        candidates.append(sub)

    # Classic / non-Store WhatsApp Desktop
    roaming = home / "AppData" / "Roaming" / "WhatsApp"
    if roaming.exists():
        candidates.append(roaming)

    # WhatsApp Web downloaded files sometimes land in Downloads/WhatsApp
    for label in ["WhatsApp", "WhatsApp Media"]:
        candidate = home / "Downloads" / label
        if candidate.exists():
            candidates.append(candidate)

    return candidates


def find_chat_exports() -> list[Path]:
    """
    Search common locations for WhatsApp chat export files (_chat.txt).
    """
    search_roots = [
        Path.home() / "Documents",
        Path.home() / "Downloads",
        Path.home() / "Desktop",
        config.WHATSAPP_EXPORT_PATH,
    ]
    found: list[Path] = []
    for root in search_roots:
        if not root.exists():
            continue
        try:
            for p in root.rglob("_chat.txt"):
                found.append(p)
            for p in root.rglob("*WhatsApp*Chat*.txt"):
                found.append(p)
        except PermissionError:
            pass
    return list(dict.fromkeys(found))  # deduplicate, preserve order


# ============================================================
# MAIN
# ============================================================


def main() -> None:
    banner("MultiSearch -- WhatsApp Setup Helper")

    # ------------------------------------------------------------------
    # 1. Show current config
    # ------------------------------------------------------------------
    section("Current WhatsApp Configuration (from .env)")
    info(f"WHATSAPP_DESKTOP_PATH  = {config.WHATSAPP_DESKTOP_PATH}")
    info(f"WHATSAPP_EXPORT_PATH   = {config.WHATSAPP_EXPORT_PATH}")
    if config.WHATSAPP_ANDROID_BACKUP_PATH:
        info(f"WHATSAPP_ANDROID_BACKUP_PATH = {config.WHATSAPP_ANDROID_BACKUP_PATH}")

    # ------------------------------------------------------------------
    # 2. Auto-detect WhatsApp Desktop folders
    # ------------------------------------------------------------------
    section("Auto-Detecting WhatsApp Desktop Folders")
    detected = detect_whatsapp_desktop()
    if detected:
        ok(f"Found {len(detected)} WhatsApp Desktop folder(s):")
        for p in detected:
            print(f"       {dim(str(p))}")
        print()
        info("If these differ from your WHATSAPP_DESKTOP_PATH in .env, update it.")
        info("The first entry above is usually the correct one to use.")
    else:
        warn("No WhatsApp Desktop folders detected automatically.")
        info("WhatsApp Desktop may not be installed, or uses a non-standard location.")

    # Check configured path
    if config.WHATSAPP_DESKTOP_PATH.exists():
        ok(f"Configured desktop path exists and is accessible.")
    else:
        warn(f"Configured desktop path does NOT exist:")
        print(f"       {dim(str(config.WHATSAPP_DESKTOP_PATH))}")
        if detected:
            suggestion = detected[0]
            print()
            info(f"Suggested fix -- update your .env:")
            print(f"       WHATSAPP_DESKTOP_PATH={suggestion}")

    # ------------------------------------------------------------------
    # 3. Create the chat export folder
    # ------------------------------------------------------------------
    section("WhatsApp Chat Export Folder")
    make_dir(config.WHATSAPP_EXPORT_PATH, "WhatsApp export folder")

    # ------------------------------------------------------------------
    # 4. Scan for existing chat exports
    # ------------------------------------------------------------------
    section("Scanning for Existing Chat Export Files")
    exports = find_chat_exports()
    if exports:
        ok(f"Found {len(exports)} chat export file(s):")
        for p in exports[:10]:
            size_kb = round(p.stat().st_size / 1024, 1)
            print(f"       {dim(str(p))}  ({size_kb} KB)")
        if len(exports) > 10:
            print(f"       ... and {len(exports) - 10} more.")
        print()
        info(f"Copy any _chat.txt files you want to search into:")
        print(f"       {dim(str(config.WHATSAPP_EXPORT_PATH))}")
    else:
        warn("No WhatsApp chat export files found yet.")
        info("Follow the steps below to export chats from your phone.")

    # ------------------------------------------------------------------
    # 5. Step-by-step instructions
    # ------------------------------------------------------------------
    section("How to Export WhatsApp Chats from Your Phone")

    print()
    print(bold("  Android:"))
    step(1, "Open WhatsApp on your Android phone.")
    step(2, "Open the chat (group or individual) you want to export.")
    step(3, "Tap the three-dot menu (...) in the top-right corner.")
    step(4, "Tap More -> Export chat.")
    step(5, "Choose Without Media (much smaller file, chats only).")
    step(6, "Share or save the file. Send it to yourself via email or Google Drive.")
    step(
        7,
        f"Copy the received _chat.txt into:\n       {dim(str(config.WHATSAPP_EXPORT_PATH))}",
    )

    print()
    print(bold("  iPhone / iOS:"))
    step(1, "Open WhatsApp on your iPhone.")
    step(2, "Open the chat you want to export.")
    step(3, "Tap the contact or group name at the top.")
    step(4, "Scroll down and tap Export Chat.")
    step(5, "Choose Without Media.")
    step(6, "Share it to yourself via AirDrop, iCloud Drive, or email.")
    step(
        7,
        f"Copy the received _chat.txt into:\n       {dim(str(config.WHATSAPP_EXPORT_PATH))}",
    )

    # ------------------------------------------------------------------
    # 6. .env update instructions
    # ------------------------------------------------------------------
    section("Updating Your .env File (if needed)")
    env_path = PROJECT_ROOT / ".env"
    print()
    info(f".env location: {dim(str(env_path))}")
    print()
    print("  Open .env in any text editor and adjust these lines:")
    print()
    print(dim("  # Path where WhatsApp Desktop stores transferred media"))
    if detected:
        print(f"  WHATSAPP_DESKTOP_PATH={detected[0]}")
    else:
        print(f"  WHATSAPP_DESKTOP_PATH=C:\\path\\to\\WhatsApp\\transfers")
    print()
    print(dim("  # Folder where you will save exported _chat.txt files"))
    print(f"  WHATSAPP_EXPORT_PATH={config.WHATSAPP_EXPORT_PATH}")
    print()
    print(
        dim(
            "  # Optional: Android backup path (if you copied WhatsApp folder from phone)"
        )
    )
    print(f"  WHATSAPP_ANDROID_BACKUP_PATH=C:\\path\\to\\WhatsApp\\on\\phone")

    # ------------------------------------------------------------------
    # 7. Verification checklist
    # ------------------------------------------------------------------
    section("Setup Checklist")
    checks = [
        (
            config.WHATSAPP_EXPORT_PATH.exists(),
            f"Export folder exists: {config.WHATSAPP_EXPORT_PATH}",
            f"Export folder missing -- created above: {config.WHATSAPP_EXPORT_PATH}",
        ),
        (
            any(config.WHATSAPP_EXPORT_PATH.glob("*.txt"))
            if config.WHATSAPP_EXPORT_PATH.exists()
            else False,
            "At least one _chat.txt is present in the export folder",
            "No .txt files in export folder -- export a chat from your phone first",
        ),
        (
            config.WHATSAPP_DESKTOP_PATH.exists(),
            f"WhatsApp Desktop path exists",
            f"WhatsApp Desktop path not found (optional -- only needed for WhatsApp Desktop media)",
        ),
    ]

    all_ok = True
    for passed, pass_msg, fail_msg in checks:
        if passed:
            ok(pass_msg)
        else:
            warn(fail_msg)
            all_ok = False

    print()
    if all_ok:
        print(
            green(
                "  [OK]  WhatsApp is fully configured! Start the app and search away."
            )
        )
    else:
        print(
            yellow(
                "  [!]  Complete the steps above, then re-run this script to verify."
            )
        )

    # ------------------------------------------------------------------
    # 8. Quick start reminder
    # ------------------------------------------------------------------
    section("Start the App")
    print()
    print("  From the project folder in PowerShell:")
    print()
    print(f"    {cyan('.venv\\Scripts\\python app.py')}")
    print()
    print(f"  Then open:  {cyan('http://localhost:5000')}")
    print()
    print(dim("  In the search UI, make sure the WhatsApp source toggle is enabled."))
    print()


if __name__ == "__main__":
    main()
