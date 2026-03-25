/* ============================================================
   main.js – MultiSearch Frontend Logic
   Matches redesigned HTML/CSS with glassmorphism theme
   ============================================================ */

"use strict";

// ─── HELPERS ──────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatTimestamp(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  if (isNaN(d)) return ts;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function truncate(str, n = 120) {
  if (!str) return "";
  return str.length > n ? str.slice(0, n) + "…" : str;
}

function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fileIcon(filename) {
  const ext = (filename || "").split(".").pop().toLowerCase();
  const imageExts = [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "bmp",
    "webp",
    "tiff",
    "tif",
    "svg",
    "ico",
  ];
  const pdfExts = ["pdf"];
  const docExts = ["doc", "docx", "odt", "rtf"];
  const xlsExts = ["xls", "xlsx", "csv", "ods"];
  const pptExts = ["ppt", "pptx", "odp"];
  const textExts = ["txt", "md", "markdown", "rst"];
  const codeExts = [
    "json",
    "xml",
    "html",
    "htm",
    "yaml",
    "yml",
    "js",
    "py",
    "ts",
    "css",
  ];
  if (imageExts.includes(ext)) return "🖼️";
  if (pdfExts.includes(ext)) return "📕";
  if (docExts.includes(ext)) return "📝";
  if (xlsExts.includes(ext)) return "📊";
  if (pptExts.includes(ext)) return "📽️";
  if (textExts.includes(ext)) return "📄";
  if (codeExts.includes(ext)) return "🗒️";
  return "📁";
}

function scoreInfo(score) {
  const pct = Math.round((score || 0) * 100);
  if (pct >= 75) return { cls: "high", label: `${pct}% match` };
  if (pct >= 45) return { cls: "medium", label: `${pct}% match` };
  return { cls: "low", label: `${pct}% match` };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── TOAST SYSTEM ─────────────────────────────────────────
function showToast(message, type = "info", duration = 3500) {
  const container = $("#toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const icons = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" };
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || "ℹ️"}</span>
    <span class="toast-text">${escHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "toastOut 0.25s ease forwards";
    setTimeout(() => toast.remove(), 260);
  }, duration);
}

// inject toastOut keyframe once
(function injectToastOut() {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes toastOut {
      to { opacity: 0; transform: translateY(10px) scale(0.94); }
    }
  `;
  document.head.appendChild(style);
})();

// ─── THEME TOGGLE ─────────────────────────────────────────
function initTheme() {
  const btn = $("#btnTheme");
  const saved = localStorage.getItem("ms-theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);

  if (btn) {
    btn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("ms-theme", next);
    });
  }
}

// ─── APP STATE ────────────────────────────────────────────
const state = {
  selectedFile: null,
  searching: false,
  lastResults: null,
};

// ─── INPUT TABS ───────────────────────────────────────────
function initInputTabs() {
  const tabBtns = $$(".tab-bar .tab-btn");
  const tabPanels = $$(".tab-panel");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      tabBtns.forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      tabPanels.forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      const panel = $(`#tab-${target}`);
      if (panel) panel.classList.add("active");
    });
  });
}

// ─── RESULTS TABS ─────────────────────────────────────────
function initResultsTabs() {
  const rtabBtns = $$(".rtab-bar .rtab");

  rtabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.rtab;
      rtabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const panelMap = {
        all: "resultsAll",
        gdrive: "resultsGdrive",
        local: "resultsLocal",
        whatsapp: "resultsWhatsapp",
      };
      $$(".result-panel").forEach((p) => p.classList.add("hidden"));
      const panel = $(`#${panelMap[target]}`);
      if (panel) {
        panel.classList.remove("hidden");
        panel.classList.add("active");
      }
    });
  });
}

// ─── FILE UPLOAD ──────────────────────────────────────────
function initFileUpload() {
  const dropZone = $("#dropZone");
  const fileInput = $("#fileInput");
  const btnClear = $("#btnClearFile");

  if (!dropZone) return;

  // Click on drop zone triggers file input
  dropZone.addEventListener("click", () => fileInput && fileInput.click());
  dropZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") fileInput && fileInput.click();
  });

  // Drag events
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () =>
    dropZone.classList.remove("drag-over"),
  );
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    const file = e.dataTransfer?.files?.[0];
    if (file) selectFile(file);
  });

  // File input change
  fileInput?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) selectFile(file);
  });

  // Clear button
  btnClear?.addEventListener("click", clearFile);
}

