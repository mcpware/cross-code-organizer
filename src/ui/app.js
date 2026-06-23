/**
 * app.js — Frontend logic for Cross-Code Organizer (CCO).
 *
 * Fetches data from /api/scan, renders the approved three-panel UI,
 * and keeps the existing search, filter, drag/drop, detail, bulk,
 * move, delete, and undo behaviors.
 */

// Effective resolution logic — loaded from /effective.mjs before app.js
const { EFFECTIVE_RULES, hasEffectiveRule, getAncestorScopes: _getAncestorScopes,
        computeEffectiveSets: _computeEffectiveSets, getEffectiveItems } = window.Effective;

// Helper: get effectiveRule for a category (returns string or undefined)
function getEffectiveRule(category) {
  const categoryDef = getCategoryConfig(category);
  if (categoryDef.effectiveRule) return categoryDef.effectiveRule;
  const rule = data?.effective?.rules?.find?.((entry) => entry.category === category)?.rule;
  return rule || null;
}

function getCategoryDefs() {
  const harnessCategories = availableHarnesses.find((harness) => harness.id === selectedHarnessId)?.categories || [];
  return [...(data?.categories || harnessCategories)].sort((a, b) => {
    const order = (a.order ?? 999) - (b.order ?? 999);
    return order || a.label.localeCompare(b.label);
  });
}

function getCategoryOrder() {
  return getCategoryDefs().map((category) => category.id);
}

function getCategoryConfig(category) {
  return data?.categories?.find?.((entry) => entry.id === category) || {
    ...FALLBACK_CATEGORY,
    id: category,
    label: capitalize(category),
    filterLabel: capitalize(category),
  };
}

function getScopeTypeConfig(type) {
  return data?.scopeTypes?.find?.((entry) => entry.id === type) || FALLBACK_SCOPE_TYPE;
}

function getScopeIcon(type) {
  return getScopeTypeConfig(type).icon || FALLBACK_SCOPE_TYPE.icon;
}

function hasCapability(name) {
  if (!data?.capabilities) return true;
  return data.capabilities[name] !== false;
}

let data = null;
let availableHarnesses = [];
let selectedHarnessId = localStorage.getItem("cco-selected-harness") || null;
let activeFilters = new Set();
let selectedItem = null;
let selectedScopeId = null;
let showEffective = false;
let treeView = false;
// Keys of global items that are shadowed by a project item with the same name
let effectiveShadowedKeys = new Set();
// Keys of items that have a same-name conflict (commands: not reliably overridable)
let effectiveConflictKeys = new Set();
// Keys of items from ancestor scopes (path-based; relevant for CLAUDE.md ancestry)
let effectiveAncestorKeys = new Set();
let pendingDrag = null;
let pendingDelete = null;
let draggingItem = null;
let bulkSelected = new Set();
let searchQuery = "";
let selectMode = false;
let toastTimer = null;
let detailPreviewKey = null;
let mcpDisabledNames = new Set(); // disabled MCP server names for current scope
let mcpDisabledScopeId = null;   // which scope the disabled list was loaded for
let lastBackupFolder = "~/.claude-backups/latest";

const uiState = {
  expandedScopes: new Set(),
  collapsedCats: new Set(),
  collapsedBundles: new Set(),
  sortBy: {}, // { [catKey]: { field: "size"|"date"|"name", dir: "asc"|"desc" } }
};

const FALLBACK_CATEGORY = { icon: "📄", label: "Item", filterLabel: "Item", group: null, order: 999 };
const FALLBACK_SCOPE_TYPE = { icon: "📂", label: "Scope", isGlobal: false };

const BADGE_CLASS = {
  feedback: "ib-feedback",
  user: "ib-user",
  project: "ib-project",
  reference: "ib-reference",
  skill: "ib-skill",
  mcp: "ib-mcp",
  session: "ib-session",
  config: "ib-config",
  hook: "ib-hook",
  plugin: "ib-plugin",
  plan: "ib-plan",
  memory: "ib-feedback",
  command: "ib-skill",
  agent: "ib-mcp",
  rule: "ib-config",
  setting: "ib-config",
};

/**
 * Open a file in VS Code via URI scheme.
 * Handles Windows paths (C:\foo\bar → /C:/foo/bar) and
 * directories (skills are folders, open SKILL.md inside).
 */
function openInEditor(filePath) {
  if (!filePath) return;
  // Windows: backslashes → forward slashes, ensure leading /
  let p = filePath.replace(/\\/g, "/");
  if (/^[A-Z]:/i.test(p)) p = "/" + p;
  // Skills are directories — try opening SKILL.md inside
  if (!p.match(/\.\w+$/)) p = p.replace(/\/$/, "") + "/SKILL.md";
  window.open(`vscode://file${p}`, "_blank");
}

const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

async function init() {
  try {
    const harnessResponse = await fetchJson("/api/harnesses");
    if (harnessResponse.ok) {
      availableHarnesses = harnessResponse.harnesses || [];
      const validHarnessIds = new Set(availableHarnesses.map((harness) => harness.id));
      if (!selectedHarnessId || !validHarnessIds.has(selectedHarnessId)) {
        selectedHarnessId = harnessResponse.defaultHarness || availableHarnesses[0]?.id || "claude";
      }
    }

    data = await fetchJson(apiUrl("/api/scan"));
    selectedHarnessId = data?.harness?.id || selectedHarnessId;
    localStorage.setItem("cco-selected-harness", selectedHarnessId);
    selectedScopeId = getInitialSelectedScopeId();
    initializeScopeState();
    setupUi();
    updateHarnessBranding();
    updateCapabilityVisibility();
    setupScopeNotice();
    // Load cached scan results + check for new servers BEFORE first render.
    // MCP tool-definition scanning is harness-agnostic.
    await loadCachedSecurityResults();
    await checkForNewMcpServers();
    renderAll();
    checkForUpdate();
  } catch (error) {
    document.getElementById("loading").textContent = "Failed to load inventory";
    toast(error?.message || "Failed to load inventory", true);
  }
}

// ── What's New changelog ─────────────────────────────────────────
// Add a new entry here for every release that has user-facing changes.
// Key = version string (must match package.json exactly).
const CHANGELOG = {
  "0.18.0": {
    title: "Backup Center",
    tagline: "Never lose your coding harness setup again.",
    changes: [
      "☁ Backup Center: back up every memory, skill, MCP config, rule, plan, agent, and session to a private GitHub repo — one click.",
      "Auto-backup via systemd timer (every 4 hours + on boot). Persistent across reboots.",
      "Full git history for every backup. See exactly what changed, restore anytime.",
      "Sync Now, Configure Remote, interval control, and Snapshot Export — all inside the panel.",
    ],
  },
  "0.17.0": {
    title: "Session Distiller + Image Trimmer",
    tagline: "Reclaim your context window.",
    changes: [
      "Session Distiller compresses bloated sessions to ~10% of their original size while keeping every word of conversation.",
      "Image Trimmer removes base64 screenshots that trigger 'image exceeds dimension limit' warnings.",
      "Both tools run from the dashboard or CLI.",
    ],
  },
};

function checkWhatsNew(currentVersion) {
  if (!currentVersion) return;
  const lastSeen = localStorage.getItem("cco-last-seen-version");
  if (lastSeen === currentVersion) return;

  const entry = CHANGELOG[currentVersion];
  if (!entry) {
    // New version without a changelog entry — mark as seen silently
    localStorage.setItem("cco-last-seen-version", currentVersion);
    return;
  }

  // Populate and show the modal
  document.getElementById("wnTitle").textContent = entry.title;
  document.getElementById("wnTagline").textContent = entry.tagline;
  const list = document.getElementById("wnList");
  list.innerHTML = entry.changes.map(c => `<li>${c}</li>`).join("");
  document.getElementById("whatsNewModal").classList.remove("hidden");

  function dismiss() {
    localStorage.setItem("cco-last-seen-version", currentVersion);
    document.getElementById("whatsNewModal").classList.add("hidden");
  }

  document.getElementById("wnClose").onclick = dismiss;
  document.getElementById("wnGotIt").onclick = dismiss;
  document.getElementById("whatsNewModal").onclick = (e) => {
    if (e.target === document.getElementById("whatsNewModal")) dismiss();
  };
}

async function checkForUpdate() {
  try {
    const { local, updateAvailable } = await fetchJson("/api/version");

    // Show What's New if this is a version the user hasn't seen yet
    checkWhatsNew(local);

    if (!updateAvailable) return;
    const footer = document.querySelector(".sidebar-footer");
    if (!footer) return;
    const banner = document.createElement("div");
    banner.className = "update-banner";
    banner.innerHTML = "🔄 New version available — <code>npx @mcpware/cross-code-organizer@latest</code>";
    banner.addEventListener("click", () => {
      navigator.clipboard.writeText("Run npx @mcpware/cross-code-organizer@latest to update Cross-Code Organizer (CCO) to the latest version.").then(() => {
        banner.innerHTML = "✅ Copied update prompt";
        setTimeout(() => {
          banner.innerHTML = "🔄 New version available — <code>npx @mcpware/cross-code-organizer@latest</code>";
        }, 2000);
      });
    });
    footer.prepend(banner);
  } catch { /* silent */ }
}

async function fetchJson(url, options) {
  const res = await fetch(toHarnessUrl(url), options);
  return res.json();
}

function toHarnessUrl(url) {
  if (typeof url !== "string" || !url.startsWith("/api/")) return url;
  if (url.startsWith("/api/harnesses") || url.startsWith("/api/version")) return url;
  const parsed = new URL(url, window.location.origin);
  if (selectedHarnessId && !parsed.searchParams.has("harness")) {
    parsed.searchParams.set("harness", selectedHarnessId);
  }
  return `${parsed.pathname}${parsed.search}`;
}

function apiUrl(path, params = {}) {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }
  if (path.startsWith("/api/") && selectedHarnessId && path !== "/api/harnesses" && path !== "/api/version") {
    url.searchParams.set("harness", selectedHarnessId);
  }
  return `${url.pathname}${url.search}`;
}

async function switchHarness(harnessId) {
  selectedHarnessId = harnessId;
  localStorage.setItem("cco-selected-harness", harnessId);
  const loading = document.getElementById("loading");
  if (loading) {
    const nextHarness = availableHarnesses.find((harness) => harness.id === harnessId);
    loading.textContent = `Scanning ${(nextHarness?.displayName || nextHarness?.shortName || harnessId)} inventory...`;
    loading.classList.remove("hidden");
  }

  data = await fetchJson(apiUrl("/api/scan"));
  selectedHarnessId = data?.harness?.id || harnessId;
  localStorage.setItem("cco-selected-harness", selectedHarnessId);
  selectedScopeId = getInitialSelectedScopeId();
  selectedItem = null;
  detailPreviewKey = null;
  activeFilters.clear();
  bulkSelected.clear();
  showEffective = false;
  effectiveShadowedKeys = new Set();
  effectiveConflictKeys = new Set();
  effectiveAncestorKeys = new Set();
  mcpDisabledNames = new Set();
  mcpDisabledScopeId = null;
  securityScanResults = null;
  securityBadges = {};
  securityBaselineStatus = {};
  clearSecurityButtonAlert();

  closeDetail();
  closeContextBudget();
  closeMcpControlsPanel();
  document.getElementById("securityPanel")?.classList.add("hidden");
  document.getElementById("inheritToggleBtn")?.classList.remove("active");

  initializeScopeState();
  updateHarnessSelector();
  updateHarnessBranding();
  updateCapabilityVisibility();
  await loadCachedSecurityResults();
  await checkForNewMcpServers();
  renderAll();
}

const SCOPE_NOTICE_DISMISSED_KEY = "cco-scope-notice-v1-dismissed";

function isScopeNoticeDismissed() {
  return localStorage.getItem(SCOPE_NOTICE_DISMISSED_KEY) === "1";
}

function dismissScopeNotice() {
  localStorage.setItem(SCOPE_NOTICE_DISMISSED_KEY, "1");
  document.getElementById("scopeNotice")?.remove();
}

function setupScopeNotice() {
  if (isScopeNoticeDismissed()) {
    document.getElementById("scopeNotice")?.remove();
    return;
  }
  const tree = document.getElementById("sidebarTree");
  if (!tree) return;
  if (document.getElementById("scopeNotice")) {
    updateScopeNotice();
    return;
  }
  const notice = document.createElement("div");
  notice.className = "scope-notice";
  notice.id = "scopeNotice";
  tree.parentElement.insertBefore(notice, tree);
  updateScopeNotice();
}

function updateScopeNotice() {
  const notice = document.getElementById("scopeNotice");
  if (!notice) return;
  if (isScopeNoticeDismissed()) {
    notice.remove();
    return;
  }
  const effectiveCopy = hasCapability("effective")
    ? `Use <strong>✦ Show Effective</strong> to see what actually applies in each project. Hover any category pill for its specific rule.`
    : `Categories are shown from the selected scope. Some categories are inventory-only because this harness does not expose project inheritance rules for them.`;
  notice.innerHTML = `<span class="scope-notice-dismiss" id="scopeNoticeDismiss">✕</span><strong>How ${esc(getHarnessShortName())} scopes work:</strong> Different categories can have different scope rules. ${effectiveCopy}`;
  document.getElementById("scopeNoticeDismiss")?.addEventListener("click", dismissScopeNotice);
}

function setupUi() {
  setupHarnessSelector();
  setupSearch();
  setupSidebarTree();
  setupFilterBar();
  setupItemList();
  setupDetailPanel();
  setupModals();
  setupBulkBar();
  setupScopeDropZones();
  setupThemeToggle();
  setupCollapseAll();
  setupCcActions();
  setupExport();
  setupBackupModal();
  setupContextBudget();
  setupResizers();
  setupSecurityScan();
  setupMcpControls();
}

function setupHarnessSelector() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar || document.getElementById("harnessSelectorWrap")) return;

  const wrap = document.createElement("label");
  wrap.className = "harness-selector-wrap";
  wrap.id = "harnessSelectorWrap";
  wrap.innerHTML = `
    <span class="harness-selector-label">Harness</span>
    <select class="harness-selector" id="harnessSelector"></select>`;

  sidebar.insertBefore(wrap, document.getElementById("searchInput"));
  updateHarnessSelector();

  document.getElementById("harnessSelector").addEventListener("change", async (event) => {
    try {
      await switchHarness(event.target.value);
    } catch (error) {
      toast(error?.message || "Failed to switch harness", true);
    }
  });
}

function updateHarnessSelector() {
  const select = document.getElementById("harnessSelector");
  if (!select) return;
  const scanHarness = data?.harness ? [data.harness] : [];
  const harnesses = availableHarnesses.length ? availableHarnesses : scanHarness;
  select.innerHTML = harnesses.map((harness) => `
    <option value="${esc(harness.id)}"${harness.id === selectedHarnessId ? " selected" : ""}>
      ${esc(`${harness.icon || ""} ${harness.displayName || harness.shortName || harness.id}`.trim())}
    </option>`).join("");
  select.disabled = harnesses.length <= 1;
}

function updateHarnessBranding() {
  const harness = getHarnessDescriptor();
  const name = getHarnessName();
  const shortName = getHarnessShortName();
  const icon = harness.icon || "✳️";
  const executable = getHarnessExecutable();

  document.title = "Cross-Code Organizer (CCO)";
  const logo = document.getElementById("harnessLogoIcon");
  if (logo) {
    if (harness.iconSvg) {
      logo.innerHTML = harness.iconSvg;
    } else {
      logo.textContent = icon;
    }
  }
  const title = document.getElementById("sidebarTitle");
  if (title) title.textContent = "Cross-Code Organizer (CCO)";
  const loading = document.getElementById("loading");
  if (loading) loading.textContent = `Scanning ${name} inventory...`;
  const promptLabel = document.getElementById("detailPromptLabel");
  if (promptLabel) promptLabel.textContent = `${shortName} Prompt`;
  const footerHint = document.getElementById("sidebarFooterHint");
  if (footerHint) {
    footerHint.innerHTML = executable === "claude"
      ? `Type <code>/cco</code> in ${esc(name)} to reopen`
      : `Selected harness: <code>${esc(executable)}</code>`;
  }
  updateScopeNotice();
}

function updateCapabilityVisibility() {
  const ctxBtn = document.getElementById("ctxBudgetBtn");
  const mcpBtn = document.getElementById("mcpControlsBtn");
  const effectiveBtn = document.getElementById("inheritToggleBtn");
  const exportBtn = document.getElementById("exportBtn");

  ctxBtn?.classList.toggle("hidden", !hasCapability("contextBudget"));
  mcpBtn?.classList.toggle("hidden", !hasCapability("mcpControls"));
  effectiveBtn?.classList.toggle("hidden", !hasCapability("effective"));
  exportBtn?.classList.toggle("hidden", !hasCapability("backup"));

  if (!hasCapability("contextBudget")) closeContextBudget();
  if (!hasCapability("mcpControls")) closeMcpControlsPanel();
  if (!hasCapability("effective")) {
    showEffective = false;
    effectiveShadowedKeys = new Set();
    effectiveConflictKeys = new Set();
    effectiveAncestorKeys = new Set();
    effectiveBtn?.classList.remove("active");
  }
}

function setupSearch() {
  const input = document.getElementById("searchInput");
  input.addEventListener("input", () => {
    searchQuery = input.value.trim().toLowerCase();
    renderAll();
  });
}

function setupSidebarTree() {
  document.getElementById("sidebarTree").addEventListener("click", (event) => {
    const catRow = event.target.closest(".s-cat");
    if (catRow) {
      selectedScopeId = catRow.dataset.scopeId;
      expandScopePath(selectedScopeId);
      if (hasCapability("contextBudget") && isContextBudgetOpen()) {
        openContextBudget(selectedScopeId);
      } else if (hasCapability("mcpControls") && !document.getElementById("mcpControlsPanel").classList.contains("hidden")) {
        openMcpControlsPanel();
      }
      const cat = catRow.dataset.cat;
      if (activeFilters.size === 1 && activeFilters.has(cat)) {
        activeFilters.clear();
      } else {
        activeFilters = new Set([cat]);
      }
      renderAll();
      return;
    }

    const toggle = event.target.closest(".s-tog");
    if (toggle && !toggle.classList.contains("empty")) {
      const hdr = toggle.closest(".s-scope-hdr");
      if (!hdr) return;
      const scopeId = hdr.dataset.scopeId;
      if (uiState.expandedScopes.has(scopeId)) uiState.expandedScopes.delete(scopeId);
      else uiState.expandedScopes.add(scopeId);
      renderSidebar();
      return;
    }

    const hdr = event.target.closest(".s-scope-hdr");
    if (!hdr) return;
    selectedScopeId = hdr.dataset.scopeId;
    showEffective = false; effectiveShadowedKeys = new Set(); effectiveConflictKeys = new Set(); effectiveAncestorKeys = new Set();
    document.getElementById("inheritToggleBtn")?.classList.remove("active");
    expandScopePath(selectedScopeId);
    if (hasCapability("contextBudget") && isContextBudgetOpen()) {
      openContextBudget(selectedScopeId);
    } else if (hasCapability("mcpControls") && !document.getElementById("mcpControlsPanel").classList.contains("hidden")) {
      openMcpControlsPanel();
    } else if (selectedItem && selectedItem.scopeId !== selectedScopeId) {
      closeDetail();
    }
    renderAll();
  });
}

function setupFilterBar() {
  document.getElementById("pills").addEventListener("click", (event) => {
    const selectBtn = event.target.closest("#selectBtn");
    if (selectBtn) {
      selectMode = !selectMode;
      document.getElementById("app").classList.toggle("select-mode", selectMode);
      renderPills();
      updateBulkBar();
      return;
    }

    const pill = event.target.closest(".f-pill");
    if (!pill) return;

    const key = pill.dataset.filter;
    if (key === "all") {
      activeFilters.clear();
    } else if (activeFilters.has(key)) {
      activeFilters.delete(key);
    } else {
      activeFilters.add(key);
    }

    renderAll();
  });
}

