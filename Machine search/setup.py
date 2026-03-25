# ============================================================
# setup.py - Setup and Installation Script
# Multi-Source File Search Application
# ============================================================
# Run this script once to:
#   1. Create a virtual environment
#   2. Install all dependencies
#   3. Create the .env file from the template
#   4. Verify the installation
#
# Usage:
#   python setup.py
# ============================================================

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

# ============================================================
# CONSTANTS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
VENV_DIR = BASE_DIR / ".venv"
REQUIREMENTS_FILE = BASE_DIR / "requirements.txt"
ENV_EXAMPLE = BASE_DIR / ".env.example"
ENV_FILE = BASE_DIR / ".env"

IS_WINDOWS = platform.system() == "Windows"
PYTHON_EXE = str(VENV_DIR / ("Scripts" if IS_WINDOWS else "bin") / "python")
PIP_EXE = str(VENV_DIR / ("Scripts" if IS_WINDOWS else "bin") / "pip")

# ANSI colour codes (Windows 10+ supports these in cmd/PowerShell)
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


# ============================================================
# HELPERS
# ============================================================


def log(msg: str, colour: str = "") -> None:
    print(f"{colour}{msg}{RESET}" if colour else msg)


def log_step(step: int, total: int, msg: str) -> None:
    log(f"\n{BOLD}[{step}/{total}] {msg}{RESET}", CYAN)


def log_ok(msg: str) -> None:
    log(f"  ✅  {msg}", GREEN)


def log_warn(msg: str) -> None:
    log(f"  ⚠️   {msg}", YELLOW)


def log_err(msg: str) -> None:
    log(f"  ❌  {msg}", RED)


def run(
    cmd: list[str], check: bool = True, capture: bool = False
) -> subprocess.CompletedProcess:
    """Run a shell command and optionally capture output."""
    kwargs: dict = {
        "check": check,
        "text": True,
    }
    if capture:
        kwargs["stdout"] = subprocess.PIPE
        kwargs["stderr"] = subprocess.PIPE
    else:
        kwargs["stdout"] = None
        kwargs["stderr"] = None

    return subprocess.run(cmd, **kwargs)


def check_python_version() -> None:
    """Ensure Python 3.10+ is being used."""
    major, minor = sys.version_info[:2]
    if major < 3 or (major == 3 and minor < 10):
        log_err(
            f"Python 3.10 or higher is required. You are using Python {major}.{minor}."
        )
        log_err("Download the latest Python from https://www.python.org/downloads/")
        sys.exit(1)
    log_ok(f"Python {major}.{minor} detected.")


# ============================================================
# STEP 1 – Virtual Environment
# ============================================================


def create_venv() -> None:
    """Create a Python virtual environment in .venv/"""
    if VENV_DIR.exists():
        log_warn(f"Virtual environment already exists at: {VENV_DIR}")
        log_warn("Skipping creation. Delete .venv/ to recreate it.")
        return

    log(f"  Creating virtual environment at: {VENV_DIR}")
    try:
        run([sys.executable, "-m", "venv", str(VENV_DIR)])
        log_ok("Virtual environment created.")
    except subprocess.CalledProcessError as exc:
        log_err(f"Failed to create virtual environment: {exc}")
        sys.exit(1)


# ============================================================
# STEP 2 – Upgrade pip
# ============================================================


def upgrade_pip() -> None:
    """Upgrade pip inside the virtual environment."""
    log("  Upgrading pip…")
    try:
        run([PYTHON_EXE, "-m", "pip", "install", "--upgrade", "pip"], check=False)
        log_ok("pip upgraded.")
    except Exception as exc:
        log_warn(f"pip upgrade failed (non-fatal): {exc}")


# ============================================================
# STEP 3 – Install Dependencies
# ============================================================


