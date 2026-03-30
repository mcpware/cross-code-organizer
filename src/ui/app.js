/**
 * app.js — Frontend logic for Claude Code Organizer.
 *
 * Fetches data from /api/scan, renders the approved three-panel UI,
 * and keeps the existing search, filter, drag/drop, detail, bulk,
 * move, delete, and undo behaviors.
 */

let data = null;
let activeFilters = new Set();
let selectedItem = null;
let selectedScopeId = null;
let showInherited = false;
let pendingDrag = null;
let pendingDelete = null;
let draggingItem = null;
let bulkSelected = new Set();
let searchQuery = "";
let selectMode = false;
let toastTimer = null;
let detailPreviewKey = null;

const uiState = {
  expandedScopes: new Set(),
  collapsedCats: new Set(),
  collapsedBundles: new Set(),
  sortBy: {}, // { [catKey]: { field: "size"|"date"|"name", dir: "asc"|"desc" } }
};

const CATEGORY_ORDER = ["skill", "memory", "mcp", "command", "agent", "plan", "rule", "config", "hook", "plugin", "session"];

const CATEGORIES = {
  memory: { icon: "🧠", label: "Memories", filterLabel: "Memories", group: "memory" },
  skill: { icon: "⚡", label: "Skills", filterLabel: "Skills", group: "skill" },
  session: { icon: "💬", label: "Sessions", filterLabel: "Sessions", group: null },
  mcp: { icon: "🔌", label: "MCP Servers", filterLabel: "MCP", group: "mcp" },
  command: { icon: "▶️", label: "Commands", filterLabel: "Commands", group: "command" },
  agent: { icon: "🤖", label: "Agents", filterLabel: "Agents", group: "agent" },
  plan: { icon: "📐", label: "Plans", filterLabel: "Plans", group: "plan" },
  rule: { icon: "📏", label: "Rules", filterLabel: "Rules", group: null },
  config: { icon: "⚙️", label: "Config", filterLabel: "Config", group: null },
  hook: { icon: "🪝", label: "Hooks", filterLabel: "Hooks", group: null },
  plugin: { icon: "🧩", label: "Plugins", filterLabel: "Plugins", group: null },
};

const ITEM_ICONS = {
  memory: "🧠",
  skill: "⚡",
  session: "💬",
  mcp: "🔌",
  command: "▶️",
  agent: "🤖",
  plan: "📐",
  rule: "📏",
  config: "⚙️",
  hook: "🪝",
  plugin: "🧩",
};

const SCOPE_ICONS = {
  global: "🌐",
  project: "📂",
};

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
    data = await fetchJson("/api/scan");
    selectedScopeId = getInitialSelectedScopeId();
    initializeScopeState();
    setupUi();
    setupScopeNotice();
    // Load cached scan results + check for new servers BEFORE first render
    await loadCachedSecurityResults();
    await checkForNewMcpServers();
    renderAll();
    checkForUpdate();
  } catch (error) {
    document.getElementById("loading").textContent = "Failed to load inventory";
    toast(error?.message || "Failed to load inventory", true);
  }
}

async function checkForUpdate() {
  try {
    const { updateAvailable } = await fetchJson("/api/version");
    if (!updateAvailable) return;
    const footer = document.querySelector(".sidebar-footer");
    if (!footer) return;
    const banner = document.createElement("div");
    banner.className = "update-banner";
    banner.innerHTML = "🔄 New version available — <code>npx @mcpware/claude-code-organizer@latest</code>";
    banner.addEventListener("click", () => {
      navigator.clipboard.writeText("Run npx @mcpware/claude-code-organizer@latest to update Claude Code Organizer to the latest version.").then(() => {
        banner.innerHTML = "✅ Copied! Paste into Claude Code";
        setTimeout(() => {
          banner.innerHTML = "🔄 New version available — <code>npx @mcpware/claude-code-organizer@latest</code>";
        }, 2000);
      });
    });
    footer.prepend(banner);
  } catch { /* silent */ }
}

async function fetchJson(url) {
  const res = await fetch(url);
  return res.json();
}

function setupScopeNotice() {
  const NOTICE_KEY = "cco-scope-notice-v1-dismissed";
  if (localStorage.getItem(NOTICE_KEY)) return;
  const tree = document.getElementById("sidebarTree");
  if (!tree) return;
  const notice = document.createElement("div");
  notice.className = "scope-notice";
  notice.innerHTML = `<span class="scope-notice-dismiss" id="scopeNoticeDismiss">✕</span><strong>How scopes work:</strong> Claude Code has two scopes — <strong>Global</strong> and <strong>Project</strong>. Every project inherits directly from Global only. Sibling or nested projects do not inherit from each other.`;
  tree.parentElement.insertBefore(notice, tree);
  document.getElementById("scopeNoticeDismiss").addEventListener("click", () => {
    localStorage.setItem(NOTICE_KEY, "1");
    notice.remove();
  });
}