function setupItemList() {
  const itemList = document.getElementById("itemList");

  itemList.addEventListener("click", async (event) => {
    const actionBtn = event.target.closest(".act-btn");
    if (actionBtn) {
      // MCP toggle doesn't need the item object — handle first
      if (actionBtn.dataset.action === "mcp-toggle") {
        if (!hasCapability("mcpControls")) return;
        const mcpName = actionBtn.dataset.mcpName;
        const scope = getScopeById(selectedScopeId);
        if (!scope?.repoDir) return;
        const isCurrentlyDisabled = mcpDisabledNames.has(mcpName);
        if (isCurrentlyDisabled) {
          toggleMcpDisabled(scope.repoDir, mcpName, "enable");
        } else {
          showMcpDisableConfirm(scope, mcpName);
        }
        return;
      }

      const itemEl = actionBtn.closest(".item");
      const item = getItemByKey(itemEl?.dataset.itemKey);
      if (!item) return;

      if (actionBtn.dataset.action === "move") {
        openMoveModal(item);
      } else if (actionBtn.dataset.action === "open") {
        openInEditor(item.path);
      } else if (actionBtn.dataset.action === "delete") {
        openDeleteModal(item);
      } else if (actionBtn.dataset.action === "resume") {
        // Copy resume command to clipboard
        const sessionId = item.fileName?.replace(/\.jsonl$/, "") || "";
        const scope = getScopeById(item.scopeId);
        const dir = scope?.repoDir || "~";
        const cmd = `cd ${dir} && ${getHarnessExecutable()} --resume ${sessionId}`;
        navigator.clipboard.writeText(cmd).then(() => {
          toast("Copied resume command — paste in terminal");
        });
      } else if (actionBtn.dataset.action === "distill") {
        // Distill session via API
        actionBtn.disabled = true;
        actionBtn.textContent = "...";
        try {
          const resp = await fetch(apiUrl("/api/session-distill", { path: item.path }), { method: "POST" });
          const data = await resp.json();
          if (data.ok) {
            toast(`Distilled: ${data.stats.reduction} reduction, ${data.stats.indexEntries || 0} indexed refs`);
            actionBtn.textContent = "✓";
            refreshUI(); // refresh list to show new distilled session
          } else {
            toast(`Error: ${data.error}`, true);
            actionBtn.textContent = "Distill";
            actionBtn.disabled = false;
          }
        } catch (err) {
          toast(`Error: ${err.message}`, true);
          actionBtn.textContent = "Distill";
          actionBtn.disabled = false;
        }
      }
      return;
    }

    if (event.target.closest(".item-chk")) return;

    const effectiveEmptyBtn = event.target.closest(".effective-empty-btn");
    if (effectiveEmptyBtn) {
      enableShowEffective();
      return;
    }

    // Click on security flag → open security panel and expand that server
    const secFlag = event.target.closest(".item-sec-flag");
    if (secFlag) {
      const itemEl = secFlag.closest(".item");
      const item = getItemByKey(itemEl?.dataset.itemKey);
      if (!item || item.category !== "mcp") return;
      // UNREACHABLE → open detail panel + highlight Fix Server button
      if (getSecuritySeverity(item.name) === "unreachable") {
        showDetail(item);
        requestAnimationFrame(() => {
          const fixBtn = document.querySelector('.cc-btn[data-prompt*="unreachable"], .cc-btn[data-prompt*="Fix Server"], .cc-btn[data-prompt*="diagnose and fix"]');
          if (fixBtn) {
            fixBtn.classList.add("sec-flash");
            fixBtn.scrollIntoView({ behavior: "smooth", block: "center" });
            setTimeout(() => fixBtn.classList.remove("sec-flash"), 2000);
          }
        });
      } else {
        openSecurityForServer(item.name);
      }
      return;
    }

    const newSessionBtn = event.target.closest(".new-session-btn");
    if (newSessionBtn) {
      const scope = getScopeById(newSessionBtn.dataset.scopeId);
      const dir = scope?.repoDir || "~";
      const cmd = `cd ${dir} && ${getHarnessExecutable()}`;
      navigator.clipboard.writeText(cmd).then(() => {
        toast("Copied: " + cmd);
      });
      return;
    }

    const sortBtn = event.target.closest(".sort-btn");
    if (sortBtn) {
      const cat = sortBtn.dataset.cat;
      const field = sortBtn.dataset.sort;
      const catKey = `${selectedScopeId}::${cat}`;
      const current = uiState.sortBy[catKey];
      if (current?.field === field) {
        uiState.sortBy[catKey] = { field, dir: current.dir === "asc" ? "desc" : "asc" };
      } else {
        uiState.sortBy[catKey] = { field, dir: field === "date" ? "desc" : "asc" };
      }
      renderMainContent();
      initSortable();
      return;
    }

    const catHdr = event.target.closest(".cat-hdr");
    if (catHdr && !event.target.closest(".sort-btn") && !event.target.closest(".new-session-btn")) {
      const key = `${selectedScopeId}::${catHdr.dataset.cat}`;
      if (uiState.collapsedCats.has(key)) uiState.collapsedCats.delete(key);
      else uiState.collapsedCats.add(key);
      renderMainContent();
      initSortable();
      return;
    }

    const bundleRow = event.target.closest(".bundle-row");
    if (bundleRow) {
      const key = `${selectedScopeId}::${bundleRow.dataset.bundle}`;
      if (uiState.collapsedBundles.has(key)) uiState.collapsedBundles.delete(key);
      else uiState.collapsedBundles.add(key);
      renderMainContent();
      initSortable();
      return;
    }

    const itemEl = event.target.closest(".item");
    if (!itemEl) return;
    const item = getItemByKey(itemEl.dataset.itemKey);
    if (item) showDetail(item);
  });

  itemList.addEventListener("change", (event) => {
    const checkbox = event.target.closest(".item-chk");
    if (!checkbox) return;

    const key = checkbox.dataset.itemKey;
    if (checkbox.checked) bulkSelected.add(key);
    else bulkSelected.delete(key);
    updateBulkBar();
  });
}

function setupDetailPanel() {
  document.getElementById("detailClose").addEventListener("click", closeDetail);
  document.getElementById("detailOpen").addEventListener("click", () => {
    if (selectedItem) openInEditor(selectedItem.path);
  });
  document.getElementById("detailMove").addEventListener("click", () => {
    if (selectedItem && (canMoveItem(selectedItem) || selectedItem.locked)) openMoveModal(selectedItem);
  });
  document.getElementById("detailDelete").addEventListener("click", () => {
    if (selectedItem && canDeleteItem(selectedItem)) openDeleteModal(selectedItem);
  });
  document.getElementById("costBackBtn").addEventListener("click", () => {
    document.getElementById("costBreakdown").classList.add("hidden");
    document.querySelector(".detail-body").classList.remove("hidden");
  });

  // Metadata collapsible toggle
  const metaToggle = document.getElementById("detailMetaToggle");
  const metaBody = document.getElementById("detailMetaBody");
  if (metaToggle && metaBody) {
    metaToggle.addEventListener("click", () => {
      metaBody.classList.toggle("hidden");
      metaToggle.classList.toggle("open");
      metaToggle.querySelector(".d-meta-arrow").textContent = metaBody.classList.contains("hidden") ? "▸" : "▾";
    });
  }
}

function formatTokenCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function formatDurationMs(ms) {
  if (ms < 60_000) return Math.round(ms / 1000) + "s";
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  if (mins < 60) return mins + "m " + secs + "s";
  const hrs = Math.floor(mins / 60);
  return hrs + "h " + (mins % 60) + "m";
}

async function showCostBreakdown(item) {
  const costPanel = document.getElementById("costBreakdown");
  const detailBody = document.querySelector(".detail-body");
  const totalEl = document.getElementById("costTotal");
  const durationEl = document.getElementById("costDuration");
  const modelsEl = document.getElementById("costModels");

  detailBody.classList.add("hidden");
  costPanel.classList.remove("hidden");
  totalEl.textContent = "Loading...";
  durationEl.textContent = "";
  modelsEl.innerHTML = "";

  try {
    const res = await fetch(apiUrl("/api/session-cost", { path: item.path }));
    const data = await res.json();
    if (!data.ok) { totalEl.textContent = "Error loading cost"; return; }

    // Total tokens across all models
    const totalInput = data.breakdown.reduce((s, m) => s + m.inputTokens, 0);
    const totalOutput = data.breakdown.reduce((s, m) => s + m.outputTokens, 0);
    const totalTokens = totalInput + totalOutput + data.breakdown.reduce((s, m) => s + m.cacheRead + m.cacheWrite, 0);
    totalEl.textContent = formatTokenCount(totalTokens) + " tokens";
    const parts = [];
    if (data.durationMs > 0) parts.push(formatDurationMs(data.durationMs));
    parts.push("API equivalent: $" + data.totalCostUSD.toFixed(2));
    durationEl.textContent = parts.join(" · ");

    if (!data.breakdown.length) {
      modelsEl.innerHTML = `<div style="color:var(--text-muted);font-size:0.8rem;">No token usage data in this session.</div>`;
      return;
    }

    modelsEl.innerHTML = data.breakdown.map(m => {
      const mTotal = m.inputTokens + m.outputTokens + m.cacheRead + m.cacheWrite;
      return `
      <div class="d-cost-model">
        <div class="d-cost-model-head">
          <span class="d-cost-model-name">${esc(m.model)}</span>
          <span class="d-cost-model-cost">${formatTokenCount(mTotal)} tokens</span>
        </div>
        <div class="d-cost-model-tokens">
          <div class="d-cost-token-row"><span class="d-cost-token-label">Input</span><span class="d-cost-token-val">${formatTokenCount(m.inputTokens)}</span></div>
          <div class="d-cost-token-row"><span class="d-cost-token-label">Output</span><span class="d-cost-token-val">${formatTokenCount(m.outputTokens)}</span></div>
          <div class="d-cost-token-row"><span class="d-cost-token-label">Cache Read</span><span class="d-cost-token-val">${formatTokenCount(m.cacheRead)}</span></div>
          <div class="d-cost-token-row"><span class="d-cost-token-label">Cache Write</span><span class="d-cost-token-val">${formatTokenCount(m.cacheWrite)}</span></div>
        </div>
        <div class="d-cost-turns">${m.turns} turn${m.turns !== 1 ? "s" : ""} · API equivalent: $${m.costUSD.toFixed(2)}</div>
      </div>
    `}).join("");
  } catch {
    totalEl.textContent = "Error loading cost";
  }
}

function setupBulkBar() {
  document.getElementById("bulkClear").addEventListener("click", () => {
    bulkSelected.clear();
    document.querySelectorAll(".item-chk").forEach((checkbox) => {
      checkbox.checked = false;
    });
    updateBulkBar();
  });

  document.getElementById("bulkDelete").addEventListener("click", async () => {
    const items = getSelectedItems();
    if (items.length === 0) return;

    if (!confirm(`Delete ${items.length} item(s)? This cannot be undone.`)) return;

    let ok = 0;
    let fail = 0;

    for (const item of items) {
      const result = await doDelete(item, true);
      if (result.ok) ok++;
      else fail++;
    }

    bulkSelected.clear();
    await refreshUI();
    toast(`Deleted ${ok} item(s)${fail ? `, ${fail} failed` : ""}`);
  });

  document.getElementById("bulkMove").addEventListener("click", async () => {
    const items = getSelectedItems();
    if (items.length === 0) return;

    const categories = new Set(items.map((item) => item.category));
    if (categories.size > 1) {
      toast("Cannot bulk-move items of different types", true);
      return;
    }

    const nonMovable = items.filter((item) => !canMoveItem(item));
    if (nonMovable.length > 0) {
      toast(`${nonMovable[0].category} items cannot be moved`, true);
      return;
    }

    openBulkMoveModal(items);
  });
}

function setupThemeToggle() {
  const button = document.getElementById("themeToggle");
  updateThemeButton();
  button.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    updateThemeButton();
  });
}

function setupCollapseAll() {
  const button = document.getElementById("collapseAllBtn");
  button.addEventListener("click", () => {
    if (uiState._dragCollapsed) {
      // Expand: open all scopes
      uiState._dragCollapsed = false;
      (data?.scopes || []).forEach(s => uiState.expandedScopes.add(s.id));
      button.title = "Collapse all";
      button.textContent = "▤";
    } else {
      // Collapse: close all scopes
      uiState._dragCollapsed = true;
      uiState.expandedScopes.clear();
      button.title = "Expand all";
      button.textContent = "▦";
    }
    renderSidebar();
  });

  const treeBtn = document.getElementById("treeViewBtn");
  if (treeBtn) {
    treeBtn.addEventListener("click", () => {
      treeView = !treeView;
      // Enter tree view → auto-collapse to folder-only; leave → expand
      uiState._dragCollapsed = treeView;
      const collapseBtn = document.getElementById("collapseAllBtn");
      if (collapseBtn) {
        collapseBtn.textContent = treeView ? "▦" : "▤";
        collapseBtn.title = treeView ? "Expand all" : "Collapse all";
      }
      treeBtn.textContent = treeView ? "☰" : "🌲";
      treeBtn.title = treeView ? "Switch to flat view" : "Switch to tree view (filesystem structure)";
      treeBtn.classList.toggle("active", treeView);
      renderSidebar();
    });
  }
}

function updateThemeButton() {
  const button = document.getElementById("themeToggle");
  button.textContent = document.body.classList.contains("dark") ? "☀ Light" : "◐ Dark";
}

function setupResizers() {
  setupResizer("resizerLeft", "sidebar", "left");
  setupResizer("resizerRight", "detailPanel", "right");
  setupResizer("resizerSecurity", "securityPanel", "right");
}