def install_requirements() -> None:
    """Install packages from requirements.txt."""
    if not REQUIREMENTS_FILE.exists():
        log_err(f"requirements.txt not found at: {REQUIREMENTS_FILE}")
        sys.exit(1)

    log(f"  Installing packages from: {REQUIREMENTS_FILE}")
    log("  (This may take several minutes on first run – ML libraries are large)\n")

    # Install in two passes:
    # Pass 1: lightweight packages first (avoids dependency conflicts with torch)
    lightweight = [
        "flask",
        "flask-cors",
        "werkzeug",
        "python-dotenv",
        "requests",
        "chardet",
        "rapidfuzz",
        "Pillow",
        "imagehash",
        "pdfplumber",
        "PyPDF2",
        "python-docx",
        "openpyxl",
        "striprtf",
        "google-auth",
        "google-auth-oauthlib",
        "google-auth-httplib2",
        "google-api-python-client",
    ]

    log("  Pass 1 – Installing lightweight packages…")
    try:
        run([PIP_EXE, "install", "--upgrade"] + lightweight)
        log_ok("Lightweight packages installed.")
    except subprocess.CalledProcessError as exc:
        log_warn(f"Some lightweight packages failed: {exc}")

    # Pass 2: heavier ML packages (optional – skip if they fail)
    heavy = [
        "numpy",
        "scikit-learn",
        "torch",
        "transformers",
        "sentence-transformers",
        "opencv-python",
    ]

    log("\n  Pass 2 – Installing ML/AI packages (optional, may take a while)…")
    log(
        "  Tip: If this hangs, you can Ctrl+C and the app will still work without ML features.\n"
    )

    for pkg in heavy:
        try:
            result = run(
                [PIP_EXE, "install", "--upgrade", pkg], check=False, capture=True
            )
            if result.returncode == 0:
                log_ok(f"Installed: {pkg}")
            else:
                log_warn(
                    f"Could not install {pkg} (optional): {result.stderr.strip()[:120]}"
                )
        except Exception as exc:
            log_warn(f"Could not install {pkg} (optional): {exc}")

    log_ok("Dependency installation complete.")


# ============================================================
# STEP 4 – Create .env File
# ============================================================


def create_env_file() -> None:
    """Copy .env.example to .env if .env doesn't already exist."""
    if ENV_FILE.exists():
        log_warn(".env file already exists. Skipping creation.")
        return

    if not ENV_EXAMPLE.exists():
        log_warn(".env.example not found – creating a minimal .env instead.")
        _write_minimal_env()
        return

    shutil.copy(str(ENV_EXAMPLE), str(ENV_FILE))
    log_ok(f".env file created at: {ENV_FILE}")
    log_warn("Please review and edit .env to set your paths and API credentials.")


def _write_minimal_env() -> None:
    """Write a minimal .env file with sensible defaults."""
    home = Path.home()
    content = f"""# Multi-Source File Search – Environment Configuration
# Edit this file to match your setup.

SECRET_KEY=change-this-to-a-random-secret-key
FLASK_ENV=development
DEBUG=True
PORT=5000

GOOGLE_CREDENTIALS_FILE=credentials.json
GOOGLE_TOKEN_FILE=token.json
GOOGLE_DRIVE_SCOPES=https://www.googleapis.com/auth/drive.readonly

LOCAL_SEARCH_PATHS={home / "Documents"},{home / "Downloads"},{home / "Desktop"}
LOCAL_SEARCH_MAX_DEPTH=10
LOCAL_SEARCH_MAX_FILE_SIZE_MB=50

WHATSAPP_DESKTOP_PATH={home / "AppData" / "Local" / "Packages" / "5319275A.WhatsAppDesktop_cv1g1gvanyjgm" / "LocalState" / "shared" / "transfers"}
WHATSAPP_EXPORT_PATH={home / "Documents" / "WhatsApp Chats"}

IMAGE_SIMILARITY_THRESHOLD=0.85
TEXT_SIMILARITY_THRESHOLD=0.60
PDF_SIMILARITY_THRESHOLD=0.65
MAX_RESULTS_PER_SOURCE=20

UPLOAD_FOLDER=uploads
MAX_UPLOAD_SIZE_MB=100

GOOGLE_VISION_API_KEY=
OPENAI_API_KEY=
"""
    ENV_FILE.write_text(content, encoding="utf-8")
    log_ok(f"Minimal .env created at: {ENV_FILE}")


# ============================================================
# STEP 5 – Create Necessary Directories
# ============================================================


def create_directories() -> None:
    """Ensure required directories exist."""
    dirs = [
        BASE_DIR / "uploads",
        BASE_DIR / "static" / "css",
        BASE_DIR / "static" / "js",
        BASE_DIR / "templates",
        BASE_DIR / "utils",
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)
    log_ok("Required directories verified.")


# ============================================================
# STEP 6 – Verify Installation
# ============================================================