function selectFile(file) {
  state.selectedFile = file;
  const preview = $("#filePreview");
  const dropZone = $("#dropZone");
  const previewImg = $("#previewImg");
  const previewIcon = $("#previewIcon");
  const nameEl = $("#previewName");
  const sizeEl = $("#previewSize");
  const typeEl = $("#previewType");

  if (!preview) return;

  // Show / hide elements
  dropZone?.classList.add("hidden");
  preview.classList.remove("hidden");

  // Name & size
  if (nameEl) nameEl.textContent = file.name;
  if (sizeEl) sizeEl.textContent = formatBytes(file.size);

  // Type badge
  const ext = file.name.split(".").pop().toUpperCase();
  if (typeEl) typeEl.textContent = ext;

  // Preview image or icon
  const imageExts = [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "bmp",
    "webp",
    "tiff",
    "tif",
    "svg",
  ];
  if (imageExts.includes(ext.toLowerCase())) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (previewImg) {
        previewImg.src = ev.target.result;
        previewImg.classList.remove("hidden");
      }
      if (previewIcon) previewIcon.classList.add("hidden");
    };
    reader.readAsDataURL(file);
  } else {
    if (previewImg) previewImg.classList.add("hidden");
    if (previewIcon) {
      previewIcon.textContent = fileIcon(file.name);
      previewIcon.classList.remove("hidden");
    }
  }
}

function clearFile() {
  state.selectedFile = null;
  const preview = $("#filePreview");
  const dropZone = $("#dropZone");
  const fileInput = $("#fileInput");
  const previewImg = $("#previewImg");

  if (preview) preview.classList.add("hidden");
  if (dropZone) dropZone.classList.remove("hidden");
  if (fileInput) fileInput.value = "";
  if (previewImg) {
    previewImg.src = "";
    previewImg.classList.add("hidden");
  }
  $("#previewIcon")?.classList.add("hidden");
}

// ─── SEARCH ───────────────────────────────────────────────
function initSearch() {
  const btnSearch = $("#btnSearch");
  btnSearch?.addEventListener("click", runSearch);
}

async function runSearch() {
  if (state.searching) return;

  // Determine active tab
  const activeTabBtn = $(".tab-bar .tab-btn.active");
  const activeTab = activeTabBtn?.dataset.tab || "file";

  const plainText = $("#plainText")?.value?.trim() || "";
  const extraText = $("#extraText")?.value?.trim() || "";
  const file = state.selectedFile;
  const extraLocalPaths = $("#extraLocalPaths")?.value?.trim() || "";

  // Validate input
  if (activeTab === "file" && !file && !extraText) {
    showToast(
      "Please upload a file or add context text before searching.",
      "warning",
    );
    return;
  }
  if (activeTab === "text" && !plainText) {
    showToast("Please enter some text to search for.", "warning");
    return;
  }

  // Collect sources
  const sourceCBs = $$(".source-cb");
  const sources = sourceCBs.filter((cb) => cb.checked).map((cb) => cb.value);
  if (sources.length === 0) {
    showToast("Select at least one search source.", "warning");
    return;
  }

  state.searching = true;
  setSearching(true);
  hideResults();
  hideEmptyState();
  showProgress();
  setProgressLabel("Initialising search…");
  animateProgress();

  const startTime = Date.now();

  try {
    let data;

    if (activeTab === "text") {
      // Text search endpoint
      setProgressLabel("Searching across sources…");
      const formData = new FormData();
      formData.append("text", plainText);
      formData.append("sources", JSON.stringify(sources));
      if (extraLocalPaths)
        formData.append("extra_local_paths", extraLocalPaths);

      const resp = await fetch("/api/search/text", {
        method: "POST",
        body: formData,
      });
      if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
      data = await resp.json();
    } else {
      // File search endpoint
      setProgressLabel("Uploading and analysing file…");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sources", JSON.stringify(sources));
      if (extraText) formData.append("extra_text", extraText);
      if (extraLocalPaths)
        formData.append("extra_local_paths", extraLocalPaths);

      setProgressLabel("Searching across sources…");
      const resp = await fetch("/api/search", {
        method: "POST",
        body: formData,
      });
      if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
      data = await resp.json();
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    hideProgress();
    state.lastResults = data;

    if (data.error) {
      showToast(`Search error: ${data.error}`, "error");
      return;
    }

    renderResults(data, elapsed);
  } catch (err) {
    hideProgress();
    console.error("Search failed:", err);
    showToast(`Search failed: ${err.message}`, "error");
  } finally {
    state.searching = false;
    setSearching(false);
  }
}

// ─── PROGRESS ANIMATION ───────────────────────────────────
let progressTimer = null;

function animateProgress() {
  const fill = $("#progressFill");
  if (!fill) return;
  let pct = 5;
  fill.style.width = "5%";

  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    if (pct < 88) {
      pct += Math.random() * 3 + 1;
      fill.style.width = Math.min(pct, 88) + "%";
    }
  }, 300);
}