function setupResizer(resizerId, panelId, direction) {
  const resizer = document.getElementById(resizerId);
  const defaultPanel = document.getElementById(panelId);
  if (!resizer || !defaultPanel) return;

  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener("mousedown", (event) => {
    // For right resizer: resize whichever detail panel is currently visible
    let panel = defaultPanel;
    if (resizerId === "resizerRight") {
      const budgetPanel = document.getElementById("ctxBudgetPanel");
      const securityPanel = document.getElementById("securityPanel");
      if (budgetPanel && !budgetPanel.classList.contains("hidden")) {
        panel = budgetPanel;
      } else if (securityPanel && !securityPanel.classList.contains("hidden") &&
                 defaultPanel.classList.contains("hidden")) {
        // Only resize security via resizerRight when no detail/budget panel is open
        panel = securityPanel;
      }
    }

    startX = event.clientX;
    startWidth = panel.getBoundingClientRect().width;
    resizer.classList.add("active");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(moveEvent) {
      const delta = direction === "left" ? moveEvent.clientX - startX : startX - moveEvent.clientX;
      const nextWidth = Math.max(180, Math.min(600, startWidth + delta));
      panel.style.width = `${nextWidth}px`;
      panel.style.flexShrink = "0";
    }

    function onUp() {
      resizer.classList.remove("active");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

function renderAll() {
  normalizeState();
  updateCapabilityVisibility();
  updateHarnessSelector();
  updateHarnessBranding();
  renderSidebar();
  renderContentHeader();
  renderPills();
  renderRuleBar();
  // If scope changed, load disabled list then re-render; otherwise render immediately with cache
  if (mcpDisabledScopeId !== selectedScopeId) {
    loadMcpDisabledList().then(() => { renderMainContent(); initSortable(); });
  } else {
    renderMainContent();
    initSortable();
  }
  updateBulkBar();

  const needsPreview = selectedItem && itemKey(selectedItem) !== detailPreviewKey;
  renderDetailPanel(needsPreview);

  if (needsPreview) {
    loadPreview(selectedItem);
  }

  initSortable();

  const loading = document.getElementById("loading");
  loading.classList.toggle("hidden", Boolean(data));
  document.getElementById("app").classList.toggle("select-mode", selectMode);
}

function renderSidebar() {
  const tree = document.getElementById("sidebarTree");
  const rootScopes = getRootScopes().filter((scope) => scopeVisibleInSidebar(scope));

  if (rootScopes.length === 0) {
    tree.innerHTML = `<div class="empty-state">No scopes match the current search.</div>`;
    return;
  }

  if (treeView) {
    // Tree mode: group project scopes by path ancestry for visual hierarchy
    // This reflects filesystem structure only — not a universal scope inheritance model
    tree.innerHTML = rootScopes.map((scope) => renderSidebarScopeTree(scope)).join("");
  } else {
    // Flat mode: all scopes at the same level, no nesting at all
    const allScopes = (data?.scopes || []).filter(s => scopeVisibleInSidebar(s));
    tree.innerHTML = allScopes.map((scope) => renderSidebarScope(scope, "")).join("");
  }
}

/**
 * Tree view renderer: computes display-only parent-child relationships from
 * filesystem paths. This is a visual grouping only — effective behavior
 * depends on each category's own official rules, not this tree.
 */
function renderSidebarScopeTree(scope) {
  if (scope.id === "global") {
    // Under global, render path-nested projects
    const allProjects = (data?.scopes || []).filter(s => s.id !== "global" && scopeVisibleInSidebar(s));
    // Sort by path depth then name
    allProjects.sort((a, b) => {
      const da = (a.repoDir || "").split("/").length;
      const db = (b.repoDir || "").split("/").length;
      if (da !== db) return da - db;
      return (a.name || "").localeCompare(b.name || "");
    });
    // Find top-level projects (no other project is their path ancestor)
    const topLevel = allProjects.filter(s =>
      !allProjects.some(other => other.id !== s.id && s.repoDir && other.repoDir && s.repoDir.startsWith(other.repoDir + "/"))
    );
    const childHtml = topLevel.filter(s => scopeVisibleInSidebar(s)).map(s => renderSidebarScopeTree(s)).join("");
    return renderSidebarScope(scope, childHtml);
  }

  // For project scopes in tree mode: find children by path prefix
  const children = (data?.scopes || []).filter(s =>
    s.id !== scope.id && s.id !== "global" && s.repoDir && scope.repoDir &&
    s.repoDir.startsWith(scope.repoDir + "/") &&
    // direct child only: no intermediate scope
    !(data?.scopes || []).some(mid =>
      mid.id !== s.id && mid.id !== scope.id && mid.id !== "global" &&
      mid.repoDir && s.repoDir.startsWith(mid.repoDir + "/") &&
      mid.repoDir.startsWith(scope.repoDir + "/")
    )
  ).filter(c => scopeVisibleInSidebar(c));

  const childHtml = children.map(c => renderSidebarScopeTree(c)).join("");
  return renderSidebarScope(scope, childHtml);
}

function renderSidebarScope(scope, overrideChildHtml) {
  const childHtml = overrideChildHtml !== undefined ? overrideChildHtml
    : getChildScopes(scope.id)
      .filter((child) => scopeVisibleInSidebar(child))
      .map((child) => renderSidebarScope(child))
      .join("");

  const categoryRows = getSidebarCategoryCounts(scope.id)
    .map(({ category, count }) => {
      const config = getCategoryConfig(category);
      return `
        <div class="s-cat" data-scope-id="${esc(scope.id)}" data-cat="${esc(category)}">
          <span class="s-cat-ico">${config.icon}</span>
          <span class="s-cat-nm">${esc(config.label)}</span>
          <span class="s-cat-cnt">${count}</span>
        </div>`;
    })
    .join("");

  const isDragMode = uiState._dragCollapsed;
  const hasNestedContent = Boolean(categoryRows || childHtml);
  const hasChildren = Boolean(childHtml);
  const isExpanded = hasNestedContent && (searchQuery ? true : uiState.expandedScopes.has(scope.id));
  // In drag/collapse mode: always show children (scope names), hide categories
  const showBody = isDragMode ? hasChildren : (isExpanded && hasNestedContent);
  const icon = getScopeIcon(scope.type);

  return `
    <div class="s-scope scope-block" data-scope-id="${esc(scope.id)}">
      <div class="s-scope-hdr${scope.id === selectedScopeId ? " active" : ""}" data-scope-id="${esc(scope.id)}">
        <span class="s-tog${hasNestedContent ? (isExpanded || isDragMode ? "" : " collapsed") : " empty"}">▾</span>
        <span class="s-ico">${icon}</span>
        <span class="s-nm">${esc(scope.name)}</span>
        <span class="s-cnt">${getRecursiveScopeCount(scope.id)}</span>
      </div>
      ${showBody ? `
        <div class="s-scope-body">
          ${(!isDragMode && categoryRows) ? `<div>${categoryRows}</div>` : ""}
          ${childHtml ? `<div class="s-children">${childHtml}</div>` : ""}
        </div>` : (hasNestedContent && !showBody ? `
        <div class="s-scope-body collapsed">
          ${(!isDragMode && categoryRows) ? `<div>${categoryRows}</div>` : ""}
          ${childHtml ? `<div class="s-children">${childHtml}</div>` : ""}
        </div>` : "")}
    </div>`;
}

function renderContentHeader() {
  const scope = getScopeById(selectedScopeId);
  const title = document.getElementById("contentTitle");
  const tag = document.getElementById("contentScopeTag");
  const inherit = document.getElementById("contentInherit");

  if (!scope) {
    title.textContent = "Organizer";
    tag.textContent = "global";
    inherit.innerHTML = "";
    inherit.style.display = "none";
    return;
  }

  title.textContent = scope.name;
  tag.textContent = scope.type;

  // No longer show "inherits from Global" — each category has its own rules
  inherit.innerHTML = "";
  inherit.style.display = "none";
}

function renderPills() {
  const container = document.getElementById("pills");
  // Count items for the currently selected scope, plus Global effective items if showEffective
  let scopeItems = selectedScopeId
    ? (data?.items || []).filter((i) => i.scopeId === selectedScopeId)
    : data?.items || [];
  if (showEffective && selectedScopeId && selectedScopeId !== "global") {
    const globalItems = (data?.items || []).filter(
      (i) => i.scopeId === "global" && Boolean(getEffectiveRule(i.category))
    );
    scopeItems = [...scopeItems, ...globalItems];
  }
  const scopeCounts = {};
  let scopeTotal = 0;
  for (const item of scopeItems) {
    scopeCounts[item.category] = (scopeCounts[item.category] || 0) + 1;
    scopeTotal++;
  }

  const NO_RULE_TIP = "No official scope rule — shown as inventory only";
  const pills = [
    { key: "all", label: "All", icon: "◌", count: scopeTotal, tip: null },
    ...getCategoryOrder().map((category) => {
      const config = getCategoryConfig(category);
      const hasRule = Boolean(getEffectiveRule(category));
      return {
        key: category,
        label: config.filterLabel,
        icon: config.icon,
        count: scopeCounts[category] || 0,
        tip: getEffectiveRule(category) || (showEffective ? NO_RULE_TIP : null),
        noRule: showEffective && !hasRule,
      };
    }),
  ];

  const allActive = activeFilters.size === 0;
  const visiblePills = pills.filter((p) => p.key === "all" || p.count > 0 || activeFilters.has(p.key));
  const hiddenPills = pills.filter((p) => p.key !== "all" && p.count === 0 && !activeFilters.has(p.key));
  const showHidden = container.dataset.expanded === "true";

  container.innerHTML = `
    ${visiblePills.map((pill) => {
      const isActive = pill.key === "all" ? allActive : activeFilters.has(pill.key);
      const dimmed = pill.noRule ? " f-pill-dim" : "";
      const tipAttr = pill.tip ? ` data-tooltip="${esc(pill.tip)}"` : "";
      return `
        <button type="button" class="f-pill${isActive ? " active" : ""}${dimmed}" data-filter="${pill.key}"${tipAttr}>
          <span class="f-pill-ico">${pill.icon}</span>
          ${esc(pill.label)}
          <b>${pill.count}</b>
        </button>`;
    }).join("")}${hiddenPills.length > 0 ? `
        <button type="button" class="f-pill f-pill-more" id="pillsMore">${showHidden ? "Less ▴" : `+${hiddenPills.length} more ▾`}</button>` : ""}${showHidden ? hiddenPills.map((pill) => `
        <button type="button" class="f-pill f-pill-dim" data-filter="${pill.key}">
          <span class="f-pill-ico">${pill.icon}</span>
          ${esc(pill.label)}
          <b>0</b>
        </button>`).join("") : ""}
    <button type="button" class="select-btn${selectMode ? " active" : ""}" id="selectBtn">☐ Select</button>`;

  // Toggle handler for "more" button
  const moreBtn = document.getElementById("pillsMore");
  if (moreBtn) {
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      container.dataset.expanded = showHidden ? "false" : "true";
      renderPills();
    });
  }
}

function renderRuleBar() {
  const bar = document.getElementById("ruleBar");
  const toggle = document.getElementById("ruleBarToggle");
  const content = document.getElementById("ruleBarContent");
  if (!bar || !toggle || !content) return;

  if (!hasCapability("effective") || !showEffective || !selectedScopeId || selectedScopeId === "global") {
    bar.classList.add("hidden");
    return;
  }

  bar.classList.remove("hidden");

  // Build rule rows for all categories
  const rows = getCategoryOrder().map(cat => {
    const config = getCategoryConfig(cat);
    if (!config) return "";
    const rule = getEffectiveRule(cat);
    const noRule = !rule;
    return `<div class="rule-row${noRule ? " rule-none" : ""}">
      <span class="rule-cat">${config.icon} ${esc(config.filterLabel)}</span>
      <span class="rule-text">${esc(rule || "No official scope rule")}</span>
    </div>`;
  }).join("");

  content.innerHTML = rows;

  // Toggle handler (re-attach each render since innerHTML may have changed)
  toggle.onclick = () => {
    content.classList.toggle("hidden");
    toggle.querySelector(".ctx-toggle-arrow").textContent =
      content.classList.contains("hidden") ? "▸" : "▾";
  };
}

async function loadMcpDisabledList(force = false) {
  if (!hasCapability("mcpControls")) { mcpDisabledNames = new Set(); return; }
  if (!force && mcpDisabledScopeId === selectedScopeId) return; // already loaded for this scope
  mcpDisabledScopeId = selectedScopeId;
  const scope = getScopeById(selectedScopeId);
  if (!scope?.repoDir) { mcpDisabledNames = new Set(); return; }
  try {
    const res = await fetchJson(`/api/mcp-disabled?project=${encodeURIComponent(scope.repoDir)}`);
    mcpDisabledNames = new Set(res.ok ? res.disabled : []);
  } catch { mcpDisabledNames = new Set(); }
}

function renderMainContent() {
  const itemList = document.getElementById("itemList");
  const scope = getScopeById(selectedScopeId);

  if (!scope) {
    itemList.innerHTML = `<div class="empty-state empty-centered">Select a scope to inspect its contents.</div>`;
    return;
  }

  const items = getVisibleItemsForScope(scope.id);
  const categories = getCategoryOrder()
    .map((category) => ({
      category,
      items: sortCategoryItems(category, items.filter((item) => item.category === category)),
    }))
    .filter((entry) => entry.items.length > 0);

  if (categories.length === 0) {
    const selectedCategory = activeFilters.size === 1 ? [...activeFilters][0] : null;
    const effectivePrompt = selectedCategory ? renderContextualEffectivePrompt(scope.id, selectedCategory, []) : "";
    if (!searchQuery && effectivePrompt) {
      const config = getCategoryConfig(selectedCategory);
      itemList.innerHTML = `
        <div class="empty-state empty-centered">No ${esc(config.label.toLowerCase())} found in this scope.</div>
        ${effectivePrompt}`;
      return;
    }
    const message = searchQuery
      ? "No items match the current search in this scope."
      : activeFilters.size > 0
        ? "No items match the current filters in this scope."
        : "No items found in this scope.";
    itemList.innerHTML = `<div class="empty-state empty-centered">${message}</div>`;
    return;
  }

  itemList.innerHTML = categories.map(({ category, items: catItems }) => {
    const config = getCategoryConfig(category);
    const catKey = `${scope.id}::${category}`;
    const collapsed = searchQuery ? false : uiState.collapsedCats.has(catKey);
    const effectivePrompt = renderContextualEffectivePrompt(scope.id, category, catItems);

    return `
      <div class="cat-section" data-cat-section="${esc(category)}">
        <div class="cat-hdr" data-cat="${esc(category)}">
          <span class="cat-hdr-tog${collapsed ? " collapsed" : ""}">▾</span>
          <span class="cat-hdr-ico">${config.icon}</span>
          <span class="cat-hdr-nm">${esc(config.label)}</span>
          <span class="cat-hdr-cnt">${pluralize(catItems.length, "item")}</span>
          ${category === "session" && hasCapability("sessions") ? `<button type="button" class="new-session-btn" data-scope-id="${esc(scope.id)}" title="Copy command to start a new session">＋ New</button>` : ""}
          ${category === "mcp" ? "" : `<span class="cat-hdr-sort">
            <button type="button" class="sort-btn${(uiState.sortBy[`${scope.id}::${category}`]?.field === "size") ? " active" : ""}" data-cat="${esc(category)}" data-sort="size">Size ${sortArrow(`${scope.id}::${category}`, "size")}</button>
            <button type="button" class="sort-btn${(uiState.sortBy[`${scope.id}::${category}`]?.field === "date") ? " active" : ""}" data-cat="${esc(category)}" data-sort="date">Date ${sortArrow(`${scope.id}::${category}`, "date")}</button>
          </span>`}
        </div>
        <div class="cat-body${collapsed ? " collapsed" : ""}">
          ${category === "mcp" && data?.enterpriseMcp?.active ? `<div class="enterprise-banner">⚠️ Enterprise MCP Active — Only managed servers are loaded. User, project, and plugin servers are ignored.${data.enterpriseMcp.serverCount > 0 ? ` <strong>${data.enterpriseMcp.serverCount}</strong> managed server${data.enterpriseMcp.serverCount === 1 ? "" : "s"}.` : ""}</div>` : ""}
          ${(category === "skill" || category === "session")
            ? renderSkillCategory(scope.id, config.group, catItems)
            : `
              <div class="sortable-zone" data-scope="${esc(scope.id)}" data-group="${config.group || "none"}">
                ${catItems.map((item) => renderItem(item)).join("")}
              </div>`}
          ${effectivePrompt}
        </div>
      </div>`;
  }).join("");

  updateSelectedItemHighlight();
}

function enableShowEffective() {
  if (!hasCapability("effective")) return;
  const scope = getScopeById(selectedScopeId);
  if (!scope || scope.id === "global") return;
  showEffective = true;
  computeEffectiveSets(selectedScopeId);
  document.getElementById("inheritToggleBtn")?.classList.add("active");
  renderAll();
}

function renderContextualEffectivePrompt(scopeId, category, localItems) {
  if (!hasCapability("effective") || showEffective || scopeId === "global" || searchQuery) return "";
  if (!getEffectiveRule(category) || localItems.length > 2) return "";

  const localNames = new Set(localItems.map((item) => item.name));
  const globalItems = (data?.items || []).filter((item) => {
    if (item.scopeId !== "global" || item.category !== category) return false;
    if ((category === "mcp" || category === "agent") && localNames.has(item.name)) return false;
    return true;
  });
  const ancestorScopes = _getAncestorScopes(scopeId, data?.scopes || []);
  const ancestorItems = (category === "config" || category === "memory")
    ? (data?.items || []).filter((item) => ancestorScopes.some((scope) => scope.id === item.scopeId) && item.category === category)
    : [];
  const total = globalItems.length + ancestorItems.length;
  if (total === 0) return "";

  const sources = [];
  if (globalItems.length) sources.push("Global");
  if (ancestorItems.length) sources.push("parent scopes");
  const label = getCategorySingularLabel(category);
  return `
    <div class="effective-empty-state">
      <span>${esc(pluralizeCategoryLabel(total, label))} from ${esc(sources.join(" and "))} also apply here.</span>
      <button type="button" class="effective-empty-btn">Show Effective</button>
    </div>`;
}

function getCategorySingularLabel(category) {
  const labels = {
    mcp: "MCP server",
    memory: "memory",
    skill: "skill",
    command: "command",
    agent: "agent",
    config: "config file",
    hook: "hook",
    setting: "setting",
    rule: "rule",
    plan: "plan",
    profile: "profile",
  };
  if (labels[category]) return labels[category];
  return (getCategoryConfig(category).label || category).replace(/s$/i, "").toLowerCase();
}

function pluralizeCategoryLabel(count, singular) {
  if (count === 1) return `1 ${singular}`;
  if (singular.endsWith("y")) return `${count} ${singular.slice(0, -1)}ies`;
  return `${count} ${singular}s`;
}

function renderSkillCategory(scopeId, group, items) {
  const bundles = new Map();
  const unbundled = [];

  for (const item of items) {
    if (item.bundle) {
      if (!bundles.has(item.bundle)) bundles.set(item.bundle, []);
      bundles.get(item.bundle).push(item);
    } else {
      unbundled.push(item);
    }
  }

  let html = "";

  for (const [bundle, bundleItems] of bundles.entries()) {
    const bundleKey = `${scopeId}::${bundle}`;
    const collapsed = searchQuery ? false : !uiState.collapsedBundles.has(bundleKey);
    const isDistillBundle = bundle.startsWith("[distilled");
    const bundleName = isDistillBundle ? bundle : (bundle.split("/").pop() || bundle);
    const bundleIco = isDistillBundle ? "🧹" : "📦";
    const childCount = isDistillBundle
      ? pluralize(bundleItems.filter(i => i.subType === "distill-artifact").length, "file")
      : pluralize(bundleItems.length, "skill");
    html += `
      <div class="bundle-group">
        <div class="bundle-row" data-bundle="${esc(bundle)}">
          <span class="bundle-row-ico">${bundleIco}</span>
          <span class="bundle-row-nm">${esc(bundleName)}</span>
          ${isDistillBundle ? "" : `<span class="bundle-row-src">${esc(bundle)}</span>`}
          <span class="bundle-row-cnt">${childCount}</span>
        </div>
        <div class="bundle-children${collapsed ? " collapsed" : ""}">
          <div class="sortable-zone" data-scope="${esc(scopeId)}" data-group="${group || "none"}">
            ${bundleItems.map((item) => renderItem(item)).join("")}
          </div>
        </div>
      </div>`;
  }

  if (unbundled.length > 0) {
    html += `
      <div class="sortable-zone" data-scope="${esc(scopeId)}" data-group="${group || "none"}">
        ${unbundled.map((item) => renderItem(item)).join("")}
      </div>`;
  }

  return html;
}

function renderSettingValuePreview(item) {
  const v = item.value;
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.length === 0 ? "(empty array)" : `[${v.slice(0, 3).map(x => JSON.stringify(x)).join(", ")}${v.length > 3 ? ", …" : ""}]`;
  if (typeof v === "object") return "{…}";
  return String(v);
}

function renderItem(item) {
  const icon = getCategoryConfig(item.category).icon || "📄";
  const key = itemKey(item);
  const isSelected = selectedItem && itemKey(selectedItem) === key;
  const checked = bulkSelected.has(key) ? " checked" : "";
  const badgeHtml = shouldShowItemBadge(item) ? renderBadge(item) : "";
  const checkbox = item.locked ? "" : `<input type="checkbox" class="item-chk" data-item-key="${esc(key)}"${checked}>`;
  const dateLabel = formatShortDate(item.mtime || item.ctime);
  const sizeLabel = item.size || "—";
  const desc = item.category === "setting"
    ? renderSettingValuePreview(item)
    : (item.description || item.fileName || item.path || "No description");

  // Effective-mode status badges
  const isFromGlobal   = showEffective && item.scopeId === "global" && selectedScopeId !== "global";
  const isFromAncestor = showEffective && effectiveAncestorKeys.has(key);
  const isShadowed     = isFromGlobal && effectiveShadowedKeys.has(key);
  const isConflict     = showEffective && effectiveConflictKeys.has(key);
  const harnessShortName = getHarnessShortName();
  const harnessId = getHarnessDescriptor().id;
  const globalConfigRoot = harnessId === "claude" ? "~/.claude/" : harnessId === "codex" ? "~/.codex/" : "the harness global config";
  const shadowedTip = "This item is overridden by a project-scoped item with the same name";
  const conflictTip = `Same name exists in both user and project scope — ${harnessShortName} does not guarantee which one applies`;
  const ancestorTip = harnessId === "claude"
    ? "From a parent directory — Claude Code loads CLAUDE.md files by walking up from the working directory"
    : `From a parent directory — ${harnessShortName} may load parent-scope instruction files depending on the selected project`;
  const globalTip = `Available globally from ${globalConfigRoot} — applies to all projects on this machine`;
  const effectiveBadge = isShadowed     ? `<span class="scope-tag st-shadowed" data-tooltip="${esc(shadowedTip)}">Shadowed</span>`
                       : isConflict     ? `<span class="scope-tag st-conflict" data-tooltip="${esc(conflictTip)}">⚠ Conflict</span>`
                       : isFromAncestor ? `<span class="scope-tag st-ancestor" data-tooltip="${esc(ancestorTip)}">Ancestor</span>`
                       : isFromGlobal   ? `<span class="scope-tag st-global" data-tooltip="${esc(globalTip)}">Global</span>`
                       : "";
  const isMcpDisabled = item.category === "mcp" && mcpDisabledNames.has(item.name);
  const mcpToggleBtn = item.category === "mcp" && hasCapability("mcpControls")
    ? `<button type="button" class="act-btn ${isMcpDisabled ? "act-mcp-enable" : "act-mcp-disable"}" data-action="mcp-toggle" data-mcp-name="${esc(item.name)}" title="${isMcpDisabled ? "Re-enable in this project" : "Disable in this project"}">${isMcpDisabled ? "Enable" : "Disable"}</button>`
    : "";
  // Session rows get Resume + Distill instead of Move/Open/Del
  const sessionActions = isSessionTranscript(item) && hasCapability("sessions") ? `
    <span class="item-actions">
      <button type="button" class="act-btn act-resume" data-action="resume" title="Copy resume command">Resume</button>
      ${canDistillSession(item) ? `<button type="button" class="act-btn act-distill" data-action="distill" title="Distill session (backup + clean)">Distill</button>` : ""}
    </span>` : null;

  const actions = sessionActions || ((item.locked || isFromGlobal) ? (mcpToggleBtn ? `<span class="item-actions">${mcpToggleBtn}</span>` : "") : `
    <span class="item-actions">
      ${(canMoveItem(item) || item.locked) ? `<button type="button" class="act-btn act-move" data-action="move">Move</button>` : ""}
      ${item.category !== "mcp" ? `<button type="button" class="act-btn act-open" data-action="open">Open</button>` : ""}
      ${canDeleteItem(item) ? `<button type="button" class="act-btn act-del" data-action="delete">Del</button>` : ""}
      ${mcpToggleBtn}
    </span>`);

  const dragHandle = item.locked ? "" : `<span class="drag-handle" title="Drag to move">⠿</span>`;

  // Security badge for MCP items
  const secSev = item.category === "mcp" ? getSecuritySeverity(item.name) : null;
  const secLabel = secSev === "critical" ? "CRITICAL" : secSev === "high" ? "HIGH" : secSev === "medium" ? "MED" : secSev === "low" ? "LOW" : secSev === "unreachable" ? "UNREACHABLE" : "";
  const secBadgeHtml = secSev
    ? `<span class="sec-badge sec-${secSev} item-sec-flag">${secLabel}</span>`
    : "";
  // Baseline status flag (NEW / CHANGED) for MCP items
  const blStatus = item.category === "mcp" ? (securityBaselineStatus[item.name] || null) : null;
  const blFlagHtml = blStatus === "new"
    ? `<span class="sec-badge sec-new item-sec-flag">NEW</span>`
    : blStatus === "changed"
      ? `<span class="sec-badge sec-changed item-sec-flag">CHANGED</span>`
      : "";

  return `
    <div class="item${item.locked ? " locked" : ""}${isSelected ? " selected" : ""}${isMcpDisabled ? " mcp-disabled" : ""}" data-item-key="${esc(key)}" data-path="${esc(item.path)}" data-category="${esc(item.category)}">
      ${dragHandle}
      ${checkbox}
      <span class="item-ico">${icon}</span>
      ${effectiveBadge}
      <span class="item-name">${esc(item.name)}</span>
      ${secBadgeHtml}${blFlagHtml}${isMcpDisabled ? `<span class="mcp-disabled-badge" title="Disabled in this project — all servers named '${esc(item.name)}' won't load here">Disabled</span>` : ""}
      ${badgeHtml}
      <span class="item-desc">${item.category === "mcp" ? "" : esc(desc)}</span>
      ${actions}
      ${item.category === "mcp" ? "" : item.category === "setting" ? `<div class="item-right">
        <span class="item-size">${esc(item.settingGroup || "")}</span>
        <span class="item-date">${esc(item.sourceTier || "")}</span>
      </div>` : `<div class="item-right">
        <span class="item-size">${esc(sizeLabel)}</span>
        <span class="item-date">${esc(dateLabel)}</span>
      </div>`}
    </div>`;
}

function renderDetailPanel(resetPreview = false) {
  const title = document.getElementById("detailTitle");
  const crumb = document.getElementById("detailCrumb");
  const scopeEl = document.getElementById("detailScope");
  const type = document.getElementById("detailType");
  const desc = document.getElementById("detailDesc");
  const size = document.getElementById("detailSize");
  const dates = document.getElementById("detailDates");
  const path = document.getElementById("detailPath");
  const preview = document.getElementById("previewContent");
  const openBtn = document.getElementById("detailOpen");
  const moveBtn = document.getElementById("detailMove");
  const deleteBtn = document.getElementById("detailDelete");
  const costPanel = document.getElementById("costBreakdown");
  const detailBody = document.querySelector(".detail-body");

  // always reset cost panel when switching items
  costPanel.classList.add("hidden");
  detailBody.classList.remove("hidden");

  if (!selectedItem) {
    title.textContent = "Select an item";
    crumb.innerHTML = `<span class="crumb-pill">No item selected</span>`;
    scopeEl.textContent = "—";
    type.textContent = "—";
    desc.textContent = "Select an item to inspect its metadata and preview.";
    size.textContent = "—";
    dates.innerHTML = `
      <div class="d-info-cell"><span class="d-info-label">Created</span><span class="d-info-val">—</span></div>
      <div class="d-info-cell"><span class="d-info-label">Modified</span><span class="d-info-val">—</span></div>`;
    path.textContent = "—";
    preview.textContent = "Select an item to preview";
    openBtn.disabled = true;
    moveBtn.disabled = true;
    deleteBtn.disabled = true;
    detailPreviewKey = null;
    return;
  }

  const scope = getScopeById(selectedItem.scopeId);
  title.textContent = selectedItem.name;

  // For sessions: replace breadcrumb with cost breakdown button
  if (isSessionTranscript(selectedItem)) {
    crumb.innerHTML = `<button class="d-btn d-btn-cost" id="crumbCostBtn" type="button">💰 Cost Breakdown</button>`;
    document.getElementById("crumbCostBtn").addEventListener("click", () => showCostBreakdown(selectedItem));
  } else {
    crumb.innerHTML = renderBreadcrumb(scope);
  }
  scopeEl.textContent = scope ? capitalize(scope.name) : selectedItem.scopeId;
  type.innerHTML = renderBadge(selectedItem, true);

  if (selectedItem.category === "setting") {
    desc.textContent = selectedItem.settingGroup ? `Group: ${selectedItem.settingGroup}` : "—";
    size.textContent = selectedItem.valueType || "—";
    dates.innerHTML = `
      <div class="d-info-cell"><span class="d-info-label">Source</span><span class="d-info-val">${esc(selectedItem.sourceFile || "—")}</span></div>
      <div class="d-info-cell"><span class="d-info-label">Tier</span><span class="d-info-val">${esc(selectedItem.sourceTier || "—")}</span></div>`;
    path.textContent = selectedItem.sourceFile || "—";
  } else {
    desc.textContent = selectedItem.description || "—";
    size.textContent = selectedItem.size || "—";
    dates.innerHTML = `
      <div class="d-info-cell"><span class="d-info-label">Created</span><span class="d-info-val">${esc(formatShortDate(selectedItem.ctime) || "—")}</span></div>
      <div class="d-info-cell"><span class="d-info-label">Modified</span><span class="d-info-val">${esc(formatShortDate(selectedItem.mtime) || "—")}</span></div>`;
    path.textContent = selectedItem.path || "—";
  }

  openBtn.disabled = false;
  moveBtn.disabled = false; // always enabled — locked items use CC prompt instead of API
  deleteBtn.disabled = !canDeleteItem(selectedItem);


  // Why it applies (Effective Behavior section)
  renderEffectiveBehavior(selectedItem);

  // Frontmatter config (model, when_to_use, description, maxTurns etc.)
  renderItemConfig(selectedItem);

  // CC Actions — contextual prompt buttons
  renderCcActions(selectedItem);

  if (resetPreview) {
    preview.textContent = "Loading...";
    detailPreviewKey = itemKey(selectedItem);
  }
}

function renderEffectiveBehavior(item) {
  const wrap = document.getElementById("detailEffective");
  const text = document.getElementById("detailEffectiveText");
  if (!wrap || !text || !item) { wrap?.classList.add("hidden"); return; }

  const key = itemKey(item);
  const isGlobal   = item.scopeId === "global";
  const isAncestor = effectiveAncestorKeys.has(key);
  const isShadowed = effectiveShadowedKeys.has(key);
  const isConflict = effectiveConflictKeys.has(key);
  const scope      = getScopeById(item.scopeId);
  const scopeName  = scope?.name || item.scopeId;

  let why = "";

  switch (item.category) {
    case "skill":
      why = isGlobal
        ? "This skill is installed globally and is available in all projects."
        : "This skill is installed in this project's .claude/skills/ directory.";
      break;
    case "mcp":
      if (isShadowed)
        why = `A project-scoped MCP server with the same name takes precedence over this user-scoped one (rule: local > project > user).`;
      else if (isGlobal)
        why = "This user-scoped MCP server is active for this project. No project-scoped server with the same name was found.";
      else
        why = "This project-scoped MCP server takes precedence over any user-scoped server with the same name (rule: local > project > user).";
      break;
    case "command":
      if (isConflict)
        why = `A command with the same name exists at both user and project level. Claude Code does not guarantee which one applies — same-name conflicts are officially unsupported.`;
      else
        why = isGlobal
          ? "This user-level command is globally available."
          : "This command is defined for this project.";
      break;
    case "agent":
      if (isShadowed)
        why = "A project-level agent with the same name overrides this user-level one.";
      else if (isGlobal)
        why = "This user-level agent is available globally. No project-level agent with the same name was found.";
      else
        why = "This project-level agent is available in this project and overrides any user-level agent with the same name.";
      break;
    case "config":
      if (isAncestor)
        why = `This file is in a parent directory of the current project. Claude Code walks up the directory tree from the working directory and loads CLAUDE.md files it finds along the way.`;
      else if (item.name === "CLAUDE.md" || item.name === ".claude/CLAUDE.md")
        why = isGlobal
          ? "The global CLAUDE.md is loaded in every Claude Code session."
          : "This project CLAUDE.md is loaded when Claude Code runs in this project.";
      else if (item.name === "settings.local.json")
        why = "Overrides project-shared and user settings for this machine only (not committed to git).";
      else if (item.name === "settings.json")
        why = isGlobal
          ? "User-level settings, overridden by project settings.json and settings.local.json."
          : "Project-shared settings, overridden by settings.local.json if present.";
      else
        why = `From ${scopeName} scope.`;
      break;
    case "hook":
      why = isGlobal
        ? "This hook is configured globally in user settings."
        : "This hook is configured for this project in project settings files.";
      break;
    case "memory":
      if (isAncestor)
        why = `Stored in a parent project directory (${scopeName}). May be relevant to this project depending on how Claude Code was invoked.`;
      else
        why = isGlobal
          ? "This memory is stored globally and is accessible in all projects."
          : "This memory is stored in this project's memory directory.";
      break;
    case "setting": {
      const tierOrder = { managed: "highest", local: "high", project: "medium", user: "lowest" };
      const tierDesc = tierOrder[item.sourceTier] || item.sourceTier;
      why = `From ${item.sourceFile || "unknown"} (${item.sourceTier || "?"} tier — ${tierDesc} priority). Precedence order: managed > local > project > user.`;
      break;
    }
    default:
      why = getEffectiveRule(item.category) || "";
  }

  if (!why) { wrap.classList.add("hidden"); return; }
  wrap.classList.remove("hidden");
  text.textContent = why;
}

// ── Item Config (harness-specific fields for editable item metadata) ─────────

const CLAUDE_ITEM_CONFIG_FIELDS = {
  skill: [
    { key: "model", label: "Model", type: "select", options: ["", "opus", "sonnet", "haiku", "inherit"], labels: ["(not set) — uses default model", "opus", "sonnet", "haiku", "inherit"], tooltip: "When set, Claude Code uses this model instead of your session default when running this skill. Official SKILL.md frontmatter field." },
    { key: "when_to_use", label: "When to use", type: "text", placeholder: "(not set) — describe when AI should auto-trigger this skill", tooltip: "Claude Code may auto-invoke skills based on context. Setting this gives more specific guidance on when this skill should be triggered." },
  ],
  agent: [
    { key: "model", label: "Model", type: "select", options: ["", "opus", "sonnet", "haiku", "inherit"], labels: ["(not set) — uses default model", "opus", "sonnet", "haiku", "inherit"], tooltip: "When set, Claude Code uses this model instead of your session default when running this agent." },
    { key: "maxTurns", label: "Max turns", type: "number", placeholder: "(not set) — no limit", tooltip: "Maximum number of agentic turns before the agent stops. Prevents runaway agents from burning tokens indefinitely." },
  ],
  memory: [
    { key: "description", label: "Description", type: "text", placeholder: "(not set) — one-line summary for Claude to decide relevance", tooltip: "Claude Code uses this to decide whether this memory is relevant to the current conversation. A clear description improves recall accuracy." },
  ],
};

const CODEX_ITEM_CONFIG_FIELDS = {
  skill: [
    { key: "name", label: "Name", type: "text", placeholder: "(not set) — uses folder name", tooltip: "Codex skill frontmatter field used as the skill identifier." },
    { key: "description", label: "Description", type: "textarea", placeholder: "(not set) — describe when Codex should use this skill", tooltip: "Codex uses this description to decide when the skill is relevant." },
  ],
  profile: [
    { key: "model", label: "Model", source: "value", type: "text", readOnly: true, placeholder: "(inherits global model)", tooltip: "Codex profile model override from ~/.codex/config.toml." },
    { key: "sandbox_mode", label: "Sandbox", source: "value", type: "text", readOnly: true, placeholder: "(inherits global sandbox)", tooltip: "Codex profile sandbox mode from ~/.codex/config.toml." },
    { key: "approval_policy", label: "Approval", source: "value", type: "text", readOnly: true, placeholder: "(inherits global approval policy)", tooltip: "Codex profile approval policy from ~/.codex/config.toml." },
    { key: "model_reasoning_effort", label: "Reasoning effort", source: "value", type: "text", readOnly: true, placeholder: "(inherits global reasoning effort)", tooltip: "Codex profile reasoning effort from ~/.codex/config.toml." },
  ],
};

let _itemConfigTimers = {};
let _itemConfigRenderSeq = 0;

function getItemConfigFields(item) {
  if (!item) return null;
  const harnessId = getHarnessDescriptor().id;
  if (harnessId === "codex") return CODEX_ITEM_CONFIG_FIELDS[item.category] || null;
  if (harnessId === "claude") return CLAUDE_ITEM_CONFIG_FIELDS[item.category] || null;
  return null;
}

function getItemFilePath(item) {
  if (item.category === "skill") return item.openPath || `${item.path}/SKILL.md`;
  if (item.category === "agent") return `${item.path}`;
  if (item.category === "memory") return item.path;
  return null;
}

async function renderItemConfig(item) {
  const wrap = document.getElementById("detailItemConfig");
  if (!wrap) return;
  const renderSeq = ++_itemConfigRenderSeq;

  const fields = getItemConfigFields(item);
  if (!fields) { wrap.classList.add("hidden"); wrap.innerHTML = ""; return; }
  wrap.classList.add("hidden");
  wrap.innerHTML = "";

  const frontmatterFields = fields.filter(field => (field.source || "frontmatter") === "frontmatter");
  const filePath = frontmatterFields.length ? getItemFilePath(item) : null;
  if (frontmatterFields.length && !filePath) { wrap.classList.add("hidden"); return; }

  // Read file to get current frontmatter values
  let fm = {};
  if (frontmatterFields.length) {
    try {
      const res = await fetchJson(`/api/file-content?path=${encodeURIComponent(filePath)}`);
      if (renderSeq !== _itemConfigRenderSeq || !selectedItem || itemKey(item) !== itemKey(selectedItem)) return;
      if (!res.ok) { wrap.classList.add("hidden"); return; }
      fm = parseFrontmatter(res.content);
    } catch {
      if (renderSeq === _itemConfigRenderSeq) wrap.classList.add("hidden");
      return;
    }
  }

  // Build HTML
  let html = "";
  for (const field of fields) {
    const fieldSource = field.source || "frontmatter";
    const values = fieldSource === "value" ? (item.value || {}) : fm;
    const val = values[field.key] || "";
    const canEdit = fieldSource === "frontmatter" && !field.readOnly;
    const readonlyAttr = field.readOnly ? " readonly" : "";
    const editAttrs = canEdit ? ` data-fm-key="${esc(field.key)}" data-fm-path="${esc(filePath)}"` : "";
    const readonlyClass = field.readOnly ? " d-item-readonly" : "";
    html += `<div class="d-item-config-row">`;
    html += `<span class="d-info-label" data-tooltip="${esc(field.tooltip)}">${esc(field.label)}</span>`;

    if (field.type === "select") {
      html += `<select class="d-item-select${readonlyClass}"${editAttrs}${canEdit ? "" : " disabled"}>`;
      for (let i = 0; i < field.options.length; i++) {
        const val = field.options[i];
        const label = field.labels?.[i] || val;
        const sel = (fm[field.key] || "") === val ? " selected" : "";
        html += `<option value="${esc(val)}"${sel}>${esc(label)}</option>`;
      }
      html += `</select>`;
    } else if (field.type === "number") {
      html += `<input type="number" class="d-item-input d-item-number${readonlyClass}"${editAttrs} value="${esc(val)}" placeholder="${esc(field.placeholder || "")}" min="1"${readonlyAttr}>`;
    } else if (field.type === "textarea") {
      html += `<textarea class="d-item-input d-item-textarea${readonlyClass}"${editAttrs} placeholder="${esc(field.placeholder || "")}"${readonlyAttr}>${esc(val)}</textarea>`;
    } else {
      html += `<input type="text" class="d-item-input${readonlyClass}"${editAttrs} value="${esc(val)}" placeholder="${esc(field.placeholder || "")}"${readonlyAttr}>`;
    }
    html += `</div>`;
  }

  wrap.innerHTML = html;
  wrap.classList.remove("hidden");

  // Bind events
  wrap.querySelectorAll("select[data-fm-key]").forEach(sel => {
    sel.addEventListener("change", () => saveFrontmatterField(sel.dataset.fmPath, sel.dataset.fmKey, sel.value));
  });
  wrap.querySelectorAll("input[data-fm-key], textarea[data-fm-key]").forEach(inp => {
    inp.addEventListener("input", () => {
      const k = inp.dataset.fmKey;
      clearTimeout(_itemConfigTimers[k]);
      _itemConfigTimers[k] = setTimeout(() => saveFrontmatterField(inp.dataset.fmPath, inp.dataset.fmKey, inp.value), 600);
    });
  });
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    fm[key] = val;
  }
  return fm;
}

async function saveFrontmatterField(filePath, key, value) {
  try {
    const res = await fetchJson(`/api/file-content?path=${encodeURIComponent(filePath)}`);
    if (!res.ok) return;

    let content = res.content;
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (!fmMatch) {
      const newFm = value ? `---\n${key}: ${value}\n---\n` : "";
      content = newFm + content;
    } else {
      let fmBody = fmMatch[1];
      const lineRegex = new RegExp(`^${key}:.*$`, "m");

      if (value) {
        if (lineRegex.test(fmBody)) {
          fmBody = fmBody.replace(lineRegex, `${key}: ${value}`);
        } else {
          fmBody += `\n${key}: ${value}`;
        }
      } else {
        fmBody = fmBody.replace(lineRegex, "").replace(/\n{2,}/g, "\n").trim();
      }
      content = `---\n${fmBody}\n---` + content.slice(fmMatch[0].length);
    }

    await fetchJson("/api/save-frontmatter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath, content }),
    });
    toast(`Updated ${key} for ${selectedItem?.name || "item"}`);
  } catch (err) {
    toast(`Failed to save: ${err.message}`, true);
  }
}