def verify_installation() -> dict[str, bool]:
    """
    Import key packages inside the venv and return a status dict.
    """
    checks = {
        "flask": "import flask",
        "werkzeug": "import werkzeug",
        "python-dotenv": "import dotenv",
        "Pillow": "from PIL import Image",
        "imagehash": "import imagehash",
        "pdfplumber": "import pdfplumber",
        "rapidfuzz": "from rapidfuzz import fuzz",
        "google-auth": "import google.auth",
        "google-api-python-client": "from googleapiclient.discovery import build",
        "scikit-learn": "from sklearn.feature_extraction.text import TfidfVectorizer",
        "chardet": "import chardet",
        "python-docx": "import docx",
        "openpyxl": "import openpyxl",
        "numpy": "import numpy",
        "sentence-transformers": "from sentence_transformers import SentenceTransformer",
    }

    results: dict[str, bool] = {}
    for name, import_stmt in checks.items():
        try:
            proc = run(
                [PYTHON_EXE, "-c", import_stmt],
                check=False,
                capture=True,
            )
            results[name] = proc.returncode == 0
        except Exception:
            results[name] = False

    return results


def print_verification_results(results: dict[str, bool]) -> None:
    """Pretty-print the verification results."""
    log("\n  Package verification:")
    all_ok = True
    optional = {"sentence-transformers", "numpy", "scikit-learn"}

    for pkg, ok in results.items():
        is_optional = pkg in optional
        marker = "✅" if ok else ("⚠️ " if is_optional else "❌")
        suffix = " (optional)" if is_optional and not ok else ""
        colour = GREEN if ok else (YELLOW if is_optional else RED)
        log(f"    {marker} {pkg}{suffix}", colour)
        if not ok and not is_optional:
            all_ok = False

    if all_ok:
        log_ok("\nAll required packages are installed correctly!")
    else:
        log_err("\nSome required packages failed to install.")
        log_err("Try running:  pip install -r requirements.txt")
        log_err("inside the .venv environment manually.")


# ============================================================
# STEP 7 – Print Run Instructions
# ============================================================


def print_run_instructions() -> None:
    """Print instructions for running the app."""
    activate_cmd = (
        r".venv\Scripts\activate" if IS_WINDOWS else "source .venv/bin/activate"
    )
    run_cmd = f"{PYTHON_EXE} app.py"

    log(f"""
{BOLD}{CYAN}{"=" * 60}
  Setup Complete!
{"=" * 60}{RESET}

{BOLD}To start the application:{RESET}

  Option A – Direct run (recommended):
    {GREEN}{run_cmd}{RESET}

  Option B – Activate venv first, then run:
    {GREEN}{activate_cmd}{RESET}
    {GREEN}python app.py{RESET}

{BOLD}Then open your browser at:{RESET}
  {GREEN}http://localhost:5000{RESET}

{BOLD}Before searching Google Drive:{RESET}
  1. Download credentials.json from Google Cloud Console
  2. Place it in: {BASE_DIR}
  3. Click "Google Drive" in the app header to authenticate

{BOLD}For WhatsApp search:{RESET}
  1. Export a chat from WhatsApp (More options → Export chat)
  2. Save to: {Path.home() / "Documents" / "WhatsApp Chats"}
  3. Extract if zipped — the app will find _chat.txt automatically

{BOLD}Configuration file:{RESET}
  {ENV_FILE}

{BOLD}Need help?{RESET}
  See README.md for full documentation.

{"=" * 60}
""")


# ============================================================
# MAIN
# ============================================================


def main() -> None:
    # Enable ANSI colours on Windows
    if IS_WINDOWS:
        os.system("")

    log(f"""
{BOLD}{CYAN}{"=" * 60}
  Multi-Source File Search – Setup Script
  Python {sys.version.split()[0]} on {platform.system()} {platform.machine()}
{"=" * 60}{RESET}
""")

    total_steps = 7

    log_step(1, total_steps, "Checking Python version")
    check_python_version()

    log_step(2, total_steps, "Creating virtual environment")
    create_venv()

    log_step(3, total_steps, "Upgrading pip")
    upgrade_pip()

    log_step(4, total_steps, "Installing dependencies")
    install_requirements()

    log_step(5, total_steps, "Creating .env configuration file")
    create_env_file()

    log_step(6, total_steps, "Creating required directories")
    create_directories()

    log_step(7, total_steps, "Verifying installation")
    results = verify_installation()
    print_verification_results(results)

    print_run_instructions()


if __name__ == "__main__":
    main()