function completeProgress() {
  clearInterval(progressTimer);
  const fill = $("#progressFill");
  if (fill) fill.style.width = "100%";
}

// ─── RENDER RESULTS ───────────────────────────────────────
function renderResults(data, elapsed) {
  const gdrive = data.gdrive || { results: [], status: {} };
  const local = data.local || { results: [], status: {} };
  const whatsapp = data.whatsapp || { results: [], status: {} };

  const gdriveItems = gdrive.results || [];
  const localItems = local.results || [];
  const waItems = (whatsapp.results || []).filter(
    (r) => r.source !== "wa-chat",
  );
  const waChatItems = (whatsapp.results || []).filter(
    (r) => r.source === "wa-chat",
  );

  const allItems = [
    ...gdriveItems,
    ...localItems,
    ...waItems,
    ...waChatItems,
  ].sort((a, b) => (b.score || 0) - (a.score || 0));

  const total = allItems.length;

  // Update stats bar
  $("#statTotal").textContent = total;
  $("#statGdrive").textContent = gdriveItems.length || 0;
  $("#statLocal").textContent = localItems.length || 0;
  $("#statWhatsapp").textContent = waItems.length + waChatItems.length || 0;
  $("#statTime").textContent = elapsed;

  // Update tab badges
  const rcGdrive = $("#rcGdrive");
  const rcLocal = $("#rcLocal");
  const rcWa = $("#rcWa");
  if (rcGdrive) rcGdrive.textContent = gdriveItems.length || "";
  if (rcLocal) rcLocal.textContent = localItems.length || "";
  if (rcWa) rcWa.textContent = waItems.length + waChatItems.length || "";

  // Populate panels
  renderPanel($("#resultsAll"), allItems, data);
  renderPanel($("#resultsGdrive"), gdriveItems, data);
  renderPanel($("#resultsLocal"), localItems, data);
  renderPanel($("#resultsWhatsapp"), [...waItems, ...waChatItems], data);

  if (total === 0) {
    showEmptyState();
  } else {
    showResultsSection();
    showToast(
      `Found ${total} similar file${total !== 1 ? "s" : ""} in ${elapsed}s`,
      "success",
    );
  }
}

function renderPanel(panel, items, data) {
  if (!panel) return;
  panel.innerHTML = "";

  // Status alerts at top
  prependStatusAlerts(panel, data);

  if (!items || items.length === 0) {
    panel.insertAdjacentHTML(
      "beforeend",
      `
      <p style="text-align:center; color:var(--text-muted); padding:var(--space-8); font-size:var(--text-sm);">
        No results in this source.
      </p>
    `,
    );
    return;
  }

  // Group by source
  const groups = { gdrive: [], local: [], whatsapp: [], "wa-chat": [] };
  items.forEach((r) => {
    const s = r.source || "local";
    if (groups[s]) groups[s].push(r);
    else groups["local"].push(r);
  });

  const groupDefs = [
    { key: "gdrive", icon: "☁️", label: "Google Drive" },
    { key: "local", icon: "💻", label: "This Computer" },
    { key: "whatsapp", icon: "💬", label: "WhatsApp Media" },
    { key: "wa-chat", icon: "💬", label: "WhatsApp Chats" },
  ];

  const isAllPanel = panel.id === "resultsAll";

  groupDefs.forEach((def) => {
    const grp = groups[def.key] || [];
    if (!grp.length) return;

    if (isAllPanel) {
      // Show group headers in the "All" panel
      const header = document.createElement("div");
      header.className = "rgroup-header";
      header.innerHTML = `
        <span class="rgroup-icon">${def.icon}</span>
        <span class="rgroup-title">${def.label}</span>
        <span class="rgroup-count">${grp.length} result${grp.length !== 1 ? "s" : ""}</span>
      `;
      panel.appendChild(header);
    }

    grp.forEach((item, idx) => {
      const card =
        item.source === "wa-chat"
          ? buildChatCard(item, idx)
          : buildResultCard(item, idx);
      panel.appendChild(card);
    });
  });
}