function getHarnessDescriptor() {
  return data?.harness || availableHarnesses.find((harness) => harness.id === selectedHarnessId) || {
    id: selectedHarnessId || "harness",
    displayName: "Selected Harness",
    shortName: "Harness",
    executable: "harness",
  };
}

function getHarnessName() {
  const harness = getHarnessDescriptor();
  return harness.displayName || harness.shortName || harness.id || "Selected Harness";
}

function getHarnessShortName() {
  const harness = getHarnessDescriptor();
  return harness.shortName || harness.displayName || harness.id || "Harness";
}

function getHarnessExecutable() {
  return getHarnessDescriptor().executable || selectedHarnessId || "harness";
}

function isSessionTranscript(item) {
  return item?.category === "session" && item.path?.endsWith(".jsonl") && item.subType !== "session-index";
}

function canDistillSession(item) {
  return isSessionTranscript(item) && getHarnessDescriptor().id === "claude";
}

function getPromptTemplates() {
  return data?.adapterData?.prompts || data?.prompts || null;
}

function getPromptContext(item, extra = {}) {
  const scope = getScopeById(item.scopeId);
  const sessionId = item.sessionId || item.fileName?.replace(/\.jsonl$/, "") || "";
  const cdCmd = scope?.repoDir ? `cd ${scope.repoDir} && ` : "";
  return {
    category: item.category,
    cdCmd,
    executable: getHarnessExecutable(),
    fileName: item.fileName || "",
    harnessName: getHarnessName(),
    mcpCommand: item.mcpConfig?.command || "unknown",
    mcpConfigJson: JSON.stringify(item.mcpConfig || {}, null, 2),
    mcpPackageArg: (item.mcpConfig?.args || [])[1] || "",
    name: item.name,
    path: item.path || "",
    scopeId: item.scopeId,
    sessionId,
    subType: item.subType || item.category,
    ...extra,
  };
}

function renderPromptTemplate(template, context) {
  if (!template) return template;
  return String(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    return context[key] === undefined || context[key] === null ? "" : String(context[key]);
  });
}

function resolvePromptAction(action, prompts) {
  if (!action?.use) return action;
  const [group, key] = action.use.split(".");
  return prompts?.[group]?.[key] || null;
}

function shouldShowPromptAction(action, item) {
  if (!action) return false;
  if (!action.when) return true;
  if (action.when === "notDistilled") return !item.name?.startsWith("[distilled");
  if (action.when === "securitySeverityUnreachable") return getSecuritySeverity(item.name) === "unreachable";
  return true;
}

function renderCcActions(item) {
  const container = document.getElementById("detailCcActions");
  const btnRow = document.getElementById("ccBtnRow");
  const prompts = getPromptTemplates()?.actions;
  if (!prompts?.categories) {
    container.classList.add("hidden");
    return;
  }

  const rawActions = [];
  if (!item.locked && item.category !== "session" && prompts.common?.unlockedInfo) {
    rawActions.push(prompts.common.unlockedInfo);
  }
  rawActions.push(...(prompts.categories[item.category] || prompts.categories.default || []));

  const context = getPromptContext(item);
  const buttons = rawActions
    .map((action) => resolvePromptAction(action, prompts))
    .filter((action) => shouldShowPromptAction(action, item))
    .map((action) => ({
      ...action,
      ico: action.ico || action.icon || "📋",
      info: renderPromptTemplate(action.info, context),
      prompt: renderPromptTemplate(action.prompt, context),
    }))
    .filter((action) => action.info || action.prompt);

  if (buttons.length === 0) {
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");
  btnRow.innerHTML = buttons.map((btn) => {
    if (btn.info) {
      return `<div class="cc-info"><span class="cc-ico">${btn.ico}</span>${esc(btn.info)}</div>`;
    }
    const kind = btn.kind || btn.id || btn.label || "";
    return `<button type="button" class="cc-btn" data-kind="${esc(kind)}" data-prompt="${esc(btn.prompt)}"><span class="cc-ico">${btn.ico}</span>${esc(btn.label)}</button>`;
  }).join("");
}

function setupCcActions() {
  document.getElementById("detailCcActions").addEventListener("click", (event) => {
    const btn = event.target.closest(".cc-btn");
    if (!btn) return;
    const prompt = btn.dataset.prompt;
    navigator.clipboard.writeText(prompt).then(() => {
      const orig = btn.innerHTML;
      const isResume = btn.dataset.kind === "Resume Session" || prompt.includes(`${getHarnessExecutable()} --resume`);
      const msg = isResume ? "Copied! Paste in a new terminal" : `Copied! Paste to ${getHarnessName()}`;
      btn.innerHTML = `<span class="cc-ico">✅</span>${msg}`;
      setTimeout(() => { btn.innerHTML = orig; }, 2500);
    });
  });
}

function setupExport() {
  document.getElementById("exportBtn").addEventListener("click", () => openBackupModal());
}

// ── Backup Center Modal ───────────────────────────────────────────

function timeAgo(isoString) {
  if (!isoString) return null;
  const diff = Math.round((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  return `${Math.round(diff / 86400)} d ago`;
}

function renderBackupPills(counts) {
  const container = document.getElementById("bkpPills");
  if (!counts || Object.keys(counts).length === 0) {
    container.innerHTML = `<span class="bkp-pill-loading">No data</span>`;
    return;
  }
  container.innerHTML = getCategoryOrder()
    .filter(cat => (counts[cat] || 0) > 0)
    .map(cat => `
      <span class="bkp-pill bkp-pill-${cat}">
        <span class="bkp-pill-dot"></span>${cat}<b>${counts[cat]}</b>
      </span>`)
    .join("");
}

async function openBackupModal() {
  const modal = document.getElementById("backupModal");
  modal.classList.remove("hidden");

  // Populate from existing scan data immediately (no network needed)
  if (data?.items) {
    const counts = {};
    for (const item of data.items) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    renderBackupPills(counts);
    document.getElementById("bkpTotalBadge").textContent =
      `${data.items.length} items · ${data.scopes.length} scopes`;
  }

  // Fetch live backup status
  try {
    const status = await fetchJson("/api/backup/status");
    if (!status.ok) return;
    if (status.backupDir) lastBackupFolder = `${status.backupDir}/latest`;

    // Header: last run
    const ago = timeAgo(status.lastRun);
    document.getElementById("bkpLastRun").textContent =
      ago ? `Last backed up: ${ago}` : "Never backed up";

    // Pills + total (may have more detail from status)
    if (status.counts && Object.keys(status.counts).length > 0) {
      renderBackupPills(status.counts);
      document.getElementById("bkpTotalBadge").textContent =
        `${status.totalItems} items · ${status.scopeCount} scopes`;
    }

    // Git sync section
    const conn = document.getElementById("bkpConnIndicator");
    const label = document.getElementById("bkpConnLabel");
    if (status.hasRemote) {
      conn.dataset.status = "connected";
      label.textContent = "Connected";
    } else if (status.isGitRepo) {
      conn.dataset.status = "unknown";
      label.textContent = "No remote";
    } else {
      conn.dataset.status = "error";
      label.textContent = "Not set up";
    }

    const remoteEl = document.getElementById("bkpRemoteUrl");
    remoteEl.textContent = status.remoteUrl || "—";
    remoteEl.title = status.remoteUrl || "";

    document.getElementById("bkpCommitMsg").textContent = status.lastCommitMsg || "—";
    document.getElementById("bkpCommitTime").textContent =
      timeAgo(status.lastCommitDate) || "";

    // Schedule section
    const checkbox = document.getElementById("bkpSchedEnabled");
    const schedLabel = document.getElementById("bkpSchedEnabledLabel");
    const schedulerSupported = status.schedulerSupported !== false;
    checkbox.checked = schedulerSupported && status.schedulerInstalled;
    schedLabel.textContent = schedulerSupported
      ? (status.schedulerInstalled ? "Enabled" : "Not installed")
      : "Unavailable";
    document.getElementById("bkpSchedBody").classList.toggle("disabled", !schedulerSupported || !status.schedulerInstalled);
    document.getElementById("bkpSchedDesc").textContent =
      !schedulerSupported ? "Manual backups only" : status.schedulerInstalled ? `Every ${status.interval || 4} hours + on boot` : "Not running";
    document.getElementById("bkpSchedNext").textContent =
      !schedulerSupported ? "Use Back Up Now or Sync Now for this harness" : status.schedulerInstalled ? "Background scheduler active" : "";

    // Set interval selector to current value
    const sel = document.getElementById("bkpInterval");
    if (status.interval) sel.value = String(status.interval);
  } catch (e) {
    document.getElementById("bkpLastRun").textContent = "Could not load status";
  }
}

function closeBackupModal() {
  document.getElementById("backupModal").classList.add("hidden");
  // Reset any in-progress states
  document.getElementById("bkpSyncLog").classList.add("hidden");
  document.getElementById("bkpSyncLog").textContent = "";
  document.getElementById("bkpRemoteEdit").classList.add("hidden");
  document.getElementById("bkpSyncView").classList.remove("hidden");
  document.getElementById("bkpConfigRemote").classList.remove("hidden");
}

function setupBackupModal() {
  // Close button + overlay click
  document.getElementById("backupModalClose").addEventListener("click", closeBackupModal);
  document.getElementById("backupModal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("backupModal")) closeBackupModal();
  });

  // Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("backupModal").classList.contains("hidden")) {
      closeBackupModal();
    }
  });

  // ── Back Up Now ──
  document.getElementById("bkpRunNow").addEventListener("click", async () => {
    const btn = document.getElementById("bkpRunNow");
    btn.classList.add("loading");
    btn.textContent = "Backing up...";
    try {
      const res = await fetchJson("/api/backup/run", { method: "POST" });
      if (res.ok) {
        document.getElementById("bkpLastRun").textContent = "Last backed up: just now";
        if (res.counts) {
          renderBackupPills(res.counts);
          document.getElementById("bkpTotalBadge").textContent =
            `${res.totalItems} items · ${res.scopeCount} scopes`;
        }
        const conn = document.getElementById("bkpConnIndicator");
        if (res.gitResult?.pushed) {
          conn.dataset.status = "connected";
          document.getElementById("bkpConnLabel").textContent = "Connected";
          document.getElementById("bkpCommitMsg").textContent = res.gitResult.message || "—";
          document.getElementById("bkpCommitTime").textContent = "just now";
        }
        toast(`Backed up ${res.copied} items${res.errors > 0 ? ` (${res.errors} warnings)` : ""}`, false, null, true);
      } else {
        toast(res.error || "Backup failed", true);
      }
    } catch {
      toast("Backup failed", true);
    }
    btn.classList.remove("loading");
    btn.textContent = "Back Up Now";
  });

  // ── Sync Now (git commit + push only) ──
  document.getElementById("bkpSyncNow").addEventListener("click", async () => {
    const btn = document.getElementById("bkpSyncNow");
    const logEl = document.getElementById("bkpSyncLog");
    btn.classList.add("loading");
    btn.textContent = "Syncing...";
    logEl.classList.remove("hidden", "error");
    logEl.textContent = "Connecting...";
    try {
      const res = await fetchJson("/api/backup/sync", { method: "POST" });
      logEl.textContent = res.message || (res.ok ? "Done" : res.error);
      if (res.ok) {
        const conn = document.getElementById("bkpConnIndicator");
        conn.dataset.status = res.pushed ? "connected" : "unknown";
        document.getElementById("bkpConnLabel").textContent = res.pushed ? "Connected" : "No remote";
        if (res.message) {
          document.getElementById("bkpCommitMsg").textContent = res.message;
          document.getElementById("bkpCommitTime").textContent = "just now";
        }
      } else {
        logEl.classList.add("error");
        document.getElementById("bkpConnIndicator").dataset.status = "error";
        document.getElementById("bkpConnLabel").textContent = "Error";
      }
    } catch (e) {
      logEl.classList.add("error");
      logEl.textContent = `Sync failed: ${e.message}`;
    }
    btn.classList.remove("loading");
    btn.textContent = "Sync Now";
  });

  // ── Snapshot Export (old behavior: timestamped folder) ──
  document.getElementById("bkpSnapshotExport").addEventListener("click", async () => {
    const btn = document.getElementById("bkpSnapshotExport");
    btn.textContent = "Exporting...";
    btn.disabled = true;
    try {
      const res = await fetchJson("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exportDir: null }),
      });
      if (res.ok) {
        toast(`${res.copied} items exported to ${res.path}`, false, null, true);
      } else {
        toast(res.error || "Export failed", true);
      }
    } catch {
      toast("Export failed", true);
    }
    btn.textContent = "Snapshot Export";
    btn.disabled = false;
  });

  // ── Open Backup Folder ──
  document.getElementById("bkpOpenFolder").addEventListener("click", () => {
    toast(`Backup folder: ${lastBackupFolder}`, false, null, true);
  });

  // ── Configure Remote (inline edit) ──
  document.getElementById("bkpConfigRemote").addEventListener("click", () => {
    const current = document.getElementById("bkpRemoteUrl").textContent;
    document.getElementById("bkpRemoteInput").value = current === "—" ? "" : current;
    document.getElementById("bkpSyncView").classList.add("hidden");
    document.getElementById("bkpRemoteEdit").classList.remove("hidden");
    document.getElementById("bkpConfigRemote").classList.add("hidden");
    document.getElementById("bkpRemoteInput").focus();
  });

  document.getElementById("bkpRemoteCancel").addEventListener("click", () => {
    document.getElementById("bkpRemoteEdit").classList.add("hidden");
    document.getElementById("bkpSyncView").classList.remove("hidden");
    document.getElementById("bkpConfigRemote").classList.remove("hidden");
  });

  document.getElementById("bkpRemoteSave").addEventListener("click", async () => {
    const url = document.getElementById("bkpRemoteInput").value.trim();
    if (!url) return;
    const btn = document.getElementById("bkpRemoteSave");
    btn.textContent = "Saving...";
    btn.disabled = true;
    try {
      const res = await fetchJson("/api/backup/remote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        document.getElementById("bkpRemoteUrl").textContent = url;
        document.getElementById("bkpRemoteUrl").title = url;
        document.getElementById("bkpConnIndicator").dataset.status = "unknown";
        document.getElementById("bkpConnLabel").textContent = "Configured";
        document.getElementById("bkpRemoteEdit").classList.add("hidden");
        document.getElementById("bkpSyncView").classList.remove("hidden");
        document.getElementById("bkpConfigRemote").classList.remove("hidden");
        toast("Remote configured", false, null, true);
      } else {
        toast(res.error || "Failed to save remote", true);
      }
    } catch {
      toast("Failed to save remote", true);
    }
    btn.textContent = "Save";
    btn.disabled = false;
  });

  // ── Apply Interval ──
  document.getElementById("bkpApplyInterval").addEventListener("click", async () => {
    const intervalHours = parseInt(document.getElementById("bkpInterval").value);
    const btn = document.getElementById("bkpApplyInterval");
    btn.textContent = "Applying...";
    btn.disabled = true;
    try {
      const res = await fetchJson("/api/backup/scheduler/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalHours }),
      });
      if (res.ok) {
        document.getElementById("bkpSchedDesc").textContent = `Every ${intervalHours} hours + on boot`;
        toast(`Schedule updated: every ${intervalHours} hours`, false, null, true);
      } else {
        toast(res.error || "Failed to update schedule", true);
      }
    } catch {
      toast("Failed to update schedule", true);
    }
    btn.textContent = "Apply";
    btn.disabled = false;
  });
}