function setupUi() {
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
  setupContextBudget();
  setupResizers();
  setupSecurityScan();
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
      if (isContextBudgetOpen()) {
        openContextBudget(selectedScopeId);
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
    showInherited = false;
    expandScopePath(selectedScopeId);
    if (isContextBudgetOpen()) {
      openContextBudget(selectedScopeId);
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

  itemList.addEventListener("click", (event) => {
    const actionBtn = event.target.closest(".act-btn");
    if (actionBtn) {
      const itemEl = actionBtn.closest(".item");
      const item = getItemByKey(itemEl?.dataset.itemKey);
      if (!item) return;

      if (actionBtn.dataset.action === "move") {
        openMoveModal(item);
      } else if (actionBtn.dataset.action === "open") {
        openInEditor(item.path);
      } else if (actionBtn.dataset.action === "delete") {
        openDeleteModal(item);
      }
      return;
    }

    if (event.target.closest(".item-chk")) return;

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
    if (catHdr && !event.target.closest(".sort-btn")) {
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
      // Restore full view
      uiState._dragCollapsed = false;
      button.title = "Collapse to tree";
      button.textContent = "▤";
    } else {
      // Collapse: show scope tree only, hide category sub-items
      uiState._dragCollapsed = true;
      button.title = "Expand all";
      button.textContent = "▦";
    }
    renderSidebar();
  });
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
  renderSidebar();
  renderContentHeader();
  renderPills();
  renderMainContent();
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

  tree.innerHTML = rootScopes.map((scope) => renderSidebarScope(scope)).join("");
}

function renderSidebarScope(scope) {
  const childHtml = getChildScopes(scope.id)
    .filter((child) => scopeVisibleInSidebar(child))
    .map((child) => renderSidebarScope(child))
    .join("");

  const categoryRows = getSidebarCategoryCounts(scope.id)
    .map(({ category, count }) => {
      const config = CATEGORIES[category] || { icon: "📄", label: capitalize(category) };
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
  // In drag mode: always show children (scope tree), hide categories
  const showBody = isDragMode ? hasChildren : (isExpanded && hasNestedContent);
  const icon = SCOPE_ICONS[scope.type] || "📂";

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
          ${categoryRows ? `<div>${categoryRows}</div>` : ""}
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

  const chain = getScopeChain(scope);
  if (chain.length === 0) {
    inherit.innerHTML = "";
    inherit.style.display = "none";
    return;
  }

  inherit.style.display = "";
  inherit.innerHTML = `
    <span class="c-inherit-label">inherits from</span>
    ${chain.map((entry, index) => {
      const icon = SCOPE_ICONS[entry.type] || "📂";
      const sep = index === chain.length - 1 ? "" : `<span class="c-inherit-sep">›</span>`;
      return `<span class="c-inherit-pill">${icon} ${esc(entry.name)}</span>${sep}`;
    }).join("")}`;
}

function renderPills() {
  const container = document.getElementById("pills");
  // Count items for the currently selected scope, plus Global if showInherited
  let scopeItems = selectedScopeId
    ? (data?.items || []).filter((i) => i.scopeId === selectedScopeId)
    : data?.items || [];
  if (showInherited && selectedScopeId && selectedScopeId !== "global") {
    const globalItems = (data?.items || []).filter((i) => i.scopeId === "global");
    scopeItems = [...scopeItems, ...globalItems];
  }
  const scopeCounts = {};
  let scopeTotal = 0;
  for (const item of scopeItems) {
    scopeCounts[item.category] = (scopeCounts[item.category] || 0) + 1;
    scopeTotal++;
  }
  const pills = [
    { key: "all", label: "All", icon: "◌", count: scopeTotal },
    ...CATEGORY_ORDER.map((category) => {
      const config = CATEGORIES[category] || { icon: "📄", filterLabel: capitalize(category) };
      return {
        key: category,
        label: config.filterLabel,
        icon: config.icon,
        count: scopeCounts[category] || 0,
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
      return `
        <button type="button" class="f-pill${isActive ? " active" : ""}" data-filter="${pill.key}">
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

function renderMainContent() {
  const itemList = document.getElementById("itemList");
  const scope = getScopeById(selectedScopeId);

  if (!scope) {
    itemList.innerHTML = `<div class="empty-state empty-centered">Select a scope to inspect its contents.</div>`;
    return;
  }

  const items = getVisibleItemsForScope(scope.id);
  const categories = CATEGORY_ORDER
    .map((category) => ({
      category,
      items: sortCategoryItems(category, items.filter((item) => item.category === category)),
    }))
    .filter((entry) => entry.items.length > 0);

  if (categories.length === 0) {
    const message = searchQuery
      ? "No items match the current search in this scope."
      : activeFilters.size > 0
        ? "No items match the current filters in this scope."
        : "No items found in this scope.";
    itemList.innerHTML = `<div class="empty-state empty-centered">${message}</div>`;
    return;
  }

  itemList.innerHTML = categories.map(({ category, items: catItems }) => {
    const config = CATEGORIES[category] || { icon: "📄", label: capitalize(category), group: null };
    const catKey = `${scope.id}::${category}`;
    const collapsed = searchQuery ? false : uiState.collapsedCats.has(catKey);

    return `
      <div class="cat-section" data-cat-section="${esc(category)}">
        <div class="cat-hdr" data-cat="${esc(category)}">
          <span class="cat-hdr-tog${collapsed ? " collapsed" : ""}">▾</span>
          <span class="cat-hdr-ico">${config.icon}</span>
          <span class="cat-hdr-nm">${esc(config.label)}</span>
          <span class="cat-hdr-cnt">${pluralize(catItems.length, "item")}</span>
          ${category === "mcp" ? "" : `<span class="cat-hdr-sort">
            <button type="button" class="sort-btn${(uiState.sortBy[`${scope.id}::${category}`]?.field === "size") ? " active" : ""}" data-cat="${esc(category)}" data-sort="size">Size ${sortArrow(`${scope.id}::${category}`, "size")}</button>
            <button type="button" class="sort-btn${(uiState.sortBy[`${scope.id}::${category}`]?.field === "date") ? " active" : ""}" data-cat="${esc(category)}" data-sort="date">Date ${sortArrow(`${scope.id}::${category}`, "date")}</button>
          </span>`}
        </div>
        <div class="cat-body${collapsed ? " collapsed" : ""}">
          ${category === "skill"
            ? renderSkillCategory(scope.id, config.group, catItems)
            : `
              <div class="sortable-zone" data-scope="${esc(scope.id)}" data-group="${config.group || "none"}">
                ${catItems.map((item) => renderItem(item)).join("")}
              </div>`}
        </div>
      </div>`;
  }).join("");

  updateSelectedItemHighlight();
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
    const bundleName = bundle.split("/").pop() || bundle;
    html += `
      <div class="bundle-group">
        <div class="bundle-row" data-bundle="${esc(bundle)}">
          <span class="bundle-row-ico">📦</span>
          <span class="bundle-row-nm">${esc(bundleName)}</span>
          <span class="bundle-row-src">${esc(bundle)}</span>
          <span class="bundle-row-cnt">${pluralize(bundleItems.length, "skill")}</span>
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

function renderItem(item) {
  const icon = ITEM_ICONS[item.category] || "📄";
  const key = itemKey(item);
  const isSelected = selectedItem && itemKey(selectedItem) === key;
  const checked = bulkSelected.has(key) ? " checked" : "";
  const badgeHtml = shouldShowItemBadge(item) ? renderBadge(item) : "";
  const checkbox = item.locked ? "" : `<input type="checkbox" class="item-chk" data-item-key="${esc(key)}"${checked}>`;
  const dateLabel = formatShortDate(item.mtime || item.ctime);
  const sizeLabel = item.size || "—";
  const desc = item.description || item.fileName || item.path || "No description";

  const isInherited = showInherited && item.scopeId === "global" && selectedScopeId !== "global";
  const inheritedBadge = isInherited ? `<span class="item-badge ib-global">Global</span>` : "";
  const actions = (item.locked || isInherited) ? "" : `
    <span class="item-actions">
      ${(canMoveItem(item) || item.locked) ? `<button type="button" class="act-btn act-move" data-action="move">Move</button>` : ""}
      <button type="button" class="act-btn act-open" data-action="open">Open</button>
      ${canDeleteItem(item) ? `<button type="button" class="act-btn act-del" data-action="delete">Del</button>` : ""}
    </span>`;

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
    <div class="item${item.locked ? " locked" : ""}${isSelected ? " selected" : ""}" data-item-key="${esc(key)}" data-path="${esc(item.path)}" data-category="${esc(item.category)}">
      ${dragHandle}
      ${checkbox}
      <span class="item-ico">${icon}</span>
      <span class="item-name">${esc(item.name)}</span>
      ${secBadgeHtml}${blFlagHtml}
      ${inheritedBadge}${badgeHtml}
      <span class="item-desc">${item.category === "mcp" ? "" : esc(desc)}</span>
      ${item.category === "mcp" ? "" : `<div class="item-right">
        <span class="item-size">${esc(sizeLabel)}</span>
        <span class="item-date">${esc(dateLabel)}</span>
      </div>`}
      ${actions}
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
  crumb.innerHTML = renderBreadcrumb(scope);
  scopeEl.textContent = scope ? capitalize(scope.name) : selectedItem.scopeId;
  type.innerHTML = renderBadge(selectedItem, true);
  desc.textContent = selectedItem.description || "—";
  size.textContent = selectedItem.size || "—";
  dates.innerHTML = `
    <div class="d-info-cell"><span class="d-info-label">Created</span><span class="d-info-val">${esc(formatShortDate(selectedItem.ctime) || "—")}</span></div>
    <div class="d-info-cell"><span class="d-info-label">Modified</span><span class="d-info-val">${esc(formatShortDate(selectedItem.mtime) || "—")}</span></div>`;
  path.textContent = selectedItem.path || "—";

  openBtn.disabled = false;
  moveBtn.disabled = false; // always enabled — locked items use CC prompt instead of API
  deleteBtn.disabled = !canDeleteItem(selectedItem);

  // CC Actions — contextual prompt buttons
  renderCcActions(selectedItem);

  if (resetPreview) {
    preview.textContent = "Loading...";
    detailPreviewKey = itemKey(selectedItem);
  }
}

function renderCcActions(item) {
  const container = document.getElementById("detailCcActions");
  const btnRow = document.getElementById("ccBtnRow");
  const buttons = [];

  const explainPrompt = `I have a Claude Code ${item.category} called "${item.name}" at:\n${item.path}\n\nPlease read this file and explain:\n1. What does this ${item.category} do?\n2. When does it get loaded / triggered?\n3. What would break if I removed or changed it?\n4. Are there any other files that depend on it?`;

  // Info line for unlocked items
  if (!item.locked && item.category !== "session") {
    buttons.push({ ico: "🤖", label: "", prompt: null, info: "Use these prompts for guided changes — Claude Code will read the file, explain the impact, and confirm before making changes." });
  }

  switch (item.category) {
    case "session": {
      const sessionId = (item.fileName || "").replace(".jsonl", "");
      if (sessionId) {
        const sessionScope = getScopeById(item.scopeId);
        const cdCmd = sessionScope?.repoDir ? `cd ${sessionScope.repoDir} && ` : "";
        buttons.push({ ico: "💡", label: "", prompt: null, info: "Sessions can be resumed directly in Claude Code. Copy the command below and paste it in any terminal to continue where you left off." });
        buttons.push({ ico: "💬", label: "Resume Session", prompt: `${cdCmd}claude --resume ${sessionId}\n\n# Session file: ${item.path}` });
        buttons.push({ ico: "📋", label: "Summarize", prompt: `I have a Claude Code session at:\n${item.path}\n\nPlease read this session file and give me a summary:\n1. What was this session about?\n2. What was accomplished?\n3. Were there any unfinished tasks or pending actions?\n4. What files were modified?` });
      }
      break;
    }
    case "memory":
      buttons.push({ ico: "📋", label: "Explain This", prompt: explainPrompt });
      buttons.push({ ico: "✏️", label: "Edit Content", prompt: `I want to edit this Claude Code memory: "${item.name}"\nPath: ${item.path}\nType: ${item.subType || "memory"}\n\nBefore editing:\n1. Read the current content\n2. Show me the current frontmatter (name, description, type) and body\n3. Ask me what I want to change\n4. Show the before vs after diff\n5. Only save after I confirm` });
      break;
    case "skill":
      buttons.push({ ico: "📋", label: "Explain This", prompt: explainPrompt });
      buttons.push({ ico: "✏️", label: "Edit Skill", prompt: `I want to edit this Claude Code skill: "${item.name}"\nPath: ${item.path}\n\nBefore editing:\n1. Read the SKILL.md content\n2. Explain what this skill does and when it triggers\n3. Ask me what I want to change\n4. Show the before vs after diff\n5. Warn if the change could affect how Claude Code invokes it\n6. Only save after I confirm` });
      break;
    case "mcp":
      buttons.push({ ico: "📋", label: "Explain This", prompt: `I have a Claude Code MCP server called "${item.name}" at:\n${item.path}\n\nPlease explain:\n1. What does this MCP server do?\n2. What tools does it provide?\n3. How is it configured (command, args, env)?\n4. Is it currently working? Check if the command exists on this system.` });
      buttons.push({ ico: "🔧", label: "Edit Config", prompt: `I want to modify this MCP server configuration: "${item.name}"\nPath: ${item.path}\n\nBefore changing:\n1. Read the current MCP config\n2. Show me the current command, args, and env settings\n3. Ask me what I want to change\n4. Show the before vs after diff\n5. Warn if this could break any tools that depend on this MCP server\n6. Only save after I confirm` });
      if (getSecuritySeverity(item.name) === "unreachable") {
        buttons.push({ ico: "🩺", label: "Fix Server", prompt: `My MCP server "${item.name}" is unreachable — it failed to connect during a security scan.\nConfig path: ${item.path}\nConfig: ${JSON.stringify(item.mcpConfig, null, 2)}\n\nPlease diagnose and fix:\n1. Check if the command exists: which ${item.mcpConfig?.command || "unknown"}\n2. If it's an npx package, check if it's installed: npm ls -g ${(item.mcpConfig?.args || [])[1] || ""}\n3. Check if required env vars are set\n4. Try running the server manually to see the error\n5. Suggest a fix (install package, set env var, fix config)\n6. Only make changes after I confirm` });
      }
      break;
    case "plan":
      buttons.push({ ico: "📋", label: "Explain This", prompt: explainPrompt });
      buttons.push({ ico: "▶️", label: "Continue Plan", prompt: `I have an existing Claude Code plan at:\n${item.path}\n\nPlease read this plan and:\n1. Summarize what the plan is about\n2. Show which steps are done and which are remaining\n3. Ask me if I want to continue from where it left off` });
      break;
    case "command":
      buttons.push({ ico: "📋", label: "Explain This", prompt: explainPrompt });
      buttons.push({ ico: "✏️", label: "Edit Command", prompt: `I want to edit this Claude Code command: "${item.name}"\nPath: ${item.path}\n\nBefore editing:\n1. Read the current content\n2. Explain what this command does and its argument format\n3. Ask me what I want to change\n4. Show the before vs after diff\n5. Only save after I confirm` });
      break;
    case "agent":
      buttons.push({ ico: "📋", label: "Explain This", prompt: explainPrompt });
      buttons.push({ ico: "✏️", label: "Edit Agent", prompt: `I want to edit this Claude Code agent: "${item.name}"\nPath: ${item.path}\n\nBefore editing:\n1. Read the current content\n2. Explain what this agent does, what tools it has, and what model it uses\n3. Ask me what I want to change\n4. Show the before vs after diff\n5. Only save after I confirm` });
      break;
    case "rule":
      buttons.push({ ico: "💡", label: "", prompt: null, info: "Rules enforce project-specific constraints. Use these prompts to understand or modify them." });
      buttons.push({ ico: "📋", label: "Explain This", prompt: `I have a Claude Code rule: "${item.name}"\nPath: ${item.path}\n\nPlease read this rule and explain:\n1. What constraint does it enforce?\n2. Why was it created?\n3. What would happen if it were removed?\n4. Are there any edge cases it doesn't cover?` });
      buttons.push({ ico: "✏️", label: "Modify", prompt: `I want to modify this Claude Code rule: "${item.name}"\nPath: ${item.path}\n\nBefore making any changes:\n1. Read the current content\n2. Explain the rule\n3. Ask me what I want to change\n4. Show the before vs after diff\n5. Warn if the change could weaken important constraints\n6. Only save after I confirm` });
      break;
    case "config":
      buttons.push({ ico: "💡", label: "", prompt: null, info: "Config files are managed by Claude Code. Use these prompts to ask Claude Code to help you understand or modify them." });
      buttons.push({ ico: "📋", label: "Explain This", prompt: `I have a Claude Code config file: "${item.name}"\nPath: ${item.path}\n\nPlease read it and explain:\n1. What does each setting do?\n2. Which settings are most important?\n3. Are there any settings that look unusual or could cause issues?` });
      buttons.push({ ico: "✏️", label: "Modify", prompt: `I want to modify this Claude Code config: "${item.name}"\nPath: ${item.path}\n\nBefore making any changes:\n1. Read the current content\n2. Explain what each setting does\n3. Ask me what I want to change\n4. Show exactly what will change (before vs after)\n5. Warn if the change could break anything\n6. Only apply after I confirm` });
      buttons.push({ ico: "🗑️", label: "Remove", prompt: `I want to remove this Claude Code config file: "${item.name}"\nPath: ${item.path}\n\n⚠️ This is a config file — removing it can significantly change how Claude Code behaves in this project.\n\nBefore doing ANYTHING:\n1. Read the entire file and explain what it is — is this CLAUDE.md (project instructions), settings.json (project settings), or settings.local.json (local overrides)?\n2. Explain in plain language what EVERY setting/instruction in this file does\n3. Explain exactly what will change after removal:\n   - If CLAUDE.md: all project-specific instructions, coding conventions, and custom rules will be lost. Claude Code will behave generically.\n   - If settings.json: project-level permission overrides, model preferences, and tool settings will revert to defaults.\n   - If settings.local.json: local environment overrides (API keys, personal preferences) will be lost.\n4. List everything that depends on or references this file\n5. Ask me: "Are you sure you want to remove this? Here is what you will lose: [list]. Type YES to confirm."\n6. Only remove after I type YES — do not proceed on any other response` });
      break;
    case "hook":
      buttons.push({ ico: "💡", label: "", prompt: null, info: "Hooks run automatically on Claude Code events. Use these prompts to understand or modify them safely." });
      buttons.push({ ico: "📋", label: "Explain This", prompt: `I have a Claude Code hook: "${item.name}"\nPath: ${item.path}\n\nPlease explain:\n1. What event triggers this hook?\n2. What does the hook script do?\n3. What would happen if I disabled or removed it?\n4. Is the hook script working correctly? Check if the script exists and is executable.` });
      buttons.push({ ico: "✏️", label: "Modify", prompt: `I want to modify this Claude Code hook: "${item.name}"\nPath: ${item.path}\n\nBefore changing:\n1. Read the hook config and the script it runs\n2. Explain when it triggers and what it does\n3. Ask me what I want to change\n4. Show the before vs after diff\n5. Warn about any side effects (e.g. breaking pre-commit checks)\n6. Only apply after I confirm` });
      buttons.push({ ico: "🗑️", label: "Remove", prompt: `I want to remove this Claude Code hook: "${item.name}"\nPath: ${item.path}\n\nBefore removing:\n1. Read the hook and explain what it does\n2. Tell me what behavior will stop after removal\n3. Check if other hooks or configs depend on it\n4. Only remove after I explicitly confirm` });
      break;
    case "plugin":
      buttons.push({ ico: "💡", label: "", prompt: null, info: "Plugins extend Claude Code's capabilities. Use these prompts to understand or manage them." });
      buttons.push({ ico: "📋", label: "Explain This", prompt: `I have a Claude Code plugin: "${item.name}"\nPath: ${item.path}\n\nPlease explain:\n1. What does this plugin do?\n2. What features or commands does it add?\n3. Is it actively loaded by Claude Code?\n4. What would change if I removed it?` });
      buttons.push({ ico: "🗑️", label: "Remove", prompt: `I want to remove this Claude Code plugin: "${item.name}"\nPath: ${item.path}\n\nBefore removing:\n1. Explain what features this plugin provides\n2. Check if any skills, hooks, or configs reference it\n3. Tell me what will stop working after removal\n4. Only remove after I explicitly confirm` });
      break;
    default:
      buttons.push({ ico: "📋", label: "Explain This", prompt: explainPrompt });
      break;
  }

  if (buttons.length === 0) {
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");
  btnRow.innerHTML = buttons.map((btn) => {
    if (btn.info) {
      return `<div class="cc-info"><span class="cc-ico">${btn.ico}</span>${esc(btn.info)}</div>`;
    }
    return `<button type="button" class="cc-btn" data-prompt="${esc(btn.prompt)}"><span class="cc-ico">${btn.ico}</span>${esc(btn.label)}</button>`;
  }).join("");
}

function setupCcActions() {
  document.getElementById("detailCcActions").addEventListener("click", (event) => {
    const btn = event.target.closest(".cc-btn");
    if (!btn) return;
    const prompt = btn.dataset.prompt;
    navigator.clipboard.writeText(prompt).then(() => {
      const orig = btn.innerHTML;
      const isResume = prompt.startsWith("claude --resume");
      const msg = isResume ? "Copied! Paste in a new terminal" : "Copied! Paste to Claude Code";
      btn.innerHTML = `<span class="cc-ico">✅</span>${msg}`;
      setTimeout(() => { btn.innerHTML = orig; }, 2500);
    });
  });
}

function setupExport() {
  const btn = document.getElementById("exportBtn");
  let exporting = false;

  btn.addEventListener("click", async () => {
    if (exporting) return;
    exporting = true;
    btn.textContent = "📦 Exporting...";
    try {
      const raw = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exportDir: null }), // server uses default ~/.claude/exports/
      });
      const res = await raw.json();
      if (res.ok) {
        toast(`${res.copied} items exported to ${res.path}`, false, null, true);
      } else {
        toast(res.error || "Export failed", true);
      }
    } catch {
      toast("Export failed", true);
    }
    exporting = false;
    btn.textContent = "📦 Export All";
  });
}

function setupContextBudget() {
  document.getElementById("ctxBudgetBtn").addEventListener("click", () => {
    if (!selectedScopeId) {
      toast("Select a scope first", true);
      return;
    }
    openContextBudget(selectedScopeId);
  });

  document.getElementById("ctxBudgetClose").addEventListener("click", closeContextBudget);

  document.getElementById("inheritToggleBtn")?.addEventListener("click", () => {
    const scope = getScopeById(selectedScopeId);
    if (!scope || scope.id === "global") return;
    showInherited = !showInherited;
    document.getElementById("inheritToggleBtn").classList.toggle("active", showInherited);
    renderAll();
  });
}

function openContextBudget(scopeId) {
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

  for (const cat of CATEGORY_ORDER) {
    const catItems = byCategory[cat];
    if (!catItems) continue;
    const catInfo = CATEGORIES[cat] || { icon: "📄", label: cat };
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
        const catInfo = CATEGORIES[item.category] || { icon: "📄" };
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
  for (const cat of CATEGORY_ORDER) {
    const catItems = byCategory[cat];
    if (!catItems) continue;
    const catInfo = CATEGORIES[cat] || { icon: "📄", label: cat };
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
    const icon = SCOPE_ICONS[entry.type] || "📂";
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

function setupScopeDropZones() {
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
      // Locked item — generate CC prompt
      const destScope = getScopeById(scopeId);
      const fromScope = getScopeById(item.scopeId);
      const prompt = `I want to move this Claude Code ${item.category} to a different scope.\n\nItem: "${item.name}"\nCurrent path: ${item.path}\nFrom scope: ${fromScope?.name || item.scopeId}\nMove to scope: ${destScope?.name || scopeId}\n\nBefore moving:\n1. Read the file and understand what it does\n2. Determine the correct destination path for the "${destScope?.name || scopeId}" scope\n3. Check if a ${item.category} with the same name already exists at the destination\n4. Explain what will change — which projects will gain or lose access to this ${item.category}\n5. Warn me about any potential conflicts or breaking changes\n6. Only move the file after I confirm`;
      navigator.clipboard.writeText(prompt).then(() => {
        toast("Move prompt copied! Paste to Claude Code in your terminal.");
      });
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
    if (item.category === "mcp") {
      if (currentKey !== detailPreviewKey) return;
      preview.textContent = JSON.stringify(item.mcpConfig || {}, null, 2);
      return;
    }

    if (item.category === "hook") {
      const res = await fetchJson(`/api/file-content?path=${encodeURIComponent(item.path)}`);
      if (currentKey !== detailPreviewKey) return;
      if (res.ok) {
        const settings = JSON.parse(res.content);
        const hookConfig = settings.hooks?.[item.name];
        preview.textContent = hookConfig ? JSON.stringify(hookConfig, null, 2) : (item.description || "(no content)");
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

    if (item.category === "session") {
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
    preview.textContent = res.ok ? res.content : (res.error || "Cannot load preview");
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
  const fromIcon = SCOPE_ICONS[fromScope?.type] || "📂";
  const toIcon = SCOPE_ICONS[toScope?.type] || "📂";

  document.getElementById("dcPreview").innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <span style="font-size:1.1rem;">${ITEM_ICONS[item.category] || "📄"}</span>
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

  document.getElementById("dragConfirmModal").classList.remove("hidden");
}

function openDeleteModal(item) {
  pendingDelete = item;
  const scope = getScopeById(item.scopeId);

  document.getElementById("deletePreview").innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <span style="font-size:1.1rem;">${ITEM_ICONS[item.category] || "📄"}</span>
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
      // Locked item — generate CC prompt instead of API call
      const destScope = getScopeById(selectedDest);
      const destName = destScope?.name || selectedDest;
      const prompt = `I want to move this Claude Code ${item.category} to a different scope.\n\nItem: "${item.name}"\nCurrent path: ${item.path}\nMove to scope: ${destName}\n\nBefore moving:\n1. Read the file and understand what it does\n2. Determine the correct destination path for the "${destName}" scope\n3. Check if a ${item.category} with the same name already exists at the destination\n4. Explain what will change — which projects will gain or lose access to this ${item.category}\n5. Warn me about any potential conflicts or breaking changes\n6. Only move the file after I confirm`;
      navigator.clipboard.writeText(prompt).then(() => {
        toast("Move prompt copied! Paste to Claude Code in your terminal.");
      });
    } else {
      await doMove(item, selectedDest);
    }
  };

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
  const icon = scope.id === "global" ? "🌐" : (SCOPE_ICONS[scope.type] || "📂");
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
  const response = await fetch("/api/move", {
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
      const undoResult = await fetch("/api/move", {
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

  const response = await fetch("/api/delete", {
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
        const restoreResult = await fetch("/api/restore-mcp", {
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
        const restoreResult = await fetch("/api/restore", {
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
  for (const category of CATEGORY_ORDER) counts.set(category, 0);

  for (const item of getItemsForScope(scopeId)) {
    if (searchQuery && !itemMatchesSearch(item)) continue;
    counts.set(item.category, (counts.get(item.category) || 0) + 1);
  }

  return CATEGORY_ORDER
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

function getVisibleItemsForScope(scopeId) {
  const ownItems = getItemsForScope(scopeId).filter((item) => itemVisibleInMain(item));
  if (!showInherited || scopeId === "global") return ownItems;
  const globalItems = getItemsForScope("global").filter((item) => itemMatchesFilters(item) && itemMatchesSearch(item));
  return [...ownItems, ...globalItems];
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

  let sorted = [...items];

  // Default sort for sessions: newest first
  if (!sortState && category === "session") {
    return sorted.sort((a, b) => (b.mtime || "").localeCompare(a.mtime || ""));
  }

  // Default sort for memory: by subType then name
  if (!sortState && category === "memory") {
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
  return !item.locked && ["memory", "skill", "mcp", "plan", "command", "agent", "rule"].includes(item.category);
}

function canDeleteItem(item) {
  return !item.locked;
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
    const roleLabel = isUser ? "You" : "Claude";
    const avatar = isUser ? "U" : "C";

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

    const resp = await fetch("/api/security-scan", { method: "POST" });
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
      scanBtn.classList.add("sec-btn-alert");
      scanBtn.querySelector(".sec-btn-tooltip")?.remove();
      const tip = document.createElement("span");
      tip.className = "sec-btn-tooltip";
      tip.textContent = `${changedCount} MCP server${changedCount > 1 ? "s" : ""} changed — click to rescan`;
      scanBtn.appendChild(tip);
      renderAll(); // re-render to show CHANGED badges
    } else if (scanBtn) {
      // All clear — remove shimmer + tooltip + re-render to clear badges
      scanBtn.classList.remove("sec-btn-alert");
      scanBtn.querySelector(".sec-btn-tooltip")?.remove();
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
        html += `<div class="sec-finding-row" data-sec-server="${esc(server)}" data-sec-scope="${esc(scopeId)}">`;
        html += `<span class="sec-badge ${bc}" style="font-size:9px;padding:0 4px">${esc(f.severity.charAt(0).toUpperCase())}</span>`;
        html += `<span class="sec-finding-label">${esc(f.name)}${countLabel}</span>`;
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

/** Save security scan results to server for persistence across sessions. */
function saveSecurityResults(scanData) {
  fetch("/api/security-cache", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scanData),
  }).catch(() => {}); // Fire and forget
}

/** Load cached security scan results from server on startup. */
async function loadCachedSecurityResults() {
  try {
    const resp = await fetch("/api/security-cache");
    const cached = await resp.json();
    if (!cached.ok || !cached.data) return;

    securityScanResults = cached.data;

    // Rebuild badge map (don't reset baselineStatus — checkForNewMcpServers may have set it)
    securityBadges = {};
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
    for (const b of (cached.data.baselines || [])) {
      if (b.isFirstScan) securityBaselineStatus[b.serverName] = "new";
      else if (b.hasChanges) securityBaselineStatus[b.serverName] = "changed";
    }

    // Hide intro (results will render when user opens security panel)
    const intro = document.getElementById("securityIntro");
    if (intro) intro.classList.add("hidden");

    // Check baselines for changes → pulse the sidebar button
    const hasChanges = (cached.data.baselines || []).some(b => b.hasChanges && !b.isFirstScan);
    if (hasChanges) {
      const btn = document.getElementById("securityScanBtn");
      if (btn) {
        btn.classList.add("sec-btn-alert");
        if (!btn.querySelector(".sec-btn-tooltip")) {
          const tip = document.createElement("span");
          tip.className = "sec-btn-tooltip";
          tip.textContent = "MCP servers changed since last scan — click to rescan";
          btn.appendChild(tip);
        }
      }
    }
  } catch {}
}

/** Check for new MCP servers on startup (no scan needed, just compare names against baselines). */
async function checkForNewMcpServers() {
  try {
    const resp = await fetch("/api/security-baseline-check");
    const result = await resp.json();
    if (!result.ok) return;

    // Mark new servers in baseline status map
    for (const name of (result.newServers || [])) {
      securityBaselineStatus[name] = "new";
    }

    // If there are new servers, shimmer the sidebar button + add tooltip
    if (result.newServers?.length > 0) {
      const btn = document.getElementById("securityScanBtn");
      if (btn) {
        btn.classList.add("sec-btn-alert");
        // Add tooltip if not already present
        if (!btn.querySelector(".sec-btn-tooltip")) {
          const tip = document.createElement("span");
          tip.className = "sec-btn-tooltip";
          tip.textContent = `${result.newServers.length} new MCP server${result.newServers.length > 1 ? "s" : ""} detected — click to scan`;
          btn.appendChild(tip);
        }
      }
    }
  } catch {}
}

init();