function buildResultCard(r, idx) {
  const card = document.createElement("div");
  card.className = "result-card";
  card.style.animationDelay = `${0.04 * Math.min(idx, 10)}s`;

  const filename = r.filename || r.name || "Unknown file";
  const filepath = r.filepath || r.path || r.web_view_link || "";
  const icon = fileIcon(filename);
  const sizeHuman = r.size ? formatBytes(r.size) : "";
  const modTime = r.modified_time ? formatTimestamp(r.modified_time) : "";
  const score = r.score || 0;
  const { cls: scoreCls, label: scoreLabel } = scoreInfo(score);
  const preview = r.preview_text || r.snippet || "";
  const matchType = r.match_type || "";

  // Source badge
  const srcBadgeMap = {
    gdrive: { cls: "gdrive", label: "☁️ Drive" },
    local: { cls: "local", label: "💻 Local" },
    whatsapp: { cls: "whatsapp", label: "💬 WhatsApp" },
  };
  const src = srcBadgeMap[r.source] || { cls: "local", label: "💻 Local" };

  // Match type label
  const matchLabels = {
    image_perceptual_hash: "Image Hash",
    filename: "Filename",
    fulltext_keywords: "Full Text",
    keyword_match: "Keywords",
    text_similarity: "Text Similarity",
    document_similarity: "Doc Similarity",
    ocr_text: "OCR Text",
    offer_keyword: "Offer Keywords",
  };
  const matchLabel = matchLabels[matchType] || matchType;

  // Action buttons
  let actionHtml = "";
  if (r.web_view_link) {
    actionHtml += `<a href="${escHtml(r.web_view_link)}" target="_blank" class="btn-action" title="Open in Drive">🔗</a>`;
  } else if (filepath && !filepath.startsWith("http")) {
    actionHtml += `<button class="btn-action" onclick="copyPath('${escHtml(filepath)}')" title="Copy path">📋</button>`;
  }

  card.innerHTML = `
    <div class="result-icon-col">${icon}</div>
    <div class="result-body">
      <div class="result-name" title="${escHtml(filepath)}">${escHtml(filename)}</div>
      <div class="result-path">${escHtml(truncate(filepath, 80))}</div>
      <div class="result-badges">
        <span class="score-badge ${scoreCls}">${scoreLabel}</span>
        <span class="src-badge ${src.cls}">${src.label}</span>
        ${matchLabel ? `<span class="match-tag">${escHtml(matchLabel)}</span>` : ""}
      </div>
      <div class="result-meta">
        ${sizeHuman ? `<span class="result-meta-item">📦 ${escHtml(sizeHuman)}</span>` : ""}
        ${modTime ? `<span class="result-meta-item">📅 ${escHtml(modTime)}</span>` : ""}
        ${r.owners ? `<span class="result-meta-item">👤 ${escHtml(r.owners)}</span>` : ""}
      </div>
      ${preview ? `<div class="result-preview"><p>${escHtml(truncate(preview, 200))}</p></div>` : ""}
    </div>
    ${actionHtml ? `<div class="result-actions">${actionHtml}</div>` : ""}
  `;

  return card;
}

function buildChatCard(r, idx) {
  const card = document.createElement("div");
  card.className = "chat-card";
  card.style.animationDelay = `${0.04 * Math.min(idx, 10)}s`;

  const sender = r.sender || "Unknown";
  const message = r.message || r.preview_text || "";
  const date = r.date || "";
  const time = r.time || "";
  const chatFile = r.chat_file || r.filename || "";
  const score = r.score || 0;
  const { cls: scoreCls, label: scoreLabel } = scoreInfo(score);
  const matchType = r.match_type || "";

  const matchLabels = {
    text_similarity: "Text Similarity",
    keyword: "Keyword Match",
    offer_keyword: "Offer Keyword",
  };
  const matchLabel = matchLabels[matchType] || matchType;

  const initial = (sender[0] || "?").toUpperCase();

  card.innerHTML = `
    <div class="chat-header">
      <div class="chat-avatar">${escHtml(initial)}</div>
      <span class="chat-sender">${escHtml(sender)}</span>
      <span class="chat-time">${escHtml(date)} ${escHtml(time)}</span>
    </div>
    <div class="chat-message">${escHtml(message)}</div>
    <div class="result-badges">
      <span class="score-badge ${scoreCls}">${scoreLabel}</span>
      <span class="src-badge whatsapp">💬 WhatsApp Chat</span>
      ${matchLabel ? `<span class="match-tag">${escHtml(matchLabel)}</span>` : ""}
    </div>
    ${chatFile ? `<div style="margin-top:8px"><span class="chat-file-ref">📄 ${escHtml(chatFile)}</span></div>` : ""}
  `;

  return card;
}