function setupContextBudget() {
  document.getElementById("ctxBudgetBtn").addEventListener("click", () => {
    if (!hasCapability("contextBudget")) return;
    if (!selectedScopeId) {
      toast("Select a scope first", true);
      return;
    }
    openContextBudget(selectedScopeId);
  });

  document.getElementById("ctxBudgetClose").addEventListener("click", closeContextBudget);

  document.getElementById("inheritToggleBtn")?.addEventListener("click", () => {
    if (!hasCapability("effective")) return;
    const scope = getScopeById(selectedScopeId);
    if (!scope || scope.id === "global") return;
    showEffective = !showEffective;
    computeEffectiveSets(selectedScopeId);
    document.getElementById("inheritToggleBtn").classList.toggle("active", showEffective);
    renderAll();
  });
}

function openContextBudget(scopeId) {
  if (!hasCapability("contextBudget")) return;
  // Hide item detail panel, show context budget panel
  document.getElementById("detailPanel").classList.add("hidden");
  const panel = document.getElementById("ctxBudgetPanel");
  panel.classList.remove("hidden");

  const scope = getScopeById(scopeId);
  document.getElementById("ctxBudgetTitle").textContent = `Context Budget — ${scope?.name || scopeId}`;
  document.getElementById("ctxBudgetBody").innerHTML = `<div class="ctx-budget-loading">Counting tokens…</div>`;
  document.getElementById("ctxBudgetBar").style.width = "0%";
  document.getElementById("ctxBudgetTotal").textContent = "—";

  fetchJson(`/api/context-budget?scope=${encodeURIComponent(scopeId)}&limit=${_ctxWindowLimit}`)
    .then(renderContextBudget)
    .catch(() => {
      document.getElementById("ctxBudgetBody").innerHTML = `<div class="ctx-budget-loading">Failed to load context budget</div>`;
    });
}

function closeContextBudget() {
  document.getElementById("ctxBudgetPanel").classList.add("hidden");
}

function isContextBudgetOpen() {
  return !document.getElementById("ctxBudgetPanel").classList.contains("hidden");
}

let _budgetData = null;
let _budgetSort = "scope"; // "scope" | "category" | "tokens"
let _budgetSortDir = "desc"; // "desc" (high→low) | "asc" (low→high)
let _ctxWindowLimit = 200000; // 200K default, user can toggle to 1M

function renderContextBudget(budget) {
  if (!budget.ok) {
    document.getElementById("ctxBudgetBody").innerHTML = `<div class="ctx-budget-loading">${esc(budget.error || "Error")}</div>`;
    return;
  }

  _budgetData = budget;

  const loaded = budget.alwaysLoaded?.total || 0;
  const deferred = budget.deferred?.total || 0;
  const limit = budget.contextLimit;

  // Progress bar — green only, shows always-loaded tokens
  const loadedPct = Math.min(Math.round((loaded / limit) * 1000) / 10, 100);
  const deferredPct = Math.min(Math.round((deferred / limit) * 1000) / 10, 100);
  const remainingPct = Math.max(0, Math.round((100 - loadedPct) * 10) / 10);

  const bar = document.getElementById("ctxBudgetBar");
  bar.style.width = `${loadedPct}%`;
  bar.className = `ctx-budget-bar ${loadedPct > 25 ? "ctx-bar-warn" : ""} ${loadedPct > 50 ? "ctx-bar-danger" : ""}`;

  // Hide deferred bar
  const barDeferred = document.getElementById("ctxBudgetBarDeferred");
  barDeferred.style.width = "0%";

  // Autocompact buffer eats into remaining space
  const acBuffer = budget.autocompactBuffer || 33000;
  const acPct = Math.round((acBuffer / limit) * 1000) / 10;
  const usablePct = Math.max(0, Math.round((100 - loadedPct - acPct) * 10) / 10);

  // Summary text
  document.getElementById("ctxBudgetTotal").innerHTML = `
    <b>${formatTokens(loaded)}</b> loaded
    <span class="ctx-pct">(${loadedPct}% of ${formatTokens(limit)})</span>
    <span class="ctx-badge ctx-badge-${budget.method}">${budget.method}</span>
    <div class="ctx-budget-detail-toggle" onclick="this.nextElementSibling.classList.toggle('hidden');this.querySelector('.ctx-toggle-arrow').textContent=this.nextElementSibling.classList.contains('hidden')?'▸':'▾'"><span class="ctx-toggle-arrow">▸</span> What does this mean?</div>
    <div class="ctx-budget-explain hidden">
      When you start a Claude Code session under this directory, <b>${formatTokens(loaded)}</b> (${loadedPct}%) is already loaded into context before you type anything — this includes your CLAUDE.md files, memory, skills, rules, and system overhead.
      <br><br>After the autocompact buffer (~${acPct}%, reserved by Claude Code for compaction), about <b>${usablePct}%</b> is left for your conversation. ${deferred > 0 ? `Within that space, up to <b>${deferredPct}%</b> (${formatTokens(deferred)}) could be consumed by deferred tools — Claude loads these selectively as needed, not all at once.` : ""}
      <br><br>The fuller the context, the less accurate Claude becomes — an effect known as <b>context rot</b>.
    </div>`;

  // Context window toggle handler — buttons are in HTML now, not injected
  document.querySelectorAll("#ctxWindowToggle .ctx-win-btn").forEach(btn => {
    // Update active state to match current limit
    btn.classList.toggle("active", parseInt(btn.dataset.limit) === limit);
    btn.addEventListener("click", () => {
      const newLimit = parseInt(btn.dataset.limit);
      _ctxWindowLimit = newLimit;
      openContextBudget(budget.scopeId);
    });
  });

  // Note
  const noteEl = document.getElementById("ctxBudgetNote");
  noteEl.textContent = budget.method === "measured"
    ? "Token counts measured with ~99.8% accuracy. System overhead estimated from known baselines."
    : "Token counts estimated (bytes/4). Install ai-tokenizer for higher accuracy.";

  renderBudgetBody();
}

function renderBudgetBody() {
  const budget = _budgetData;
  if (!budget) return;
  const body = document.getElementById("ctxBudgetBody");

  // Tag items with source + loaded/deferred status
  const loadedItems = [
    ...(budget.alwaysLoaded?.currentScope?.items || []).map(i => ({ ...i, _source: "current", _sourceLabel: budget.scopeName, _loaded: true })),
    ...(budget.alwaysLoaded?.inherited?.items || []).map(i => ({ ...i, _source: "inherited", _sourceLabel: i.scopeName || i.scopeId, _loaded: true })),
  ];
  const deferredItems = [
    ...(budget.deferred?.currentScope?.items || []).map(i => ({ ...i, _source: "current", _sourceLabel: budget.scopeName, _loaded: false })),
    ...(budget.deferred?.inherited?.items || []).map(i => ({ ...i, _source: "inherited", _sourceLabel: i.scopeName || i.scopeId, _loaded: false })),
  ];
  const allItems = [...loadedItems, ...deferredItems];

  // Sort controls
  const arrow = _budgetSortDir === "desc" ? "↓" : "↑";
  let html = `<div class="ctx-sort-bar">
    <span class="ctx-sort-label">Sort:</span>
    <button class="ctx-sort-btn ${_budgetSort === "scope" ? "active" : ""}" data-sort="scope">By Scope${_budgetSort === "scope" ? " " + arrow : ""}</button>
    <button class="ctx-sort-btn ${_budgetSort === "category" ? "active" : ""}" data-sort="category">By Category${_budgetSort === "category" ? " " + arrow : ""}</button>
    <button class="ctx-sort-btn ${_budgetSort === "tokens" ? "active" : ""}" data-sort="tokens">By Tokens${_budgetSort === "tokens" ? " " + arrow : ""}</button>
  </div>`;

  // Always Loaded section
  html += `<div class="ctx-loaded-header">Always Loaded <span class="ctx-loaded-total">${formatTokens(budget.alwaysLoaded?.total || 0)}</span></div>`;

  if (_budgetSort === "scope") {
    html += renderByScope(budget, loadedItems);
  } else if (_budgetSort === "category") {
    html += renderByCategory(loadedItems);
  } else {
    html += renderByTokens(loadedItems);
  }

  // System loaded — rough estimate, changes with each CC release
  const sysLoaded = budget.alwaysLoaded?.system || 0;
  const skillBp = budget.alwaysLoaded?.skillBoilerplate || 0;
  const sysLoadedTotal = sysLoaded + skillBp;
  html += `<div class="ctx-section">
    <div class="ctx-section-hdr">
      <span class="ctx-collapse-btn">▸</span>
      <span class="ctx-section-title">System (loaded)</span>
      <span class="ctx-section-total">~${formatTokens(sysLoadedTotal)}</span>
      <span class="ctx-badge ctx-badge-estimated">estimated</span>
    </div>
    <div class="ctx-section-items hidden">
      <div class="ctx-item"><span class="ctx-item-icon">🔧</span><span class="ctx-item-name">System prompt + tools</span><span class="ctx-item-tokens">~${formatTokens(sysLoaded)}</span></div>
      ${skillBp ? `<div class="ctx-item"><span class="ctx-item-icon">⚡</span><span class="ctx-item-name">Skill tool overhead</span><span class="ctx-item-tokens">~${formatTokens(skillBp)}</span></div>` : ""}
      <div class="ctx-item ctx-item-note"><span class="ctx-item-icon"></span><span class="ctx-item-name">Run /context in Claude Code for exact numbers</span></div>
    </div>
  </div>`;

  // Deferred section
  html += `<div class="ctx-deferred-header">Deferred (on-demand) <span class="ctx-deferred-total">${formatTokens(budget.deferred?.total || 0)}</span></div>`;

  if (deferredItems.length > 0) {
    if (_budgetSort === "scope") {
      html += renderByScope(budget, deferredItems);
    } else if (_budgetSort === "category") {
      html += renderByCategory(deferredItems);
    } else {
      html += renderByTokens(deferredItems);
    }
  }

  // System + MCP deferred
  html += `<div class="ctx-section">
    <div class="ctx-section-hdr">
      <span class="ctx-collapse-btn">▸</span>
      <span class="ctx-section-title">System + MCP tools (deferred)</span>
      <span class="ctx-section-total">${formatTokens((budget.deferred?.systemTools || 0) + (budget.deferred?.mcpToolSchemas || 0))}</span>
      <span class="ctx-badge ctx-badge-estimated">estimated</span>
    </div>
    <div class="ctx-section-items hidden">
      <div class="ctx-item"><span class="ctx-item-icon">🔧</span><span class="ctx-item-name">System tools (deferred)</span><span class="ctx-item-tokens">${formatTokens(budget.deferred?.systemTools || 0)}</span></div>
      <div class="ctx-item"><span class="ctx-item-icon">🔌</span><span class="ctx-item-name">MCP tool schemas (${budget.deferred?.mcpUniqueCount || 0} unique servers × ~3.1K avg)</span><span class="ctx-item-tokens">${formatTokens(budget.deferred?.mcpToolSchemas || 0)}</span></div>
    </div>
  </div>`;

  // Autocompact buffer — reserved by Claude Code for compaction
  const acBuffer = budget.autocompactBuffer || 0;
  if (acBuffer > 0) {
    const acPct = Math.round((acBuffer / budget.contextLimit) * 1000) / 10;
    html += `<div class="ctx-section ctx-autocompact">
      <div class="ctx-section-hdr">
        <span class="ctx-section-title">Autocompact buffer (reserved)</span>
        <span class="ctx-section-total">${formatTokens(acBuffer)} (${acPct}%)</span>
        <span class="ctx-badge ctx-badge-estimated">estimated</span>
      </div>
    </div>`;
  }

  body.innerHTML = html;

  // Bind sort buttons — click same button toggles asc/desc
  body.querySelectorAll(".ctx-sort-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (_budgetSort === btn.dataset.sort) {
        _budgetSortDir = _budgetSortDir === "desc" ? "asc" : "desc";
      } else {
        _budgetSort = btn.dataset.sort;
        _budgetSortDir = "desc";
      }
      renderBudgetBody();
    });
  });

  // Bind collapsible toggles
  body.querySelectorAll(".ctx-collapse-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.closest(".ctx-section, .ctx-cat-group");
      const items = target.querySelector(".ctx-section-items, .ctx-cat-items");
      if (!items) return;
      const hidden = items.classList.toggle("hidden");
      btn.textContent = hidden ? "▸" : "▾";
    });
  });
}

function renderByScope(budget, allItems) {
  let html = "";

  // Group by scope — current first, then inherited from nearest parent to farthest
  const groupOrder = []; // ordered list of scope IDs
  const groups = {};

  // Current scope first
  groupOrder.push(budget.scopeId);
  groups[budget.scopeId] = { label: `Current Scope`, items: [], total: budget.currentScope.total };

  for (const item of allItems) {
    if (item._source === "current") {
      groups[budget.scopeId].items.push(item);
    } else {
      const key = item.scopeId || "unknown";
      if (!groups[key]) {
        groupOrder.push(key);
        groups[key] = { label: `Inherited from ${item._sourceLabel}`, items: [], total: 0 };
      }
      groups[key].items.push(item);
      groups[key].total += item.tokens;
    }
  }

  // Reverse inherited scopes: API gives farthest→nearest, we want nearest→farthest
  // Keep current scope at index 0, reverse the rest
  const reordered = [groupOrder[0], ...groupOrder.slice(1).reverse()];

  for (const scopeId of reordered) {
    const group = groups[scopeId];
    html += `<div class="ctx-section">
      <div class="ctx-section-hdr">
        <span class="ctx-collapse-btn">▾</span>
        <span class="ctx-section-title">${esc(group.label)}</span>
        <span class="ctx-section-total">${formatTokens(group.total)}</span>
      </div>
      <div class="ctx-section-items">${renderItemsByCategory(group.items, false)}</div>
    </div>`;
  }
  return html;
}

function renderByCategory(allItems) {
  let html = "";
  const byCategory = {};
  for (const item of allItems) {
    const cat = item.category;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }

  for (const cat of getCategoryOrder()) {
    const catItems = byCategory[cat];
    if (!catItems) continue;
    const catInfo = getCategoryConfig(cat);
    const catTotal = catItems.reduce((sum, i) => sum + i.tokens, 0);

    html += `<div class="ctx-section">
      <div class="ctx-section-hdr">
        <span class="ctx-collapse-btn">▾</span>
        <span class="ctx-section-title">${catInfo.icon} ${esc(catInfo.label)}</span>
        <span class="ctx-section-total">${formatTokens(catTotal)}</span>
      </div>
      <div class="ctx-section-items">
        ${sortByTokens(catItems).map(item => renderBudgetItem(item, catInfo.icon, true)).join("")}
      </div>
    </div>`;
  }
  return html;
}

function sortByTokens(items) {
  const dir = _budgetSortDir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => dir * (a.tokens - b.tokens));
}

function renderByTokens(allItems) {
  const sorted = sortByTokens(allItems);
  let html = `<div class="ctx-section">
    <div class="ctx-section-hdr">
      <span class="ctx-section-title">All Items</span>
      <span class="ctx-section-total">${formatTokens(sorted.reduce((s, i) => s + i.tokens, 0))}</span>
    </div>
    <div class="ctx-section-items">
      ${sorted.map(item => {
        const catInfo = getCategoryConfig(item.category);
        return renderBudgetItem(item, catInfo.icon, true);
      }).join("")}
    </div>
  </div>`;
  return html;
}

function renderItemsByCategory(items, showSource) {
  const byCategory = {};
  for (const item of items) {
    const cat = item.category;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }

  let html = "";
  for (const cat of getCategoryOrder()) {
    const catItems = byCategory[cat];
    if (!catItems) continue;
    const catInfo = getCategoryConfig(cat);
    const catTotal = catItems.reduce((sum, i) => sum + i.tokens, 0);

    html += `<div class="ctx-cat-group">
      <div class="ctx-cat-hdr">
        <span class="ctx-collapse-btn">▸</span>
        ${catInfo.icon} ${esc(catInfo.label)}
        <span class="ctx-cat-total">${formatTokens(catTotal)}</span>
      </div>
      <div class="ctx-cat-items hidden">
        ${sortByTokens(catItems).map(item => renderBudgetItem(item, catInfo.icon, showSource)).join("")}
      </div>
    </div>`;
  }
  return html;
}

function renderBudgetItem(item, icon, showSource) {
  const sourceTag = showSource
    ? `<span class="ctx-item-source">${item._source === "current" ? "current" : esc(item._sourceLabel)}</span>`
    : "";
  return `<div class="ctx-item">
    <span class="ctx-item-icon">${icon}</span>
    <span class="ctx-item-name" title="${esc(item.path || "")}">${esc(item.name)}</span>
    ${sourceTag}
    <span class="ctx-item-tokens">${formatTokens(item.tokens)}</span>
  </div>`;
}

// Removed — system overhead now rendered inline in renderBudgetBody