function prependStatusAlerts(panel, data) {
  const alerts = [];

  const gdrive = data.gdrive || {};
  const local = data.local || {};
  const whatsapp = data.whatsapp || {};

  // Google Drive alerts
  if (gdrive.status?.auth_required) {
    alerts.push({
      type: "warning",
      icon: "⚠️",
      text: '<strong>Google Drive:</strong> Not authenticated. Click "Google Drive" in the header to connect.',
    });
  } else if (gdrive.status?.error) {
    alerts.push({
      type: "error",
      icon: "❌",
      text: `<strong>Google Drive error:</strong> ${escHtml(gdrive.status.error)}`,
    });
  } else if (gdrive.status?.credentials_missing) {
    alerts.push({
      type: "info",
      icon: "ℹ️",
      text: '<strong>Google Drive:</strong> No credentials.json found. <a href="https://console.cloud.google.com/" target="_blank">Set up Drive API →</a>',
    });
  }

  // Local alerts
  if (local.status?.error) {
    alerts.push({
      type: "error",
      icon: "❌",
      text: `<strong>Local search error:</strong> ${escHtml(local.status.error)}`,
    });
  } else if (local.status?.paths_searched === 0) {
    alerts.push({
      type: "info",
      icon: "ℹ️",
      text: "<strong>Local search:</strong> No paths were searched. Check LOCAL_SEARCH_PATHS in your .env file.",
    });
  }

  // WhatsApp alerts
  if (whatsapp.status?.no_paths_found) {
    alerts.push({
      type: "info",
      icon: "ℹ️",
      text: "<strong>WhatsApp:</strong> No media or export folders found. Configure WHATSAPP_* paths in .env.",
    });
  } else if (whatsapp.status?.error) {
    alerts.push({
      type: "error",
      icon: "❌",
      text: `<strong>WhatsApp error:</strong> ${escHtml(whatsapp.status.error)}`,
    });
  }

  if (!alerts.length) return;

  const container = document.createElement("div");
  container.style.marginBottom = "16px";

  alerts.forEach((a) => {
    const div = document.createElement("div");
    div.className = `alert alert-${a.type}`;
    div.innerHTML = `<span class="alert-icon">${a.icon}</span><span class="alert-text">${a.text}</span>`;
    container.appendChild(div);
  });

  panel.prepend(container);
}

// ─── UI STATE HELPERS ─────────────────────────────────────
function setSearching(on) {
  const btn = $("#btnSearch");
  const label = btn?.querySelector(".btn-search-label");
  if (!btn) return;
  if (on) {
    btn.disabled = true;
    btn.classList.add("loading");
    if (label) label.textContent = "Searching";
  } else {
    btn.disabled = false;
    btn.classList.remove("loading");
    if (label) label.textContent = "Search All Sources";
  }
}

function showProgress() {
  const wrap = $("#progressWrap");
  if (wrap) wrap.classList.remove("hidden");
}

function hideProgress() {
  completeProgress();
  setTimeout(() => {
    const wrap = $("#progressWrap");
    if (wrap) wrap.classList.add("hidden");
    const fill = $("#progressFill");
    if (fill) fill.style.width = "0%";
  }, 400);
}

function setProgressLabel(text) {
  const lbl = $("#progressLabel");
  if (lbl) lbl.textContent = text;
}