function formatTokens(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K tok`;
  return `${n} tok`;
}

function renderBreadcrumb(scope) {
  if (!scope) return `<span class="crumb-pill">Unknown scope</span>`;
  const scopes = [...getScopeChain(scope), scope];
  return scopes.map((entry, index) => {
    const icon = getScopeIcon(entry.type);
    const sep = index === scopes.length - 1 ? "" : `<span class="crumb-sep">›</span>`;
    return `<span class="crumb-pill">${icon} ${esc(entry.name)}</span>${sep}`;
  }).join("");
}

function shouldShowItemBadge(item) {
  if (item.category === "memory") return true;
  if (item.subType && item.subType !== item.category) return true;
  return ["config", "hook", "plugin", "plan"].includes(item.category);
}

function renderBadge(item, detail = false) {
  const label = item.subType || item.category;
  const cls = BADGE_CLASS[label] || BADGE_CLASS[item.category] || "ib-session";
  const style = detail ? ' style="font-size:0.68rem"' : "";
  return `<span class="item-badge ${cls}"${style}>${esc(label)}</span>`;
}

function initSortable() {
  // Drag-and-drop disabled — use Move button instead.
  // Keeping the function stub so callers don't break.
  return;
  if (!window.Sortable) return;

  const scrollEl = document.getElementById("mainContent");

  document.querySelectorAll(".sortable-zone").forEach((el) => {
    const group = el.dataset.group;
    if (!group || group === "none") return;

    Sortable.create(el, {
      group,
      animation: 150,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      draggable: ".item:not(.locked)",
      filter: ".act-btn, .item-chk",
      preventOnFilter: false,
      fallbackOnBody: true,
      scroll: scrollEl,
      scrollSensitivity: 100,
      scrollSpeed: 15,
      bubbleScroll: true,
      onStart(evt) {
        draggingItem = getItemByKey(evt.item.dataset.itemKey);
        document.getElementById("sidebar").classList.add("drag-active");
        // Show only scope tree (hide category sub-items) during drag
        uiState._dragCollapsed = true;
        renderSidebar();
      },
      onEnd(evt) {
        draggingItem = null;
        clearScopeHighlights();
        document.getElementById("sidebar").classList.remove("drag-active");
        // Restore full sidebar after drag
        uiState._dragCollapsed = false;
        renderSidebar();

        if (evt.from === evt.to) return;

        const itemEl = evt.item;
        const item = getItemByKey(itemEl.dataset.itemKey);
        if (!item) {
          renderMainContent();
          initSortable();
          return;
        }

        const oldParent = evt.from;
        const oldIndex = evt.oldIndex ?? 0;
        const revertFn = () => {
          const children = oldParent.children;
          if (oldIndex >= children.length) oldParent.appendChild(itemEl);
          else oldParent.insertBefore(itemEl, children[oldIndex]);
        };

        const fromScopeId = evt.from.dataset.scope;
        const toScopeId = evt.to.dataset.scope;

        if (!fromScopeId || !toScopeId || fromScopeId === toScopeId) {
          revertFn();
          return;
        }

        pendingDrag = { item, fromScopeId, toScopeId, revertFn };
        showDragConfirm(item, getScopeById(fromScopeId), getScopeById(toScopeId));
      },
    });
  });
}

function getMovePrompt(item, toScopeId, includeSource = false) {
  const moveTemplates = getPromptTemplates()?.move || {};
  const template = includeSource ? moveTemplates.withSourceScope : moveTemplates.withoutSourceScope;
  const fromScope = getScopeById(item.scopeId);
  const toScope = getScopeById(toScopeId);
  const fallback = includeSource
    ? `I want to move this {{harnessName}} {{category}} to a different scope.

Item: "{{name}}"
Current path: {{path}}
From scope: {{fromScopeName}}
Move to scope: {{toScopeName}}

Before moving, explain what will change and only move after I confirm.`
    : `I want to move this {{harnessName}} {{category}} to a different scope.

Item: "{{name}}"
Current path: {{path}}
Move to scope: {{destName}}

Before moving, explain what will change and only move after I confirm.`;

  return renderPromptTemplate(template || fallback, getPromptContext(item, {
    destName: toScope?.name || toScopeId,
    fromScopeName: fromScope?.name || item.scopeId,
    toScopeName: toScope?.name || toScopeId,
  }));
}

function copyMovePrompt(item, toScopeId, includeSource = false) {
  const prompt = getMovePrompt(item, toScopeId, includeSource);
  navigator.clipboard.writeText(prompt).then(() => {
    toast(`Move prompt copied! Paste to ${getHarnessName()} in your terminal.`);
  });
}

function setupScopeDropZones() {
  // Drag-and-drop disabled — use Move button instead.
  return;
  document.addEventListener("dragover", (event) => {
    if (!draggingItem) return;

    const scopeBlock = event.target.closest(".scope-block");
    clearScopeHighlights();

    if (!scopeBlock) return;

    const scopeId = scopeBlock.dataset.scopeId;
    if (!scopeId || scopeId === draggingItem.scopeId) return;

    event.preventDefault();
    scopeBlock.classList.add("drop-target");
  }, true);

  document.addEventListener("drop", (event) => {
    if (!draggingItem) return;

    const scopeBlock = event.target.closest(".scope-block");
    clearScopeHighlights();

    if (!scopeBlock) return;
    if (event.target.closest(".sortable-zone")) return;

    const scopeId = scopeBlock.dataset.scopeId;
    if (!scopeId || scopeId === draggingItem.scopeId) return;

    event.preventDefault();
    event.stopPropagation();

    const item = draggingItem;

    if (item.locked) {
      // Locked item — generate harness prompt
      copyMovePrompt(item, scopeId, true);
      draggingItem = null;
      return;
    }

    pendingDrag = {
      item,
      fromScopeId: item.scopeId,
      toScopeId: scopeId,
      revertFn: () => {},
    };

    showDragConfirm(item, getScopeById(item.scopeId), getScopeById(scopeId));
    draggingItem = null;
  }, true);

  document.addEventListener("dragend", () => {
    draggingItem = null;
    clearScopeHighlights();
    document.getElementById("sidebar").classList.remove("drag-active");
    if (uiState._dragCollapsed) {
      uiState._dragCollapsed = false;
      renderSidebar();
    }
  }, true);
}

function clearScopeHighlights() {
  document.querySelectorAll(".scope-block.drop-target").forEach((el) => {
    el.classList.remove("drop-target");
  });
}

function showDetail(item) {
  const next = getItemByKey(itemKey(item)) || item;
  const shouldLoadPreview = itemKey(next) !== detailPreviewKey;
  selectedItem = next;
  closeContextBudget();
  document.getElementById("detailPanel").classList.remove("hidden");
  renderDetailPanel(shouldLoadPreview);
  updateSelectedItemHighlight();
  if (shouldLoadPreview) {
    loadPreview(next);
  }
}

function updateSelectedItemHighlight() {
  const selectedKey = selectedItem ? itemKey(selectedItem) : null;
  document.querySelectorAll(".item.selected").forEach((row) => {
    row.classList.remove("selected");
  });
  if (!selectedKey) return;
  const row = document.querySelector(`.item[data-item-key="${cssEscape(selectedKey)}"]`);
  row?.classList.add("selected");
}

async function loadPreview(item) {
  const preview = document.getElementById("previewContent");
  const currentKey = itemKey(item);

  try {
    if (item.category === "setting") {
      if (currentKey !== detailPreviewKey) return;
      preview.textContent = "";
      preview.innerHTML = renderHighlightedSource(JSON.stringify(item.value, null, 2), "json");
      return;
    }

    if (item.category === "mcp") {
      if (currentKey !== detailPreviewKey) return;
      preview.textContent = "";
      preview.innerHTML = renderHighlightedSource(JSON.stringify(item.mcpConfig || {}, null, 2), "json");
      return;
    }

    if (item.category === "hook") {
      const res = await fetchJson(`/api/file-content?path=${encodeURIComponent(item.path)}`);
      if (currentKey !== detailPreviewKey) return;
      if (res.ok) {
        const settings = JSON.parse(res.content);
        const hookConfig = settings.hooks?.[item.name];
        if (hookConfig) {
          preview.textContent = "";
          preview.innerHTML = renderHighlightedSource(JSON.stringify(hookConfig, null, 2), "json");
        } else {
          preview.textContent = item.description || "(no content)";
        }
      } else {
        preview.textContent = item.description || "(no content)";
      }
      return;
    }

    if (item.category === "plugin") {
      if (currentKey !== detailPreviewKey) return;
      preview.textContent = `Plugin directory: ${item.path}`;
      return;
    }

    if (isSessionTranscript(item)) {
      const res = await fetchJson(`/api/session-preview?path=${encodeURIComponent(item.path)}`);
      if (currentKey !== detailPreviewKey) return;
      if (!res.ok) { preview.textContent = "Cannot load session preview"; return; }
      preview.textContent = "";
      preview.innerHTML = renderSessionChat(res);
      requestAnimationFrame(() => {
        preview.scrollTop = preview.scrollHeight;
      });
      return;
    }

    let filePath = item.path;
    if (item.category === "skill") filePath = `${item.path}/SKILL.md`;

    const res = await fetchJson(`/api/file-content?path=${encodeURIComponent(filePath)}`);
    if (currentKey !== detailPreviewKey) return;
    if (!res.ok) { preview.textContent = res.error || "Cannot load preview"; return; }

    const sourceLanguage = getSourceLanguage(filePath, item);
    if (sourceLanguage) {
      preview.textContent = "";
      preview.innerHTML = renderHighlightedSource(res.content, sourceLanguage);
    } else if (filePath.endsWith(".md")) {
      preview.textContent = "";
      preview.innerHTML = `<div class="md-preview">${renderMarkdown(res.content)}</div>`;
    } else {
      preview.textContent = res.content;
    }
  } catch {
    if (currentKey !== detailPreviewKey) return;
    preview.textContent = "Failed to load preview";
  }
}

function closeDetail() {
  selectedItem = null;
  detailPreviewKey = null;
  document.getElementById("detailPanel").classList.add("hidden");
  renderDetailPanel();
  updateSelectedItemHighlight();
}

function showDragConfirm(item, fromScope, toScope) {
  const fromIcon = getScopeIcon(fromScope?.type);
  const toIcon = getScopeIcon(toScope?.type);

  document.getElementById("dcPreview").innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <span style="font-size:1.1rem;">${getCategoryConfig(item.category).icon || "📄"}</span>
      <div>
        <div style="font-weight:900;color:var(--text-primary);font-size:0.9rem;">${esc(item.name)}</div>
        <div style="display:flex;gap:6px;align-items:center;margin-top:4px;">
          ${renderBadge(item)}
          <span style="font-size:0.72rem;color:var(--text-muted);">${esc(item.category)}</span>
        </div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;padding-top:10px;border-top:1px solid var(--border-light);">
      <div style="flex:1;text-align:center;">
        <div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">From</div>
        <div style="font-size:0.82rem;font-weight:700;color:var(--danger);">${fromIcon} ${esc(fromScope?.name || "?")}</div>
        <div style="font-size:0.62rem;color:var(--text-faint);">${esc(fromScope?.type || "")}</div>
      </div>
      <div style="font-size:1.2rem;color:var(--text-faint);">→</div>
      <div style="flex:1;text-align:center;">
        <div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">To</div>
        <div style="font-size:0.82rem;font-weight:700;color:var(--accent);">${toIcon} ${esc(toScope?.name || "?")}</div>
        <div style="font-size:0.62rem;color:var(--text-faint);">${esc(toScope?.type || "")}</div>
      </div>
    </div>`;

  // Add move warning if applicable (same logic as move modal)
  const warning = getMoveWarning(item);
  const previewEl = document.getElementById("dcPreview");
  if (warning && previewEl) {
    previewEl.innerHTML += `<div class="move-warning" style="margin-top:10px;">${esc(warning)}</div>`;
  }

  document.getElementById("dragConfirmModal").classList.remove("hidden");
}