function showResultsSection() {
  const sec = $("#resultsSection");
  if (sec) {
    sec.classList.remove("hidden");
    sec.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function hideResults() {
  const sec = $("#resultsSection");
  if (sec) sec.classList.add("hidden");
  // Reset tab to "all"
  $$(".rtab-bar .rtab").forEach((b) => b.classList.remove("active"));
  const allTab = $('.rtab-bar .rtab[data-rtab="all"]');
  if (allTab) allTab.classList.add("active");
  $$(".result-panel").forEach((p) => {
    p.classList.add("hidden");
    p.classList.remove("active");
  });
  $("#resultsAll")?.classList.remove("hidden");
  $("#resultsAll")?.classList.add("active");
}

function showEmptyState() {
  const el = $("#emptyState");
  if (el) el.classList.remove("hidden");
}

function hideEmptyState() {
  const el = $("#emptyState");
  if (el) el.classList.add("hidden");
}

// ─── COPY PATH ────────────────────────────────────────────
window.copyPath = function (path) {
  if (!path) return;
  if (navigator.clipboard) {
    navigator.clipboard
      .writeText(path)
      .then(() => showToast("Path copied to clipboard", "success"))
      .catch(() => fallbackCopy(path));
  } else {
    fallbackCopy(path);
  }
};

function fallbackCopy(text) {
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
  document.body.appendChild(el);
  el.select();
  try {
    document.execCommand("copy");
    showToast("Path copied!", "success");
  } catch {
    showToast("Could not copy path.", "error");
  }
  document.body.removeChild(el);
}

// ─── MODALS ───────────────────────────────────────────────
function openModal(id) {
  const overlay = $(`#${id}`);
  if (overlay) overlay.classList.remove("hidden");
}

function closeModal(id) {
  const overlay = $(`#${id}`);
  if (overlay) overlay.classList.add("hidden");
}

function initModals() {
  // Close on overlay click
  $$(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.add("hidden");
    });
  });

  // Close buttons
  $("#closeModalGdrive")?.addEventListener("click", () =>
    closeModal("modalGdrive"),
  );
  $("#closeModalWa")?.addEventListener("click", () => closeModal("modalWa"));
  $("#closeModalLocal")?.addEventListener("click", () =>
    closeModal("modalLocal"),
  );

  // Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape")
      $$(".modal-overlay").forEach((o) => o.classList.add("hidden"));
  });
}

// ─── GOOGLE DRIVE MODAL ───────────────────────────────────
async function openGdriveModal() {
  openModal("modalGdrive");
  const body = $("#gdriveModalBody");
  if (!body) return;
  body.innerHTML = `<p class="modal-loading">Checking authentication…</p>`;

  try {
    const resp = await fetch("/api/gdrive/auth-status");
    const data = await resp.json();

    // Update header pill dot
    const dot = $("#driveStatusDot");
    if (dot)
      dot.className = `pill-dot ${data.authenticated ? "ok" : "warning"}`;

    if (data.authenticated) {
      body.innerHTML = `
        <div class="alert alert-success">
          <span class="alert-icon">✅</span>
          <span class="alert-text"><strong>Connected</strong> — Google Drive is authenticated.</span>
        </div>
        ${data.user_email ? `<p class="modal-info">Signed in as: <strong>${escHtml(data.user_email)}</strong></p>` : ""}
        <div class="modal-actions">
          <button class="modal-btn modal-btn-danger" id="btnRevokeGdrive">Disconnect</button>
          <button class="modal-btn" onclick="closeModal('modalGdrive')">Close</button>
        </div>
      `;
      $("#btnRevokeGdrive")?.addEventListener("click", async () => {
        body.innerHTML = `<p class="modal-loading">Revoking access…</p>`;
        try {
          await fetch("/api/gdrive/revoke", { method: "POST" });
          showToast("Google Drive disconnected.", "info");
          closeModal("modalGdrive");
          const d = $("#driveStatusDot");
          if (d) d.className = "pill-dot warning";
          const gs = $("#gdriveStatus");
          if (gs) gs.textContent = "not connected";
        } catch {
          showToast("Failed to revoke access.", "error");
          closeModal("modalGdrive");
        }
      });
    } else if (data.credentials_missing) {
      body.innerHTML = `
        <div class="alert alert-info">
          <span class="alert-icon">ℹ️</span>
          <span class="alert-text"><strong>credentials.json not found.</strong> You need to create OAuth credentials in Google Cloud Console first.</span>
        </div>
        <p class="modal-info" style="margin-top:12px">
          Steps:<br/>
          1. Go to <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console →</a><br/>
          2. Create a project → Enable <strong>Google Drive API</strong><br/>
          3. Create <strong>OAuth 2.0 credentials</strong> (Desktop app type)<br/>
          4. Download <strong>credentials.json</strong> and place it next to <code>app.py</code><br/>
          5. Restart the app, then come back here to authenticate.
        </p>
        <div class="modal-actions">
          <button class="modal-btn" onclick="closeModal('modalGdrive')">Close</button>
        </div>
      `;
    } else {
      body.innerHTML = `
        <div class="alert alert-warning">
          <span class="alert-icon">⚠️</span>
          <span class="alert-text">Not connected to Google Drive. Click below to authenticate.</span>
        </div>
        <div class="modal-actions">
          <button class="modal-btn modal-btn-primary" id="btnAuthGdrive">Connect Google Drive</button>
          <button class="modal-btn" onclick="closeModal('modalGdrive')">Cancel</button>
        </div>
      `;
      $("#btnAuthGdrive")?.addEventListener("click", async () => {
        body.innerHTML = `<p class="modal-loading">Opening authentication window…</p>`;
        try {
          const authResp = await fetch("/api/gdrive/authenticate", {
            method: "POST",
          });
          const authData = await authResp.json();
          if (authData.auth_url) {
            window.open(authData.auth_url, "_blank", "width=600,height=700");
            body.innerHTML = `
              <div class="alert alert-info">
                <span class="alert-icon">🔐</span>
                <span class="alert-text">Complete authentication in the popup, then close this dialog and try searching.</span>
              </div>
              <div class="modal-actions">
                <button class="modal-btn modal-btn-primary" onclick="openGdriveModal()">Check Status</button>
                <button class="modal-btn" onclick="closeModal('modalGdrive')">Close</button>
              </div>
            `;
          } else if (authData.authenticated) {
            showToast("Google Drive connected!", "success");
            openGdriveModal();
          } else {
            showToast(authData.error || "Authentication failed.", "error");
            closeModal("modalGdrive");
          }
        } catch (err) {
          showToast("Authentication request failed.", "error");
          closeModal("modalGdrive");
        }
      });
    }
  } catch (err) {
    body.innerHTML = `<div class="alert alert-error"><span class="alert-icon">❌</span><span class="alert-text">Failed to check authentication status.</span></div>`;
  }
}

// ─── WHATSAPP MODAL ───────────────────────────────────────
async function openWaModal() {
  openModal("modalWa");
  const body = $("#waModalBody");
  if (!body) return;
  body.innerHTML = `<p class="modal-loading">Loading WhatsApp paths…</p>`;

  try {
    const resp = await fetch("/api/whatsapp/paths");
    const data = await resp.json();

    const renderPaths = (paths, label) => {
      if (!paths || paths.length === 0) return "";
      const items = paths
        .map(
          (p) => `
        <li class="${p.exists ? "ok" : "miss"}">${escHtml(p.path)}</li>
      `,
        )
        .join("");
      return `
        <div class="modal-section">
          <div class="modal-section-title">${label}</div>
          <ul class="path-list">${items}</ul>
        </div>
      `;
    };

    const hasAny =
      (data.desktop_paths?.length || 0) + (data.export_paths?.length || 0) > 0;

    body.innerHTML = `
      ${hasAny ? "" : '<div class="alert alert-warning"><span class="alert-icon">⚠️</span><span class="alert-text">No WhatsApp paths are configured. Set <code>WHATSAPP_DESKTOP_PATH</code> and <code>WHATSAPP_EXPORT_PATH</code> in your <code>.env</code> file.</span></div>'}
      ${renderPaths(data.desktop_paths, "WhatsApp Desktop Media")}
      ${renderPaths(data.export_paths, "WhatsApp Chat Exports")}
      <p class="modal-info" style="margin-top:12px; font-size:13px; color:var(--text-muted)">
        To search chat messages: export a WhatsApp chat from your phone (⋮ → More → Export chat → Without Media) and place the <code>_chat.txt</code> file in your export folder.
      </p>
      <div class="modal-actions">
        <button class="modal-btn" onclick="closeModal('modalWa')">Close</button>
      </div>
    `;

    // Update header status
    const hasExisting = [
      ...(data.desktop_paths || []),
      ...(data.export_paths || []),
    ].some((p) => p.exists);
    const waStatus = $("#waStatus");
    if (waStatus)
      waStatus.textContent = hasExisting ? "found" : "no paths found";
  } catch (err) {
    body.innerHTML = `<div class="alert alert-error"><span class="alert-icon">❌</span><span class="alert-text">Failed to load WhatsApp paths.</span></div>`;
  }
}