function openDeleteModal(item) {
  pendingDelete = item;
  const scope = getScopeById(item.scopeId);

  document.getElementById("deletePreview").innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <span style="font-size:1.1rem;">${getCategoryConfig(item.category).icon || "📄"}</span>
      <div>
        <div style="font-weight:900;color:var(--text-primary);font-size:0.9rem;">${esc(item.name)}</div>
        <div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">${esc(scope?.name || item.scopeId)} · ${esc(item.category)}</div>
      </div>
    </div>
    <div style="font-size:0.68rem;color:var(--danger);margin-top:8px;padding-top:8px;border-top:1px solid var(--border-light);">
      ${item.category === "skill" ? "This will delete the entire skill folder and all its files." : "This will permanently delete the item from disk."}
    </div>`;

  document.getElementById("deleteModal").classList.remove("hidden");
}

function setupModals() {
  document.getElementById("dcCancel").addEventListener("click", () => {
    document.getElementById("dragConfirmModal").classList.add("hidden");
    if (pendingDrag?.revertFn) pendingDrag.revertFn();
    pendingDrag = null;
  });

  document.getElementById("dcConfirm").addEventListener("click", async () => {
    document.getElementById("dragConfirmModal").classList.add("hidden");
    if (!pendingDrag) return;
    const result = await doMove(pendingDrag.item, pendingDrag.toScopeId);
    if (!result.ok && pendingDrag.revertFn) pendingDrag.revertFn();
    pendingDrag = null;
  });

  document.getElementById("moveCancel").addEventListener("click", closeMoveModal);
  document.getElementById("moveModal").addEventListener("click", (event) => {
    if (event.target === document.getElementById("moveModal")) closeMoveModal();
  });

  document.getElementById("dragConfirmModal").addEventListener("click", (event) => {
    if (event.target !== document.getElementById("dragConfirmModal")) return;
    document.getElementById("dragConfirmModal").classList.add("hidden");
    if (pendingDrag?.revertFn) pendingDrag.revertFn();
    pendingDrag = null;
  });

  document.getElementById("deleteCancel").addEventListener("click", () => {
    document.getElementById("deleteModal").classList.add("hidden");
    pendingDelete = null;
  });

  document.getElementById("deleteConfirm").addEventListener("click", async () => {
    document.getElementById("deleteModal").classList.add("hidden");
    if (pendingDelete) {
      await doDelete(pendingDelete);
      pendingDelete = null;
    }
  });

  document.getElementById("deleteModal").addEventListener("click", (event) => {
    if (event.target !== document.getElementById("deleteModal")) return;
    document.getElementById("deleteModal").classList.add("hidden");
    pendingDelete = null;
  });
}

function getMoveWarning(item) {
  const cat = item.category;
  if (cat === "mcp") {
    const allMcp = (data?.items || []).filter(i => i.category === "mcp" && i.name === item.name && i.scopeId !== item.scopeId);
    if (allMcp.length > 0) return `⚠ An MCP server named "${item.name}" exists in another scope. The narrower scope will take precedence (local > project > user).`;
    return "Moving changes which scope this server loads from. Narrower scopes (project) override broader ones (user).";
  }
  if (cat === "command") {
    const allCmd = (data?.items || []).filter(i => i.category === "command" && i.name === item.name && i.scopeId !== item.scopeId);
    if (allCmd.length > 0) return `⚠ A command named "${item.name}" exists in another scope. Same-name conflicts are not reliably supported by Claude Code.`;
    return null;
  }
  if (cat === "agent") {
    const allAgent = (data?.items || []).filter(i => i.category === "agent" && i.name === item.name && i.scopeId !== item.scopeId);
    if (allAgent.length > 0) return `⚠ An agent named "${item.name}" exists in another scope. Project-level agents override same-name user agents.`;
    return null;
  }
  return null;
}

async function openMoveModal(item) {
  const res = await fetchJson(`/api/destinations?path=${encodeURIComponent(item.path)}&category=${encodeURIComponent(item.category)}&name=${encodeURIComponent(item.name)}`);
  if (!res.ok) {
    toast(res.error, true);
    return;
  }

  const listEl = document.getElementById("moveDestList");
  const ordered = buildOrderedScopeEntries(res.destinations, res.currentScopeId);
  let selectedDest = null;

  listEl.innerHTML = ordered.map(renderDestinationRow).join("");

  listEl.querySelectorAll(".dest").forEach((entry) => {
    if (entry.classList.contains("cur")) return;
    entry.addEventListener("click", () => {
      listEl.querySelectorAll(".dest").forEach((node) => node.classList.remove("sel"));
      entry.classList.add("sel");
      selectedDest = entry.dataset.scopeId;
      document.getElementById("moveConfirm").disabled = false;
    });
  });

  document.getElementById("moveConfirm").disabled = true;
  document.getElementById("moveConfirm").onclick = async () => {
    if (!selectedDest) return;
    closeMoveModal();
    if (item.locked) {
      // Locked item — generate harness prompt instead of API call
      copyMovePrompt(item, selectedDest);
    } else {
      await doMove(item, selectedDest);
    }
  };

  // Show move warning if applicable
  const warningEl = document.getElementById("moveWarning");
  const warning = getMoveWarning(item);
  if (warning && warningEl) {
    warningEl.textContent = warning;
    warningEl.classList.remove("hidden");
  } else if (warningEl) {
    warningEl.classList.add("hidden");
  }

  document.getElementById("moveModal").classList.remove("hidden");
}

async function openBulkMoveModal(items) {
  const first = items[0];
  const res = await fetchJson(`/api/destinations?path=${encodeURIComponent(first.path)}&category=${encodeURIComponent(first.category)}&name=${encodeURIComponent(first.name)}`);
  if (!res.ok) {
    toast(res.error, true);
    return;
  }

  const listEl = document.getElementById("moveDestList");
  const ordered = buildOrderedScopeEntries(res.destinations, res.currentScopeId);
  let selectedDest = null;

  listEl.innerHTML = ordered.map(renderDestinationRow).join("");

  listEl.querySelectorAll(".dest").forEach((entry) => {
    if (entry.classList.contains("cur")) return;
    entry.addEventListener("click", () => {
      listEl.querySelectorAll(".dest").forEach((node) => node.classList.remove("sel"));
      entry.classList.add("sel");
      selectedDest = entry.dataset.scopeId;
      document.getElementById("moveConfirm").disabled = false;
    });
  });

  document.getElementById("moveConfirm").disabled = true;
  document.getElementById("moveConfirm").onclick = async () => {
    if (!selectedDest) return;
    closeMoveModal();

    let ok = 0;
    let fail = 0;
    for (const item of items) {
      const result = await doMove(item, selectedDest, true);
      if (result.ok) ok++;
      else fail++;
    }

    bulkSelected.clear();
    await refreshUI();
    toast(`Moved ${ok} item(s)${fail ? `, ${fail} failed` : ""}`);
  };

  document.getElementById("moveModal").classList.remove("hidden");
}

function buildOrderedScopeEntries(destinations, currentScopeId) {
  const currentScope = getScopeById(currentScopeId);
  const allScopes = currentScope
    ? [...destinations, { ...currentScope, isCurrent: true }]
    : [...destinations];

  const scopeMap = {};
  for (const scope of data.scopes) scopeMap[scope.id] = scope;
  for (const scope of allScopes) scopeMap[scope.id] = scope;

  const getDepth = (scope) => {
    let depth = 0;
    let current = scope;
    while (current.parentId) {
      depth++;
      current = scopeMap[current.parentId] || { parentId: null };
    }
    return depth;
  };

  allScopes.sort((a, b) => {
    const da = getDepth(a);
    const db = getDepth(b);
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  });

  const ordered = [];
  function addWithChildren(parentId) {
    for (const scope of allScopes) {
      if ((scope.parentId || null) === parentId) {
        ordered.push({ ...scope, depth: getDepth(scope) });
        addWithChildren(scope.id);
      }
    }
  }

  addWithChildren(null);
  return ordered;
}

function renderDestinationRow(scope) {
  const indent = scope.depth > 0 ? ` style="padding-left:${scope.depth * 28}px"` : "";
  const icon = scope.id === "global" ? (getScopeTypeConfig(scope.type)?.icon || "🌐") : getScopeIcon(scope.type);
  const currentLabel = scope.isCurrent
    ? ' <span style="font-size:0.6rem;color:var(--text-faint);margin-left:4px;">(current)</span>'
    : "";

  return `
    <div class="dest${scope.isCurrent ? " cur" : ""}" data-scope-id="${esc(scope.id)}"${indent}>
      <span class="di">${icon}</span>
      <span class="dn">${esc(scope.name)}${currentLabel}</span>
      <span class="dp">${esc(scope.type)}</span>
    </div>`;
}

function closeMoveModal() {
  document.getElementById("moveModal").classList.add("hidden");
}

async function refreshUI() {
  const selectedScopeBefore = selectedScopeId;
  const selectedItemBefore = selectedItem ? itemKey(selectedItem) : null;

  data = await fetchJson("/api/scan");

  selectedScopeId = data.scopes.some((scope) => scope.id === selectedScopeBefore)
    ? selectedScopeBefore
    : getInitialSelectedScopeId();

  if (selectedItemBefore) {
    const nextItem = getItemByKey(selectedItemBefore);
    if (nextItem) {
      selectedItem = nextItem;
      selectedScopeId = nextItem.scopeId;
    } else {
      selectedItem = null;
      detailPreviewKey = null;
    }
  }

  bulkSelected = new Set([...bulkSelected].filter((key) => Boolean(getItemByKey(key))));
  initializeScopeState();
  renderAll();
}

async function doMove(itemRef, toScopeId, skipRefresh = false) {
  const item = resolveItem(itemRef);
  if (!item) return { ok: false, error: "Item not found" };

  const fromScopeId = item.scopeId;
  const response = await fetch(apiUrl("/api/move"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      itemPath: item.path,
      toScopeId,
      category: item.category,
      name: item.name,
    }),
  });
  const result = await response.json();

  if (skipRefresh) return result;

  if (result.ok) {
    const movedKey = `${item.category}::${item.name}::${result.to}`;
    if (selectedItem && itemKey(selectedItem) === itemKey(item)) {
      selectedItem = { ...item, path: result.to, scopeId: toScopeId };
      selectedScopeId = toScopeId;
      detailPreviewKey = null;
    }

    const undoFn = async () => {
      const undoResult = await fetch(apiUrl("/api/move"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemPath: result.to,
          toScopeId: fromScopeId,
          category: item.category,
          name: item.name,
        }),
      }).then((res) => res.json());

      if (undoResult.ok) {
        if (selectedItem && itemKey(selectedItem) === movedKey) {
          selectedItem = { ...item };
          selectedScopeId = fromScopeId;
          detailPreviewKey = null;
        }
        toast("Move undone");
        await refreshUI();
      } else {
        toast(undoResult.error, true);
      }
    };

    toast(result.message, false, undoFn);
    await refreshUI();
  } else {
    toast(result.error, true);
  }

  return result;
}

async function doDelete(itemRef, skipRefresh = false) {
  const item = resolveItem(itemRef);
  if (!item) return { ok: false, error: "Item not found" };

  let backupContent = null;
  let mcpBackup = null;

  try {
    if (item.category === "mcp") {
      mcpBackup = { name: item.name, config: item.mcpConfig, mcpJsonPath: item.path };
    } else {
      let readPath = item.path;
      if (item.category === "skill") readPath = `${item.path}/SKILL.md`;
      const backup = await fetchJson(`/api/file-content?path=${encodeURIComponent(readPath)}`);
      if (backup.ok) backupContent = backup.content;
    }
  } catch {
    // best effort backup only
  }

  const response = await fetch(apiUrl("/api/delete"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      itemPath: item.path,
      category: item.category,
      name: item.name,
    }),
  });
  const result = await response.json();

  if (skipRefresh) return result;

  if (result.ok) {
    if (selectedItem && itemKey(selectedItem) === itemKey(item)) {
      selectedItem = null;
      detailPreviewKey = null;
    }

    let undoFn = null;
    if (mcpBackup) {
      undoFn = async () => {
        const restoreResult = await fetch(apiUrl("/api/restore-mcp"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mcpBackup),
        }).then((res) => res.json());

        if (restoreResult.ok) {
          toast("Delete undone");
          await refreshUI();
        } else {
          toast(restoreResult.error, true);
        }
      };
    } else if (backupContent) {
      undoFn = async () => {
        const restoreResult = await fetch(apiUrl("/api/restore"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filePath: item.path,
            content: backupContent,
            isDir: item.category === "skill",
          }),
        }).then((res) => res.json());

        if (restoreResult.ok) {
          toast("Delete undone");
          await refreshUI();
        } else {
          toast(restoreResult.error, true);
        }
      };
    }

    toast(result.message, false, undoFn);
    await refreshUI();
  } else {
    toast(result.error, true);
  }

  return result;
}

function updateBulkBar() {
  const bar = document.getElementById("bulkBar");
  const count = bulkSelected.size;
  bar.classList.toggle("hidden", count === 0);
  document.getElementById("bulkCount").textContent = `${count} selected`;
}

function toast(msg, isError = false, undoFn = null, persistent = false) {
  const el = document.getElementById("toast");
  const msgEl = document.getElementById("toastMsg");
  if (toastTimer) clearTimeout(toastTimer);

  if (undoFn) {
    msgEl.innerHTML = `${esc(msg)} <button class="toast-undo" id="toastUndo">Undo</button>`;
    el.className = "toast";
    document.getElementById("toastUndo").onclick = async () => {
      el.classList.add("hidden");
      await undoFn();
    };
    toastTimer = setTimeout(() => el.classList.add("hidden"), 8000);
  } else if (persistent) {
    msgEl.innerHTML = `${esc(msg)} <button class="toast-close" id="toastClose">✕</button>`;
    el.className = isError ? "toast error" : "toast";
    document.getElementById("toastClose").onclick = () => el.classList.add("hidden");
  } else {
    msgEl.textContent = msg;
    el.className = isError ? "toast error" : "toast";
    toastTimer = setTimeout(() => el.classList.add("hidden"), 4000);
  }
}

function normalizeState() {
  if (!data) return;

  if (!data.scopes.some((scope) => scope.id === selectedScopeId)) {
    selectedScopeId = getInitialSelectedScopeId();
  }

  const visibleScopeId = getFirstVisibleScopeId();
  if (visibleScopeId && !scopeVisibleInSidebar(getScopeById(selectedScopeId))) {
    selectedScopeId = visibleScopeId;
  }

  expandScopePath(selectedScopeId);

  if (selectedItem) {
    const nextItem = getItemByKey(itemKey(selectedItem));
    if (!nextItem || nextItem.scopeId !== selectedScopeId || !itemVisibleInMain(nextItem)) {
      selectedItem = null;
      detailPreviewKey = null;
    } else {
      selectedItem = nextItem;
    }
  }

  bulkSelected = new Set([...bulkSelected].filter((key) => Boolean(getItemByKey(key))));
}

function initializeScopeState() {
  const scopeIds = new Set(data.scopes.map((scope) => scope.id));
  uiState.expandedScopes = new Set([...uiState.expandedScopes].filter((id) => scopeIds.has(id)));

  getRootScopes().forEach((scope) => uiState.expandedScopes.add(scope.id));
  expandScopePath(selectedScopeId);
}

function expandScopePath(scopeId) {
  let current = getScopeById(scopeId);
  while (current) {
    uiState.expandedScopes.add(current.id);
    current = current.parentId ? getScopeById(current.parentId) : null;
  }
}

function getInitialSelectedScopeId() {
  const scopesWithItems = data.scopes
    .filter((scope) => getItemsForScope(scope.id).length > 0)
    .sort((a, b) => {
      const depthDiff = getScopeDepth(b) - getScopeDepth(a);
      if (depthDiff !== 0) return depthDiff;
      return a.name.localeCompare(b.name);
    });

  if (scopesWithItems[0]) return scopesWithItems[0].id;
  return data.scopes[0]?.id || "global";
}

function getRootScopes() {
  return data.scopes.filter((scope) => scope.parentId === null);
}

function getScopeById(scopeId) {
  return data?.scopes.find((scope) => scope.id === scopeId) || null;
}

function getItemsForScope(scopeId) {
  return data.items.filter((item) => item.scopeId === scopeId);
}

function getChildScopes(scopeId) {
  return data.scopes.filter((scope) => scope.parentId === scopeId);
}

function getScopeDepth(scope) {
  let depth = 0;
  let current = scope;
  while (current?.parentId) {
    depth++;
    current = getScopeById(current.parentId);
  }
  return depth;
}

function getScopeChain(scope) {
  const chain = [];
  let current = scope;
  while (current?.parentId) {
    const parent = getScopeById(current.parentId);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

function getRecursiveScopeCount(scopeId) {
  let count = getItemsForScope(scopeId).length;
  for (const child of getChildScopes(scopeId)) {
    count += getRecursiveScopeCount(child.id);
  }
  return count;
}

function getSidebarCategoryCounts(scopeId) {
  const counts = new Map();
  for (const category of getCategoryOrder()) counts.set(category, 0);

  for (const item of getItemsForScope(scopeId)) {
    if (searchQuery && !itemMatchesSearch(item)) continue;
    counts.set(item.category, (counts.get(item.category) || 0) + 1);
  }

  return getCategoryOrder()
    .map((category) => ({ category, count: counts.get(category) || 0 }))
    .filter((entry) => entry.count > 0);
}

function scopeVisibleInSidebar(scope) {
  if (!scope) return false;
  if (!searchQuery) return true;
  if (scope.name.toLowerCase().includes(searchQuery)) return true;
  if (getItemsForScope(scope.id).some((item) => itemMatchesSearch(item))) return true;
  return getChildScopes(scope.id).some((child) => scopeVisibleInSidebar(child));
}

function getFirstVisibleScopeId() {
  for (const root of getRootScopes()) {
    const found = findVisibleScopeInTree(root);
    if (found) return found;
  }
  return null;
}

function findVisibleScopeInTree(scope) {
  if (!scopeVisibleInSidebar(scope)) return null;
  if (getVisibleItemsForScope(scope.id).length > 0 || scope.name.toLowerCase().includes(searchQuery)) {
    return scope.id;
  }

  for (const child of getChildScopes(scope.id)) {
    const found = findVisibleScopeInTree(child);
    if (found) return found;
  }

  return scope.id;
}

/**
 * Pre-compute which global items are shadowed (MCP, agents: project wins same-name)
 * and which items have unresolvable name conflicts (commands).
 * Called whenever showEffective toggles or scope changes.
 */
// getAncestorScopes — delegated to shared effective.mjs (_getAncestorScopes)

/**
 * Wrapper: delegates to shared effective.mjs module for computation,
 * then stores results in app-level state (effectiveShadowedKeys etc).
 */
function computeEffectiveSets(scopeId) {
  if (!hasCapability("effective") || !showEffective || !scopeId || scopeId === "global") {
    effectiveShadowedKeys = new Set();
    effectiveConflictKeys = new Set();
    effectiveAncestorKeys = new Set();
    return;
  }
  const result = _computeEffectiveSets(scopeId, data?.items || [], data?.scopes || [], itemKey);
  effectiveShadowedKeys = result.shadowedKeys;
  effectiveConflictKeys = result.conflictKeys;
  effectiveAncestorKeys = result.ancestorKeys;
}

function getVisibleItemsForScope(scopeId) {
  const ownItems = getItemsForScope(scopeId).filter((item) => itemVisibleInMain(item));
  if (!hasCapability("effective") || !showEffective || scopeId === "global") return ownItems;

  // Use shared module for effective resolution, then apply UI filters
  const allEffective = getEffectiveItems(scopeId, data?.items || [], data?.scopes || []);
  // Filter to non-own items that pass current UI filters
  const ownKeys = new Set(ownItems.map(i => itemKey(i)));
  const extra = allEffective.filter(i =>
    !ownKeys.has(itemKey(i)) && itemMatchesFilters(i) && itemMatchesSearch(i)
  );
  return [...ownItems, ...extra];
}

function itemVisibleInMain(item) {
  return item.scopeId === selectedScopeId && itemMatchesFilters(item) && itemMatchesSearch(item);
}

function itemMatchesFilters(item) {
  return activeFilters.size === 0 || activeFilters.has(item.category);
}

function itemMatchesSearch(item) {
  if (!searchQuery) return true;
  const text = [
    item.name,
    item.description,
    item.category,
    item.subType,
    item.path,
  ].join(" ").toLowerCase();
  return text.includes(searchQuery);
}

function sortCategoryItems(category, items) {
  const catKey = `${selectedScopeId}::${category}`;
  const sortState = uiState.sortBy[catKey];
  const sortDefault = getCategoryConfig(category).sortDefault;

  let sorted = [...items];

  // Default sort for sessions: newest first
  if (!sortState && sortDefault === "date") {
    return sorted.sort((a, b) => (b.mtime || "").localeCompare(a.mtime || ""));
  }

  // Default sort for memory: by subType then name
  if (!sortState && sortDefault === "subType") {
    const order = { project: 0, reference: 1, user: 2, feedback: 3 };
    return sorted.sort((a, b) => {
      const aOrder = order[a.subType] ?? 99;
      const bOrder = order[b.subType] ?? 99;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name);
    });
  }

  if (!sortState) return sorted;

  const dir = sortState.dir === "desc" ? -1 : 1;
  if (sortState.field === "size") {
    sorted.sort((a, b) => dir * ((a.sizeBytes || 0) - (b.sizeBytes || 0)));
  } else if (sortState.field === "date") {
    sorted.sort((a, b) => dir * ((a.mtime || "").localeCompare(b.mtime || "")));
  }
  return sorted;
}

function sortArrow(catKey, field) {
  const s = uiState.sortBy[catKey];
  if (!s || s.field !== field) return "↕";
  return s.dir === "asc" ? "↑" : "↓";
}

function canMoveItem(item) {
  if (item.locked) return false;
  const config = getCategoryConfig(item.category);
  return config.movable === true;
}

function canDeleteItem(item) {
  if (item.locked) return false;
  const config = getCategoryConfig(item.category);
  return config.deletable !== false;
}

function itemKey(item) {
  return `${item.category}::${item.name}::${item.path}`;
}

function getItemByKey(key) {
  return data?.items.find((item) => itemKey(item) === key) || null;
}

function getSelectedItems() {
  return [...bulkSelected]
    .map((key) => getItemByKey(key))
    .filter(Boolean);
}

function resolveItem(itemRef) {
  if (!itemRef) return null;
  if (typeof itemRef === "string") return getItemByKey(itemRef) || data.items.find((item) => item.path === itemRef) || null;
  return getItemByKey(itemKey(itemRef)) || itemRef;
}

function renderSessionChat(res) {
  const { title, totalMessages, showing, messages } = res;
  let html = "";

  // Header
  if (title) html += `<div class="chat-title">${esc(title)}</div>`;
  if (totalMessages > showing) {
    html += `<div class="chat-meta">Showing last ${showing} of ${totalMessages} messages</div>`;
  } else {
    html += `<div class="chat-meta">${totalMessages} messages</div>`;
  }

  // Messages
  for (const msg of messages) {
    const isUser = msg.role === "user";
    const roleClass = isUser ? "chat-user" : "chat-assistant";
    const assistantName = getHarnessShortName();
    const roleLabel = isUser ? "You" : assistantName;
    const avatar = isUser ? "U" : assistantName.slice(0, 1).toUpperCase();

    let body = esc(msg.text || "");
    // Basic markdown-ish: **bold**, `code`, ```blocks```
    body = body.replace(/```([\s\S]*?)```/g, '<pre class="chat-code-block">$1</pre>');
    body = body.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');
    body = body.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    let toolHtml = "";
    if (msg.toolUses?.length) {
      const tools = msg.toolUses.map(t => `<span class="chat-tool-name">${esc(t.name)}</span>`).join("");
      toolHtml = `<div class="chat-tool-row">${tools}</div>`;
    }

    html += `
      <div class="chat-msg ${roleClass}">
        <div class="chat-role"><span class="chat-avatar chat-avatar-${isUser ? "user" : "ai"}">${avatar}</span> ${roleLabel}</div>
        <div class="chat-bubble">
          <div class="chat-text">${body}</div>
          ${toolHtml}
        </div>
      </div>`;
  }

  return `<div class="chat-container">${html}</div>`;
}

function formatShortDate(raw) {
  if (!raw) return "—";
  // raw is now "YYYY-MM-DDTHH:MM" (ISO without seconds)
  const date = new Date(raw.includes("T") ? `${raw}:00` : `${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return SHORT_DATE.format(date);
}

function pluralize(count, singular) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function capitalize(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getSourceLanguage(filePath, item) {
  const name = (filePath || item?.path || item?.name || "").toLowerCase();
  if (item?.category === "setting" || item?.category === "mcp" || item?.category === "hook") return "json";
  if (name.endsWith(".json") || name.endsWith(".jsonc")) return "json";
  if (name.endsWith(".toml")) return "toml";
  if (name.endsWith(".yaml") || name.endsWith(".yml")) return "yaml";
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "markdown";
  return null;
}

function renderHighlightedSource(content, language) {
  return `<pre class="syntax-preview syntax-${esc(language)}">${highlightSource(content || "", language)}</pre>`;
}

function highlightSource(content, language) {
  if (language === "json") return highlightJsonSource(content);
  return content.split("\n").map((line) => highlightSourceLine(line, language)).join("\n");
}

function highlightJsonSource(content) {
  const tokenRe = /("(?:\\.|[^"\\])*")(\s*:)?/g;
  let out = "";
  let last = 0;
  for (const match of content.matchAll(tokenRe)) {
    out += esc(content.slice(last, match.index));
    const cls = match[2] ? "syntax-key" : "syntax-string";
    out += `<span class="${cls}">${esc(match[1])}</span>${esc(match[2] || "")}`;
    last = match.index + match[0].length;
  }
  return out + esc(content.slice(last));
}

function highlightSourceLine(line, language) {
  if (language === "toml" && /^\s*\[[^\]]+\]\s*$/.test(line)) {
    return `<span class="syntax-section">${esc(line)}</span>`;
  }
  if (language === "markdown" && /^\s{0,3}#{1,6}\s+/.test(line)) {
    return `<span class="syntax-section">${esc(line)}</span>`;
  }

  const keyMatch = line.match(/^(\s*)([A-Za-z0-9_.-]+)(\s*[:=]\s*)(.*)$/);
  if (keyMatch) {
    return `${esc(keyMatch[1])}<span class="syntax-key">${esc(keyMatch[2])}</span>${esc(keyMatch[3])}${highlightStrings(keyMatch[4], language)}`;
  }

  return highlightStrings(line, language);
}

function highlightStrings(text, language) {
  const stringRe = language === "markdown"
    ? /(`[^`]*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g
    : /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;
  let out = "";
  let last = 0;
  for (const match of text.matchAll(stringRe)) {
    out += esc(text.slice(last, match.index));
    out += `<span class="syntax-string">${esc(match[0])}</span>`;
    last = match.index + match[0].length;
  }
  return out + esc(text.slice(last));
}

/**
 * Render markdown to HTML using marked.js.
 * Strips YAML frontmatter (---...---) common in memory/skill files.
 * Falls back to escaped plain text if marked is not loaded.
 */
function renderMarkdown(text) {
  if (!text) return "";
  // Strip YAML frontmatter
  let content = text.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
  try {
    if (typeof marked === "undefined") return `<pre>${esc(content)}</pre>`;
    if (typeof marked.parse === "function") return marked.parse(content);
    if (typeof marked === "function") return marked(content);
  } catch {}
  return `<pre>${esc(content)}</pre>`;
}

// ── MCP Policy Panel ──────────────────────────────────────────────

function toggleMcpDisabled(projectPath, serverName, action) {
  fetchJson("/api/mcp-disabled", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project: projectPath, action, serverName }),
  }).then(res => {
    if (res.ok) {
      if (action === "disable") mcpDisabledNames.add(serverName);
      else mcpDisabledNames.delete(serverName);
      renderMainContent();
      initSortable();
      toast(`${serverName} ${action}d in this project`);
      // Refresh panel if open
      if (!document.getElementById("mcpControlsPanel").classList.contains("hidden")) openMcpControlsPanel();
    }
  });
}

function showMcpDisableConfirm(scope, mcpName) {
  // Count how many items share this name
  const allMcp = (data?.items || []).filter(i => i.category === "mcp" && i.name === mcpName);
  const scopes = [...new Set(allMcp.map(i => i.scopeId === "global" ? "Global" : getScopeById(i.scopeId)?.name || i.scopeId))];

  // Remove any existing mcp confirm overlay
  document.querySelector(".mcp-confirm-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "mcp-confirm-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <h3>Disable "${esc(mcpName)}"?</h3>
      <p class="modal-sub">All MCP servers named <strong>${esc(mcpName)}</strong> will be disabled in <strong>${esc(scope.name)}</strong>.</p>
      ${scopes.length > 1 ? `<p class="modal-sub">This name appears in: <strong>${scopes.map(s => esc(s)).join(", ")}</strong> — all will be affected.</p>` : ""}
      <p class="modal-sub" style="color:var(--text-faint)">Same as running <code>/mcp disable ${esc(mcpName)}</code> in Claude Code.</p>
      <div class="modal-btns">
        <button class="d-btn mcp-confirm-cancel">Cancel</button>
        <button class="d-btn d-btn-del mcp-confirm-ok">Disable</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  overlay.querySelector(".mcp-confirm-cancel").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  const okBtn = overlay.querySelector(".mcp-confirm-ok");
  if (!okBtn) { console.error("[CCO] mcp-confirm-ok button not found in overlay!"); return; }
  okBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    overlay.remove();
    if (!scope.repoDir) { toast("No project path — select a project scope", true); return; }
    toggleMcpDisabled(scope.repoDir, mcpName, "disable");
  });
}

async function openMcpControlsPanel() {
  if (!hasCapability("mcpControls")) return;
  const panel = document.getElementById("mcpControlsPanel");
  panel.classList.remove("hidden");

  const scope = getScopeById(selectedScopeId);
  const projectPath = scope?.repoDir;
  const title = document.getElementById("mcpControlsTitle");
  title.textContent = `MCP Controls — ${scope?.name || "Select a project"}`;

  const body = document.getElementById("mcpControlsBody");

  if (!projectPath) {
    body.innerHTML = `<div class="mcp-controls-note">Select a project scope to manage disabled MCP servers.</div>`;
    return;
  }

  body.innerHTML = `<div class="ctx-budget-loading">Loading…</div>`;

  // Ensure scan data is available for server name list
  if (!data) { data = await fetchJson("/api/scan"); renderAll(); }

  const disabledRes = await fetchJson(`/api/mcp-disabled?project=${encodeURIComponent(projectPath)}`);
  if (!disabledRes.ok) { body.innerHTML = `<div class="mcp-controls-note">Failed to load.</div>`; return; }

  const disabled = disabledRes.disabled;

  // All unique MCP names across all scopes (for autocomplete)
  const allMcp = (data?.items || []).filter(i => i.category === "mcp");
  const allNames = [...new Set(allMcp.map(i => i.name))].sort();
  const availableToDisable = allNames.filter(n => !disabled.includes(n));

  let html = "";

  // Disabled list (todo-list style)
  html += `<div class="mcp-controls-section">
    <div class="mcp-controls-section-hdr">Disabled in this project${disabled.length > 0 ? ` (${disabled.length})` : ""}</div>`;

  if (disabled.length === 0) {
    html += `<div class="mcp-controls-empty">All servers enabled. Add a server below to disable it.</div>`;
  } else {
    html += disabled.map(name => `<div class="mcp-controls-row">
      <span class="mcp-controls-name">${esc(name)}</span>
      <button class="mcp-controls-remove-btn" data-name="${esc(name)}" title="Re-enable">✕</button>
    </div>`).join("");
  }

  // Searchable combobox — type to filter, click to add
  html += `<div class="mcp-controls-add">
    <div class="mcp-controls-add-wrap">
      <input type="text" class="mcp-controls-input" id="mcpDisableInput" placeholder="Type to search or browse servers…" autocomplete="off">
      <div class="mcp-controls-suggestions hidden" id="mcpSuggestions"></div>
    </div>
  </div>`;

  html += `</div>`;
  html += `<div class="mcp-controls-note">Any server with a disabled name won't load in this project, regardless of scope (global or project). Same as <code>/mcp disable &lt;name&gt;</code> in Claude Code.</div>`;

  body.innerHTML = html;

  // Wire up remove buttons
  body.querySelectorAll(".mcp-controls-remove-btn").forEach(btn => {
    btn.addEventListener("click", () => toggleMcpDisabled(projectPath, btn.dataset.name, "enable"));
  });

  // Searchable combobox: show all on focus, filter on type, click to disable
  const input = body.querySelector("#mcpDisableInput");
  const sugBox = body.querySelector("#mcpSuggestions");

  function renderSuggestions(query) {
    const q = query.toLowerCase();
    const matches = q ? availableToDisable.filter(n => n.toLowerCase().includes(q)) : availableToDisable;
    if (matches.length === 0) {
      sugBox.innerHTML = `<div class="mcp-sug-item mcp-sug-empty">${q ? "No matches" : "No servers available"}</div>`;
    } else {
      sugBox.innerHTML = matches.map(n =>
        `<div class="mcp-sug-item" data-name="${esc(n)}">${esc(n)}</div>`
      ).join("");
    }
    sugBox.classList.remove("hidden");

    sugBox.querySelectorAll(".mcp-sug-item[data-name]").forEach(item => {
      item.addEventListener("click", () => {
        const scope = getScopeById(selectedScopeId);
        if (scope) showMcpDisableConfirm(scope, item.dataset.name);
      });
    });
  }

  input.addEventListener("input", () => renderSuggestions(input.value.trim()));
  input.addEventListener("focus", () => renderSuggestions(input.value.trim()));
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".mcp-controls-add")) sugBox.classList.add("hidden");
  }, { once: true });
}