// ─── LOCAL PATHS MODAL ────────────────────────────────────
async function openLocalModal() {
  openModal("modalLocal");
  const body = $("#localModalBody");
  if (!body) return;
  body.innerHTML = `<p class="modal-loading">Loading local paths…</p>`;

  try {
    const resp = await fetch("/api/local/paths");
    const data = await resp.json();

    const pathsHtml = (data.paths || [])
      .map(
        (p) => `
      <li class="${p.exists ? "ok" : "miss"}">${escHtml(p.path)}</li>
    `,
      )
      .join("");

    body.innerHTML = `
      <div class="modal-section">
        <div class="modal-section-title">Search Paths</div>
        <ul class="path-list">${pathsHtml || "<li>No paths configured</li>"}</ul>
      </div>
      ${data.max_depth ? `<p class="modal-info">Max depth: <strong>${data.max_depth}</strong></p>` : ""}
      ${data.max_file_mb ? `<p class="modal-info">Max file size: <strong>${data.max_file_mb} MB</strong></p>` : ""}
      <p class="modal-info" style="margin-top:8px; font-size:13px; color:var(--text-muted)">
        Edit <code>LOCAL_SEARCH_PATHS</code> in your <code>.env</code> file to add or change paths.
      </p>
      <div class="modal-actions">
        <button class="modal-btn" onclick="closeModal('modalLocal')">Close</button>
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div class="alert alert-error"><span class="alert-icon">❌</span><span class="alert-text">Failed to load local paths.</span></div>`;
  }
}

// ─── HEADER BUTTONS ───────────────────────────────────────
function initHeaderButtons() {
  $("#btnGdriveNav")?.addEventListener("click", openGdriveModal);
  $("#btnWaPaths")?.addEventListener("click", openWaModal);
  $("#btnLocalPaths")?.addEventListener("click", openLocalModal);
}

// ─── INITIAL STATUS CHECK ─────────────────────────────────
async function checkInitialStatuses() {
  // Google Drive status
  try {
    const resp = await fetch("/api/gdrive/auth-status");
    const data = await resp.json();
    const dot = $("#driveStatusDot");
    const statusEl = $("#gdriveStatus");
    if (dot) {
      dot.className = `pill-dot ${data.authenticated ? "ok" : data.credentials_missing ? "error" : "warning"}`;
    }
    if (statusEl) {
      statusEl.textContent = data.authenticated
        ? "connected"
        : data.credentials_missing
          ? "no credentials"
          : "not connected";
    }
  } catch {
    const dot = $("#driveStatusDot");
    if (dot) dot.className = "pill-dot error";
    const gs = $("#gdriveStatus");
    if (gs) gs.textContent = "unavailable";
  }

  // WhatsApp status
  try {
    const resp = await fetch("/api/whatsapp/paths");
    const data = await resp.json();
    const hasExisting = [
      ...(data.desktop_paths || []),
      ...(data.export_paths || []),
    ].some((p) => p.exists);
    const waStatus = $("#waStatus");
    if (waStatus) waStatus.textContent = hasExisting ? "found" : "not found";
  } catch {
    const ws = $("#waStatus");
    if (ws) ws.textContent = "unavailable";
  }
}

// ─── PASTE SUPPORT ────────────────────────────────────────
function initPasteSupport() {
  document.addEventListener("paste", (e) => {
    const activeTabBtn = $(".tab-bar .tab-btn.active");
    if (activeTabBtn?.dataset.tab !== "file") return;

    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          selectFile(file);
          showToast("Image pasted from clipboard", "info");
          return;
        }
      }
    }
  });
}

// ─── KEYBOARD SHORTCUTS ───────────────────────────────────
function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    // Ctrl/Cmd + Enter → search
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runSearch();
    }
  });
}

// ─── RESET BUTTON ─────────────────────────────────────────
function initResetButton() {
  $("#btnReset")?.addEventListener("click", () => {
    hideEmptyState();
    clearFile();
    const plainText = $("#plainText");
    if (plainText) plainText.value = "";
    const extraText = $("#extraText");
    if (extraText) extraText.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

// ─── STICKY HEADER SHADOW ────────────────────────────────
function initHeaderScroll() {
  const header = $("#appHeader");
  if (!header) return;
  window.addEventListener(
    "scroll",
    () => {
      if (window.scrollY > 10) {
        header.style.boxShadow = "var(--shadow-md)";
      } else {
        header.style.boxShadow = "";
      }
    },
    { passive: true },
  );
}

// ─── INIT ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initInputTabs();
  initResultsTabs();
  initFileUpload();
  initSearch();
  initModals();
  initHeaderButtons();
  initPasteSupport();
  initKeyboardShortcuts();
  initResetButton();
  initHeaderScroll();
  checkInitialStatuses();
});