function closeMcpControlsPanel() {
  document.getElementById("mcpControlsPanel").classList.add("hidden");
}

function setupMcpControls() {
  const btn = document.getElementById("mcpControlsBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (!hasCapability("mcpControls")) return;
    document.getElementById("ctxBudgetPanel")?.classList.add("hidden");
    document.getElementById("securityPanel")?.classList.add("hidden");
    closeDetail();
    openMcpControlsPanel();
  });
  document.getElementById("mcpControlsClose")?.addEventListener("click", closeMcpControlsPanel);
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

// ══════════════════════════════════════════════════════════════════════
// Security Scan UI
// ══════════════════════════════════════════════════════════════════════

let securityScanResults = null;

/** Map of MCP server name → highest severity found. Used by renderItem() to show badges. */
let securityBadges = {};
/** Map of MCP server name → baseline status ("new" | "changed" | null). */
let securityBaselineStatus = {};

function setSecurityButtonAlert(count, tooltipText) {
  const btn = document.getElementById("securityScanBtn");
  if (!btn) return;
  btn.classList.add("sec-btn-alert");
  btn.setAttribute("aria-label", `Security Scan: ${tooltipText}`);

  const badge = document.getElementById("securityScanBadge");
  if (badge) {
    badge.textContent = String(count);
    badge.classList.remove("hidden");
  }

  btn.querySelector(".sec-btn-tooltip")?.remove();
  const tip = document.createElement("span");
  tip.className = "sec-btn-tooltip";
  tip.textContent = tooltipText;
  btn.appendChild(tip);
}

function clearSecurityButtonAlert() {
  const btn = document.getElementById("securityScanBtn");
  if (!btn) return;
  btn.classList.remove("sec-btn-alert");
  btn.removeAttribute("aria-label");
  btn.querySelector(".sec-btn-tooltip")?.remove();
  const badge = document.getElementById("securityScanBadge");
  if (badge) {
    badge.textContent = "";
    badge.classList.add("hidden");
  }
}

function setupSecurityScan() {
  const btn = document.getElementById("securityScanBtn");
  const panel = document.getElementById("securityPanel");
  const closeBtn = document.getElementById("securityClose");
  const startBtn = document.getElementById("securityStartBtn");
  const rescanBtn = document.getElementById("securityRescanBtn");

  if (!btn) return;

  // Cached results + new server check loaded in init() before renderAll

  btn.addEventListener("click", async () => {
    document.getElementById("ctxBudgetPanel")?.classList.add("hidden");
    panel.classList.remove("hidden");

    // If shimmer alert is active → auto-scan immediately
    if (btn.classList.contains("sec-btn-alert")) {
      await runSecurityScan();
    } else if (securityScanResults) {
      renderSecurityResults(securityScanResults);
    }
  });

  closeBtn?.addEventListener("click", () => {
    panel.classList.add("hidden");
  });

  startBtn?.addEventListener("click", async () => {
    await runSecurityScan();
  });

  rescanBtn?.addEventListener("click", async () => {
    await runSecurityScan();
  });

  // Delegate clicks on findings → navigate to item
  document.getElementById("securityResults")?.addEventListener("click", (e) => {
    const row = e.target.closest("[data-sec-server]");
    if (!row) return;
    const serverName = row.dataset.secServer;
    const scopeId = row.dataset.secScope;
    if (serverName && scopeId) navigateToMcpServer(serverName, scopeId);
  });
}

/** Navigate to a specific MCP server item in the main list. */
function navigateToMcpServer(serverName, scopeId) {
  if (!data) return;

  // Find the MCP item
  const item = data.items.find(i =>
    i.category === "mcp" && i.name === serverName && i.scopeId === scopeId
  ) || data.items.find(i =>
    i.category === "mcp" && i.name === serverName
  );
  if (!item) return;

  // Switch to the right scope
  selectedScopeId = item.scopeId;
  expandScopePath(selectedScopeId);

  // Filter to MCP category
  activeFilters = new Set(["mcp"]);

  // Highlight the item but don't open detail panel — let user click to inspect
  selectedItem = item;
  renderAll();

  // Scroll to the item
  requestAnimationFrame(() => {
    const row = document.querySelector(`.item[data-item-key="${cssEscape(itemKey(item))}"]`);
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.classList.add("sec-flash");
      setTimeout(() => row.classList.remove("sec-flash"), 1500);
    }
    loadPreview(item);
  });
}

/** Open security panel and auto-expand findings for a specific server. */
function openSecurityForServer(serverName) {
  if (!securityScanResults) return;

  // Show security panel
  document.getElementById("ctxBudgetPanel")?.classList.add("hidden");
  const panel = document.getElementById("securityPanel");
  panel.classList.remove("hidden");
  renderSecurityResults(securityScanResults);

  // Find and expand the matching server row
  requestAnimationFrame(() => {
    const rows = panel.querySelectorAll(".sec-server-row");
    for (const row of rows) {
      if (row.dataset.secServer === serverName) {
        // Expand its findings
        const toggle = row.querySelector(".sec-collapse-btn");
        const list = row.nextElementSibling;
        if (list?.classList.contains("sec-findings-list") && list.classList.contains("hidden")) {
          list.classList.remove("hidden");
          if (toggle) toggle.textContent = "▾";
        }
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.classList.add("sec-flash");
        setTimeout(() => row.classList.remove("sec-flash"), 1500);
        break;
      }
    }
  });
}

/** Get security severity for an MCP server name (for item badges). */
function getSecuritySeverity(mcpName) {
  return securityBadges[mcpName] || null;
}

async function runSecurityScan() {
  const intro = document.getElementById("securityIntro");
  const progress = document.getElementById("securityProgress");
  const progressText = document.getElementById("securityProgressText");
  const progressBar = document.getElementById("securityProgressBar");
  const results = document.getElementById("securityResults");
  const footer = document.getElementById("securityFooter");

  intro.classList.add("hidden");
  progress.classList.remove("hidden");
  results.classList.add("hidden");
  footer.classList.add("hidden");
  progressBar.style.width = "10%";
  progressBar.classList.remove("security-bar-error");
  progressText.textContent = "Connecting to MCP servers...";

  try {
    progressBar.style.width = "20%";
    progressText.textContent = "Fetching tool definitions from MCP servers...";

    const resp = await fetch(apiUrl("/api/security-scan"), { method: "POST" });
    const scanData = await resp.json();

    progressBar.style.width = "90%";
    progressText.textContent = "Analyzing patterns...";

    if (!scanData.ok) {
      progressText.textContent = `Scan failed: ${scanData.error}`;
      progressBar.style.width = "100%";
      progressBar.classList.add("security-bar-error");
      return;
    }

    progressBar.style.width = "100%";
    securityScanResults = scanData;

    // Build badge + baseline status maps for item list
    securityBadges = {};
    securityBaselineStatus = {};
    for (const server of (scanData.servers || [])) {
      if (server.findings?.length > 0) {
        const maxSev = server.findings.reduce((max, f) => {
          const order = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
          return (order[f.severity] || 0) > (order[max] || 0) ? f.severity : max;
        }, "info");
        securityBadges[server.serverName] = maxSev;
      } else if (server.status === "error") {
        securityBadges[server.serverName] = "unreachable";
      }
    }
    for (const b of (scanData.baselines || [])) {
      if (b.isFirstScan) securityBaselineStatus[b.serverName] = "new";
      else if (b.hasChanges) securityBaselineStatus[b.serverName] = "changed";
    }

    renderSecurityResults(scanData);
    // Re-render main list — badges only on servers with findings, clean servers get cleared
    renderAll();
    // Cache results for next session
    saveSecurityResults(scanData);
    // Clear NEW flags (baselines updated), but check for CHANGED servers
    securityBaselineStatus = {};
    const changedCount = (scanData.baselines || []).filter(b => b.hasChanges && !b.isFirstScan).length;
    const scanBtn = document.getElementById("securityScanBtn");

    if (changedCount > 0 && scanBtn) {
      // Servers changed since last scan — re-shimmer + CHANGED badges
      for (const b of (scanData.baselines || [])) {
        if (b.hasChanges && !b.isFirstScan) securityBaselineStatus[b.serverName] = "changed";
      }
      setSecurityButtonAlert(changedCount, `${changedCount} MCP server${changedCount > 1 ? "s" : ""} changed — click to rescan`);
      renderAll(); // re-render to show CHANGED badges
    } else if (scanBtn) {
      // All clear — remove shimmer + tooltip + re-render to clear badges
      clearSecurityButtonAlert();
      renderAll();
    }

  } catch (err) {
    progressText.textContent = `Error: ${err.message}`;
    progressBar.classList.add("security-bar-error");
  }
}

function renderSecurityResults(scanData) {
  const progress = document.getElementById("securityProgress");
  const results = document.getElementById("securityResults");
  const footer = document.getElementById("securityFooter");
  const footerNote = document.getElementById("securityFooterNote");

  progress.classList.add("hidden");
  results.classList.remove("hidden");
  document.getElementById("securityRescanBtn")?.classList.remove("hidden");
  footer.classList.remove("hidden");

  const { severityCounts, totalTools, totalServers, serversConnected, baselines, findings } = scanData;
  const totalFindings = findings.length;

  // ── Summary stats ──
  let html = `<div class="security-summary">`;
  html += `<div class="security-stat"><span class="security-stat-num">${serversConnected}<span class="security-stat-sub">/${totalServers}</span></span><span class="security-stat-label">Servers</span></div>`;
  html += `<div class="security-stat"><span class="security-stat-num">${totalTools}</span><span class="security-stat-label">Tools</span></div>`;
  html += `<div class="security-stat"><span class="security-stat-num">${totalFindings}</span><span class="security-stat-label">Findings</span></div>`;
  html += `</div>`;

  // ── Severity pills ──
  if (totalFindings > 0) {
    html += `<div class="security-severity-row">`;
    if (severityCounts.critical > 0) html += `<span class="sec-badge sec-critical">${severityCounts.critical} Critical</span>`;
    if (severityCounts.high > 0) html += `<span class="sec-badge sec-high">${severityCounts.high} High</span>`;
    if (severityCounts.medium > 0) html += `<span class="sec-badge sec-medium">${severityCounts.medium} Medium</span>`;
    if (severityCounts.low > 0) html += `<span class="sec-badge sec-low">${severityCounts.low} Low</span>`;
    html += `</div>`;
  } else {
    html += `<div class="security-clean">All clear — no issues found</div>`;
  }

  // ── Baseline changes ──
  const changedServers = (baselines || []).filter(b => b.hasChanges && !b.isFirstScan);
  if (changedServers.length > 0) {
    html += `<div class="ctx-section">`;
    html += `<div class="ctx-section-hdr">`;
    html += `<span class="ctx-collapse-btn sec-collapse-btn">▾</span>`;
    html += `<span class="ctx-section-title">Changed since last scan</span>`;
    html += `<span class="sec-badge sec-critical" style="margin-left:auto">${changedServers.length}</span>`;
    html += `</div>`;
    html += `<div class="ctx-section-items">`;
    for (const b of changedServers) {
      html += `<div class="ctx-item security-finding" data-sec-server="${esc(b.serverName)}" data-sec-scope="global">`;
      html += `<span class="ctx-item-icon">🔌</span>`;
      html += `<span class="ctx-item-name">${esc(b.serverName)} — ${b.changed.length} modified, ${b.added.length} added, ${b.removed.length} removed</span>`;
      html += `</div>`;
    }
    html += `</div></div>`;
  }

  // ── Findings grouped by server ──
  if (totalFindings > 0) {
    // Group findings by server name
    const byServer = {};
    for (const f of findings) {
      const parts = (f.sourceName || "").split("/");
      const server = parts[0] || "unknown";
      if (!byServer[server]) byServer[server] = [];
      byServer[server].push(f);
    }

    // Sort servers: most severe first
    const sevOrder = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
    const sortedServers = Object.entries(byServer).sort((a, b) => {
      const maxA = Math.max(...a[1].map(f => sevOrder[f.severity] || 0));
      const maxB = Math.max(...b[1].map(f => sevOrder[f.severity] || 0));
      return maxB - maxA;
    });

    for (const [server, serverFindings] of sortedServers) {
      const serverData = (scanData.servers || []).find(s => s.serverName === server);
      const scopeId = serverData?.scopeId || "global";
      const maxSev = serverFindings.reduce((m, f) => {
        const o = { critical: 4, high: 3, medium: 2, low: 1 };
        return (o[f.severity] || 0) > (o[m] || 0) ? f.severity : m;
      }, "low");
      const maxBadgeClass = maxSev === "critical" ? "sec-critical" : maxSev === "high" ? "sec-high" : maxSev === "medium" ? "sec-medium" : "sec-low";

      // Deduplicate findings (e.g. 20× "Cross-server reference" → one row with ×20)
      const deduped = [];
      const countMap = {};
      for (const f of serverFindings) {
        const key = f.id + "::" + f.name;
        if (!countMap[key]) { countMap[key] = { ...f, count: 1 }; deduped.push(countMap[key]); }
        else countMap[key].count++;
      }

      // Server row (item-style, not section header)
      html += `<div class="sec-server-row" data-sec-server="${esc(server)}" data-sec-scope="${esc(scopeId)}">`;
      html += `<span class="sec-row-toggle sec-collapse-btn">▸</span>`;
      html += `<span class="sec-row-icon">🔌</span>`;
      html += `<span class="sec-row-name">${esc(server)}</span>`;
      html += `<span class="sec-badge ${maxBadgeClass}">${serverFindings.length}</span>`;
      html += `</div>`;

      // Findings (hidden by default, toggle with ▸)
      html += `<div class="sec-findings-list hidden">`;
      for (const f of deduped) {
        const bc = f.severity === "critical" ? "sec-critical" : f.severity === "high" ? "sec-high" : f.severity === "medium" ? "sec-medium" : "sec-low";
        const countLabel = f.count > 1 ? ` ×${f.count}` : "";
        // Build fix prompt for "Fix with Claude →"
        const fixPrompt = [
          `CCO Security Scanner found an issue in MCP server "${server}":`,
          ``,
          `Finding: ${f.name} [${f.id}]`,
          `Severity: ${f.severity}`,
          `Category: ${f.category}`,
          `Description: ${f.description}`,
          `Matched text: ${f.matchedText}`,
          `Context: ${f.context}`,
          ``,
          `Detected by: CCO built-in scanner (rule ${f.id})`,
          `Server: ${server}`,
          `Source: ${f.sourceName || ""}`,
          ``,
          `This may be a false positive — please evaluate whether this is a real security issue.`,
          `If it is real, explain the risk and guide me through fixing it.`,
          `If it is a false positive, explain why it's safe.`,
        ].join("\n");
        const promptAttr = esc(fixPrompt).replace(/"/g, "&quot;");

        html += `<div class="sec-finding-item" data-sec-server="${esc(server)}" data-sec-scope="${esc(scopeId)}">`;
        html += `<div class="sec-finding-header">`;
        html += `<span class="sec-badge ${bc}" style="font-size:9px;padding:0 4px">${esc(f.severity.charAt(0).toUpperCase())}</span>`;
        html += `<span class="sec-finding-label">${esc(f.name)}${countLabel}</span>`;
        html += `<span class="sec-tag">${esc(f.id)}</span>`;
        html += `</div>`;
        if (f.description) {
          html += `<div class="sec-finding-desc">${esc(f.description)}</div>`;
        }
        html += `<div class="sec-finding-fix sec-fix-clickable" data-fix-prompt="${promptAttr}" title="Click to copy prompt for Claude Code">`;
        html += `💡 Fix with Claude <span class="sec-fix-action">→ Copy prompt</span></div>`;
        html += `</div>`;
      }
      html += `</div>`;
    }
  }

  // ── Failed servers (collapsed) ──
  const failedServers = (scanData.servers || []).filter(s => s.status === "error");
  if (failedServers.length > 0) {
    html += `<div class="sec-server-row sec-unreachable-toggle">`;
    html += `<span class="sec-row-toggle sec-collapse-btn">▸</span>`;
    html += `<span class="sec-row-icon">⚠️</span>`;
    html += `<span class="sec-row-name">${failedServers.length} Unreachable</span>`;
    html += `</div>`;
    html += `<div class="sec-findings-list hidden">`;
    for (const s of failedServers) {
      const scopeId = s.scopeId || "global";
      html += `<div class="sec-server-row" data-sec-server="${esc(s.serverName)}" data-sec-scope="${esc(scopeId)}" style="margin-left:12px">`;
      html += `<span class="sec-row-icon">🔌</span>`;
      html += `<span class="sec-row-name">${esc(s.serverName)}</span>`;
      html += `<span class="sec-badge sec-unreachable">UNREACHABLE</span>`;
      html += `</div>`;
    }
    html += `</div>`;
  }

  // Duplicate servers data available in scanData.duplicates (backend)
  // but not shown in UI — Claude Code handles dedup internally, not actionable for users

  results.innerHTML = html;

  // Bind collapse toggles on server rows
  results.querySelectorAll(".sec-collapse-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      // For server rows: toggle the next sibling findings list
      const serverRow = btn.closest(".sec-server-row");
      if (serverRow) {
        const list = serverRow.nextElementSibling;
        if (list?.classList.contains("sec-findings-list")) {
          const hidden = list.classList.toggle("hidden");
          btn.textContent = hidden ? "▸" : "▾";
        }
        return;
      }
      // For ctx-section (baseline changes, unreachable)
      const section = btn.closest(".ctx-section");
      const items = section?.querySelector(".ctx-section-items");
      if (items) {
        const hidden = items.classList.toggle("hidden");
        btn.textContent = hidden ? "▸" : "▾";
      }
    });
  });

  // "Fix with Claude →" click → copy prompt to clipboard
  results.querySelectorAll(".sec-fix-clickable").forEach(el => {
    el.addEventListener("click", async (e) => {
      e.stopPropagation();
      const prompt = el.dataset.fixPrompt;
      if (!prompt) return;
      try {
        await navigator.clipboard.writeText(prompt);
        toast("Prompt copied — paste in Claude Code");
      } catch {
        const ta = document.createElement("textarea");
        ta.value = prompt;
        ta.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        toast("Prompt copied — paste in Claude Code");
      }
    });
  });

  // Server row click → navigate to MCP item
  results.querySelectorAll(".sec-server-row[data-sec-server]").forEach(row => {
    row.addEventListener("click", (e) => {
      if (e.target.classList.contains("sec-collapse-btn")) return;
      navigateToMcpServer(row.dataset.secServer, row.dataset.secScope);
    });
  });

  const scanTime = new Date(scanData.timestamp).toLocaleString();
  footerNote.textContent = `${scanTime}`;
}

/**
 * The baseline file is updated during a successful scan, so "first scan"
 * is only meaningful for the active in-memory result. If we persist it into
 * cache, reopening the app will incorrectly resurrect stale NEW badges.
 */
function getPersistableSecurityScanData(scanData) {
  if (!scanData || typeof scanData !== "object") return scanData;
  return {
    ...scanData,
    baselines: Array.isArray(scanData.baselines)
      ? scanData.baselines.map((b) => b?.isFirstScan ? { ...b, isFirstScan: false } : b)
      : scanData.baselines,
  };
}

/** Save security scan results to server for persistence across sessions. */
function saveSecurityResults(scanData) {
  fetch(apiUrl("/api/security-cache"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(getPersistableSecurityScanData(scanData)),
  }).catch(() => {}); // Fire and forget
}

/** Load cached security scan results from server on startup. */
async function loadCachedSecurityResults() {
  try {
    const resp = await fetch(apiUrl("/api/security-cache"));
    const cached = await resp.json();
    if (!cached.ok || !cached.data) return;

    securityScanResults = cached.data;

    // Rebuild badge map from cached results.
    securityBadges = {};
    securityBaselineStatus = {};
    for (const server of (cached.data.servers || [])) {
      if (server.findings?.length > 0) {
        const maxSev = server.findings.reduce((max, f) => {
          const order = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
          return (order[f.severity] || 0) > (order[max] || 0) ? f.severity : max;
        }, "info");
        securityBadges[server.serverName] = maxSev;
      } else if (server.status === "error") {
        securityBadges[server.serverName] = "unreachable";
      }
    }
    // Never restore NEW from cache. "New since last scan" must be computed
    // against the current baseline file on startup, otherwise stale cache
    // keeps re-flagging servers that were already acknowledged by a scan.
    for (const b of (cached.data.baselines || [])) {
      if (b.hasChanges && !b.isFirstScan) securityBaselineStatus[b.serverName] = "changed";
    }

    // Hide intro (results will render when user opens security panel)
    const intro = document.getElementById("securityIntro");
    if (intro) intro.classList.add("hidden");

    // Check baselines for changes → pulse the sidebar button
    const hasChanges = (cached.data.baselines || []).some(b => b.hasChanges && !b.isFirstScan);
    if (hasChanges) {
      const changedCount = (cached.data.baselines || []).filter(b => b.hasChanges && !b.isFirstScan).length;
      setSecurityButtonAlert(changedCount, `${changedCount} MCP server${changedCount > 1 ? "s" : ""} changed since last scan — click to rescan`);
    }
  } catch {}
}

/** Check for new MCP servers on startup (no scan needed, just compare names against baselines). */
async function checkForNewMcpServers() {
  try {
    const resp = await fetch(apiUrl("/api/security-baseline-check"));
    const result = await resp.json();
    if (!result.ok) return;

    // Mark new servers in baseline status map
    for (const name of (result.newServers || [])) {
      securityBaselineStatus[name] = "new";
    }

    // If there are new servers, shimmer the sidebar button + add tooltip
    if (result.newServers?.length > 0) {
      setSecurityButtonAlert(
        result.newServers.length,
        `${result.newServers.length} new MCP server${result.newServers.length > 1 ? "s" : ""} detected — click to scan`
      );
    }
  } catch {}
}

init();
