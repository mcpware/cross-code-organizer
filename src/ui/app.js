/**
 * app.js — Frontend logic for Claude Code Organizer.
 *
 * Fetches data from /api/scan, renders the scope tree,
 * handles drag-and-drop (SortableJS), search, filter, detail panel.
 *
 * All DOM rendering is here. Change index.html for structure,
 * style.css for appearance, this file for behavior.
 */

// ── State ────────────────────────────────────────────────────────────

let data = null;         // { scopes, items, counts }
let activeFilters = new Set(); // empty = show all, or set of "memory", "skill", "mcp", etc.
let selectedItem = null; // currently selected item object
let pendingDrag = null;  // { item, fromScopeId, toScopeId, revertFn }
let pendingDelete = null; // item to delete
let draggingItem = null; // item currently being dragged
let expandState = { scopes: new Set(), cats: new Set() }; // track expanded sections
let bulkSelected = new Set(); // paths of selected items for bulk ops

// ── Category config ──────────────────────────────────────────────────

const CATEGORIES = {
  config:  { icon: "⚙️", label: "CONFIG",      group: null },
  memory:  { icon: "🧠", label: "MEMORIES",    group: "memory" },
  skill:   { icon: "⚡", label: "SKILLS",      group: "skill" },
  mcp:     { icon: "🔌", label: "MCP SERVERS", group: "mcp" },
  hook:    { icon: "🪝", label: "HOOKS",       group: null },
  plugin:  { icon: "🧩", label: "PLUGINS",     group: null },
  plan:    { icon: "📐", label: "PLANS",       group: null },
  session: { icon: "💬", label: "SESSIONS",    group: null },
};

const ITEM_ICONS = {
  memory: "🧠", skill: "⚡", mcp: "🔌", config: "⚙️",
  hook: "🪝", plugin: "🧩", plan: "📐", session: "💬",
};

const SCOPE_ICONS = { global: "🌐", workspace: "📂", project: "📂" };

// ── Init ─────────────────────────────────────────────────────────────

async function init() {
  data = await fetchJson("/api/scan");
  document.getElementById("loading").style.display = "none";
  renderPills();
  renderTree();
  setupSearch();
  setupDetailPanel();
  setupModals();
  setupBulkBar();
  setupScopeDropZones();
  setupExpandToggle();
}

async function fetchJson(url) {
  const res = await fetch(url);
  return res.json();
}

// ── Pills (filter tabs with counts) ──────────────────────────────────

function renderPills() {
  const el = document.getElementById("pills");
  const pills = [
    { key: "all", label: "All", count: data.counts.total },
    { key: "memory", label: "🧠 Memory", count: data.counts.memory || 0 },
    { key: "skill", label: "⚡ Skills", count: data.counts.skill || 0 },
    { key: "mcp", label: "🔌 MCP", count: data.counts.mcp || 0 },
    { key: "config", label: "⚙️ Config", count: data.counts.config || 0 },
    { key: "hook", label: "🪝 Hooks", count: data.counts.hook || 0 },
    { key: "plugin", label: "🧩 Plugins", count: data.counts.plugin || 0 },
    { key: "plan", label: "📐 Plans", count: data.counts.plan || 0 },
    { key: "session", label: "💬 Sessions", count: data.counts.session || 0 },
  ];

  // "All" is active when no filters selected
  const allActive = activeFilters.size === 0;

  el.innerHTML = pills.map(p => {
    const isActive = p.key === "all" ? allActive : activeFilters.has(p.key);
    return `<span class="pill${isActive ? ' active' : ''}" data-filter="${p.key}">${p.label} <b>${p.count}</b></span>`;
  }).join("");

  el.querySelectorAll(".pill").forEach(pill => {
    pill.addEventListener("click", () => {
      const key = pill.dataset.filter;
      if (key === "all") {
        // Clear all filters → show everything
        activeFilters.clear();
      } else {
        // Toggle this filter
        if (activeFilters.has(key)) {
          activeFilters.delete(key);
        } else {
          activeFilters.add(key);
        }
      }
      // Re-render pill states
      const allNow = activeFilters.size === 0;
      el.querySelectorAll(".pill").forEach(p => {
        const k = p.dataset.filter;
        p.classList.toggle("active", k === "all" ? allNow : activeFilters.has(k));
      });
      applyFilter();
    });
  });
}

function applyFilter() {
  const hasFilter = activeFilters.size > 0;
  document.querySelectorAll(".cat-hdr").forEach(hdr => {
    const cat = hdr.dataset.cat;
    const show = !hasFilter || activeFilters.has(cat);
    hdr.style.display = show ? "" : "none";
    const body = hdr.nextElementSibling;
    if (body) body.style.display = show ? "" : "none";
  });
}

// ── Tree rendering ───────────────────────────────────────────────────

function renderTree() {
  const treeEl = document.getElementById("tree");
  const rootScopes = data.scopes.filter(s => s.parentId === null);

  let html = "";

  // Render from root — renderScope recursively handles children
  for (const scope of rootScopes) {
    html += renderScope(scope, 0);
  }

  treeEl.innerHTML = html;
  initSortable();
}

function renderScope(scope, depth) {
  const items = data.items.filter(i => i.scopeId === scope.id);
  const childScopes = data.scopes.filter(s => s.parentId === scope.id);
  const totalCount = items.length + childScopes.reduce((sum, cs) =>
    sum + data.items.filter(i => i.scopeId === cs.id).length, 0
  );

  const icon = SCOPE_ICONS[scope.type] || "📂";
  const tagClass = `tag-${scope.type}`;

  // Build inheritance pills (inline in header)
  let inheritHtml = "";
  if (scope.parentId) {
    const chain = getScopeChain(scope);
    if (chain.length > 0) {
      const pills = chain.map(s =>
        `<span class="inherit-pill">${SCOPE_ICONS[s.type] || "📂"} ${esc(s.name)}</span>`
      ).join(" ");
      inheritHtml = `<span class="scope-inherit" title="Inherits from ${chain.map(s => s.name).join(' → ')}"><span class="inherit-arrow">↳</span> ${pills}</span>`;
    }
  }

  // Group items by category
  const categories = {};
  for (const item of items) {
    (categories[item.category] ??= []).push(item);
  }

  // Sort memory items: feedback last, then alphabetical within each subType
  if (categories.memory) {
    const subTypeOrder = { project: 0, reference: 1, user: 2, feedback: 3 };
    categories.memory.sort((a, b) => {
      const oa = subTypeOrder[a.subType] ?? 2;
      const ob = subTypeOrder[b.subType] ?? 2;
      if (oa !== ob) return oa - ob;
      return a.name.localeCompare(b.name);
    });
  }

  // Count sub-projects
  const subInfo = childScopes.length > 0 ? `${childScopes.length} sub-projects` : "";

  let html = `
    <div class="scope-block">
      <div class="scope-hdr" data-scope-id="${esc(scope.id)}">
        <span class="scope-tog">▼</span>
        <span class="scope-ico">${icon}</span>
        <span class="scope-nm">${esc(scope.name)}</span>
        <span class="scope-tag ${tagClass}">${esc(scope.tag)}</span>
        ${inheritHtml}
        <span class="scope-info">${esc(subInfo)}</span>
        <span class="scope-cnt">${totalCount}</span>
      </div>
      <div class="scope-body">`;

  // Render each category
  for (const [cat, catItems] of Object.entries(categories)) {
    const catConfig = CATEGORIES[cat] || { icon: "📄", label: cat.toUpperCase(), group: null };

    // Skills: group by bundle if any items have bundle info
    if (cat === "skill") {
      const bundled = {};   // source → items[]
      const unbundled = []; // items without bundle
      for (const item of catItems) {
        if (item.bundle) {
          (bundled[item.bundle] ??= []).push(item);
        } else {
          unbundled.push(item);
        }
      }

      const hasBundles = Object.keys(bundled).length > 0;

      html += `
        <div class="cat-hdr" data-cat="${esc(cat)}">
          <span class="cat-tog">▼</span>
          <span class="cat-ico">${catConfig.icon}</span>
          <span class="cat-nm">${catConfig.label}</span>
          <span class="cat-cnt">${catItems.length}</span>
        </div>
        <div class="cat-body" data-cat="${esc(cat)}">`;

      // Render each bundle as a collapsible sub-group
      for (const [source, bundleItems] of Object.entries(bundled)) {
        const bundleName = source.split("/").pop(); // "pbakaus/impeccable" → "impeccable"
        const bundleLabel = source; // full "owner/repo"
        html += `
          <div class="bundle-hdr" data-bundle="${esc(source)}">
            <span class="bundle-tog">▼</span>
            <span class="bundle-ico">📦</span>
            <span class="bundle-nm">${esc(bundleName)}</span>
            <span class="bundle-src">${esc(bundleLabel)}</span>
            <span class="bundle-cnt">${bundleItems.length}</span>
          </div>
          <div class="bundle-body" data-bundle="${esc(source)}">
            <div class="sortable-zone" data-scope="${esc(scope.id)}" data-group="${catConfig.group || 'none'}">
              ${bundleItems.map(item => renderItem(item)).join("")}
            </div>
          </div>`;
      }

      // Render unbundled skills flat (no group header)
      if (unbundled.length > 0) {
        html += `
          <div class="sortable-zone" data-scope="${esc(scope.id)}" data-group="${catConfig.group || 'none'}">
            ${unbundled.map(item => renderItem(item)).join("")}
          </div>`;
      }

      html += `</div>`;
    } else {
      // Non-skill categories: render flat as before
      html += `
        <div class="cat-hdr" data-cat="${esc(cat)}">
          <span class="cat-tog">▼</span>
          <span class="cat-ico">${catConfig.icon}</span>
          <span class="cat-nm">${catConfig.label}</span>
          <span class="cat-cnt">${catItems.length}</span>
        </div>
        <div class="cat-body" data-cat="${esc(cat)}">
          <div class="sortable-zone" data-scope="${esc(scope.id)}" data-group="${catConfig.group || 'none'}">
            ${catItems.map(item => renderItem(item)).join("")}
          </div>
        </div>`;
    }
  }

  // Render child scopes
  if (childScopes.length > 0) {
    html += `<div class="child-scopes">`;
    for (const child of childScopes) {
      html += renderScope(child, depth + 1);
    }
    html += `</div>`;
  }

  html += `</div></div>`;
  return html;
}

function renderItem(item) {
  const icon = ITEM_ICONS[item.category] || "📄";
  const locked = item.locked ? " locked" : "";
  const badgeClass = `b-${item.subType || item.category}`;
  const checked = bulkSelected.has(item.path) ? " checked" : "";

  const checkbox = item.locked ? "" : `<input type="checkbox" class="row-chk" data-path="${esc(item.path)}"${checked}>`;

  const moveBtn = (item.locked || item.deletable) ? "" : `<button class="rbtn" data-action="move">Move</button>`;
  const actions = item.locked ? "" : `
    <span class="row-acts">
      ${moveBtn}
      <button class="rbtn" data-action="open">Open</button>
      <button class="rbtn rbtn-danger" data-action="delete">Delete</button>
    </span>`;

  return `
    <div class="item-row${locked}" data-path="${esc(item.path)}" data-category="${item.category}" data-name="${esc(item.name)}">
      ${checkbox}
      <span class="row-ico">${icon}</span>
      <span class="row-name">${esc(item.name)}</span>
      <span class="row-badge ${badgeClass}">${esc(item.subType || item.category)}</span>
      <span class="row-desc">${esc(item.description)}</span>
      <span class="row-meta">${esc(item.size)}${item.fileCount ? ` · ${item.fileCount} files` : ""}</span>
      ${actions}
    </div>`;
}

function getScopeChain(scope) {
  const chain = [];
  let current = scope;
  while (current.parentId) {
    const parent = data.scopes.find(s => s.id === current.parentId);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── SortableJS init ──────────────────────────────────────────────────

function saveExpandState() {
  expandState.scopes.clear();
  expandState.cats.clear();
  document.querySelectorAll(".scope-hdr").forEach(hdr => {
    const body = hdr.nextElementSibling;
    if (body && !body.classList.contains("c")) {
      expandState.scopes.add(hdr.dataset.scopeId);
    }
  });
  document.querySelectorAll(".cat-hdr").forEach(hdr => {
    const body = hdr.nextElementSibling;
    const scopeId = hdr.closest(".scope-block")?.querySelector(".scope-hdr")?.dataset.scopeId || "";
    const catKey = `${scopeId}::${hdr.dataset.cat}`;
    if (body && !body.classList.contains("c")) {
      expandState.cats.add(catKey);
    }
  });
  // Save bundle expand state
  document.querySelectorAll(".bundle-hdr").forEach(hdr => {
    const body = hdr.nextElementSibling;
    const scopeId = hdr.closest(".scope-block")?.querySelector(".scope-hdr")?.dataset.scopeId || "";
    const bundleKey = `${scopeId}::bundle::${hdr.dataset.bundle}`;
    if (body && !body.classList.contains("c")) {
      expandState.cats.add(bundleKey);
    }
  });
}

function restoreExpandState() {
  // Scopes default open — collapse those NOT in saved state (only if we have saved state)
  const hasSavedState = expandState.scopes.size > 0 || expandState.cats.size > 0;
  document.querySelectorAll(".scope-hdr").forEach(hdr => {
    const body = hdr.nextElementSibling;
    const tog = hdr.querySelector(".scope-tog");
    if (hasSavedState && !expandState.scopes.has(hdr.dataset.scopeId)) {
      body?.classList.add("c");
      tog?.classList.add("c");
    }
  });

  // Categories default collapsed — expand those in saved state
  document.querySelectorAll(".cat-hdr").forEach(hdr => {
    const body = hdr.nextElementSibling;
    const tog = hdr.querySelector(".cat-tog");
    const scopeId = hdr.closest(".scope-block")?.querySelector(".scope-hdr")?.dataset.scopeId || "";
    const catKey = `${scopeId}::${hdr.dataset.cat}`;

    if (expandState.cats.has(catKey)) {
      body?.classList.remove("c");
      tog?.classList.remove("c");
    } else {
      body?.classList.add("c");
      tog?.classList.add("c");
    }
  });
}

function initSortable() {
  document.querySelectorAll(".sortable-zone").forEach(el => {
    const group = el.dataset.group;
    if (!group || group === "none") return;

    Sortable.create(el, {
      group,
      animation: 150,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      draggable: ".item-row:not(.locked)",
      fallbackOnBody: true,
      scroll: document.querySelector(".tree-area"),
      scrollSensitivity: 100,
      scrollSpeed: 15,
      bubbleScroll: true,
      onStart(evt) {
        const itemPath = evt.item.dataset.path;
        draggingItem = data.items.find(i => i.path === itemPath);
      },
      onEnd(evt) {
        draggingItem = null;
        // Remove all drop-target highlights
        document.querySelectorAll(".scope-block.drop-target").forEach(b => b.classList.remove("drop-target"));

        if (evt.from === evt.to) return;

        const itemEl = evt.item;
        const itemPath = itemEl.dataset.path;
        const item = data.items.find(i => i.path === itemPath);
        if (!item) return;

        const fromScopeId = evt.from.dataset.scope;
        const toScopeId = evt.to.dataset.scope;
        const fromScope = data.scopes.find(s => s.id === fromScopeId);
        const toScope = data.scopes.find(s => s.id === toScopeId);

        const oldParent = evt.from;
        const oldIndex = evt.oldIndex;
        const revertFn = () => {
          if (oldIndex >= oldParent.children.length) oldParent.appendChild(itemEl);
          else oldParent.insertBefore(itemEl, oldParent.children[oldIndex]);
        };

        pendingDrag = { item, fromScopeId, toScopeId, revertFn };
        showDragConfirm(item, fromScope, toScope);
      }
    });
  });

  // Scope header toggle — default OPEN
  document.querySelectorAll(".scope-hdr").forEach(hdr => {
    hdr.addEventListener("click", () => {
      const body = hdr.nextElementSibling;
      const tog = hdr.querySelector(".scope-tog");
      body.classList.toggle("c");
      tog.classList.toggle("c");
    });
  });

  // Category toggle — restore state or default collapsed
  restoreExpandState();

  document.querySelectorAll(".cat-hdr").forEach(hdr => {
    hdr.addEventListener("click", () => {
      const body = hdr.nextElementSibling;
      const tog = hdr.querySelector(".cat-tog");
      body.classList.toggle("c");
      tog.classList.toggle("c");
    });
  });

  // Bundle toggle — default collapsed
  document.querySelectorAll(".bundle-hdr").forEach(hdr => {
    const body = hdr.nextElementSibling;
    const tog = hdr.querySelector(".bundle-tog");
    // Default collapsed
    const scopeId = hdr.closest(".scope-block")?.querySelector(".scope-hdr")?.dataset.scopeId || "";
    const bundleKey = `${scopeId}::bundle::${hdr.dataset.bundle}`;
    if (!expandState.cats.has(bundleKey)) {
      body?.classList.add("c");
      tog?.classList.add("c");
    }
    hdr.addEventListener("click", (e) => {
      e.stopPropagation();
      body.classList.toggle("c");
      tog.classList.toggle("c");
    });
  });

  // Helper: find item from row using path + category + name (handles items sharing same path, e.g. hooks vs config)
  function findItemFromRow(row) {
    const path = row.dataset.path;
    const category = row.dataset.category;
    const name = row.dataset.name;
    return data.items.find(i => i.path === path && i.category === category && i.name === name)
      || data.items.find(i => i.path === path && i.category === category)
      || data.items.find(i => i.path === path);
  }

  // Item click → detail panel
  document.querySelectorAll(".item-row").forEach(row => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".rbtn")) return;
      const item = findItemFromRow(row);
      if (item) showDetail(item, row);
    });
  });

  // Item action buttons
  document.querySelectorAll(".rbtn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const row = btn.closest(".item-row");
      const item = findItemFromRow(row);
      if (!item) return;

      if (btn.dataset.action === "move") {
        selectedItem = item;
        openMoveModal(item);
      } else if (btn.dataset.action === "open") {
        window.open(`vscode://file${item.path}`, "_blank");
      } else if (btn.dataset.action === "delete") {
        openDeleteModal(item);
      }
    });
  });

  // Checkbox handlers for bulk select
  document.querySelectorAll(".row-chk").forEach(chk => {
    chk.addEventListener("change", (e) => {
      e.stopPropagation();
      const path = chk.dataset.path;
      if (chk.checked) bulkSelected.add(path);
      else bulkSelected.delete(path);
      updateBulkBar();
    });
    chk.addEventListener("click", (e) => e.stopPropagation());
  });
}

// ── Bulk operations ─────────────────────────────────────────────────

function updateBulkBar() {
  const bar = document.getElementById("bulkBar");
  if (bulkSelected.size === 0) {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  document.getElementById("bulkCount").textContent = `${bulkSelected.size} selected`;
}

function setupBulkBar() {
  document.getElementById("bulkClear").addEventListener("click", () => {
    bulkSelected.clear();
    document.querySelectorAll(".row-chk").forEach(c => c.checked = false);
    updateBulkBar();
  });

  document.getElementById("bulkDelete").addEventListener("click", async () => {
    if (bulkSelected.size === 0) return;
    const count = bulkSelected.size;
    const paths = [...bulkSelected];

    // Confirm
    if (!confirm(`Delete ${count} item(s)? This cannot be undone.`)) return;

    let ok = 0, fail = 0;
    for (const p of paths) {
      const result = await doDelete(p, true); // true = skip refresh
      if (result.ok) ok++;
      else fail++;
    }

    bulkSelected.clear();
    await refreshUI();
    toast(`Deleted ${ok} item(s)${fail ? `, ${fail} failed` : ""}`);
  });

  document.getElementById("bulkMove").addEventListener("click", async () => {
    if (bulkSelected.size === 0) return;
    const paths = [...bulkSelected];

    // All selected items must be same category for move
    const items = paths.map(p => data.items.find(i => i.path === p)).filter(Boolean);
    const categories = new Set(items.map(i => i.category));
    if (categories.size > 1) {
      return toast("Cannot bulk-move items of different types", true);
    }

    // Only memory, skill, mcp can be moved
    const movableCategories = new Set(["memory", "skill", "mcp"]);
    const nonMovable = items.filter(i => !movableCategories.has(i.category));
    if (nonMovable.length > 0) {
      return toast(`${nonMovable[0].category} items cannot be moved`, true);
    }

    // Use first item to get destinations, then move all
    openBulkMoveModal(items);
  });
}

async function openBulkMoveModal(items) {
  const first = items[0];
  const res = await fetchJson(`/api/destinations?path=${encodeURIComponent(first.path)}&category=${encodeURIComponent(first.category)}&name=${encodeURIComponent(first.name)}`);
  if (!res.ok) return toast(res.error, true);

  const listEl = document.getElementById("moveDestList");
  // Include current scope (grayed out) so tree hierarchy builds correctly
  const currentScope = data.scopes.find(s => s.id === res.currentScopeId);
  const allScopes = currentScope
    ? [...res.destinations, { ...currentScope, isCurrent: true }]
    : res.destinations;

  const allScopeMap = {};
  for (const s of data.scopes) allScopeMap[s.id] = s;
  for (const s of allScopes) allScopeMap[s.id] = s;

  function getDepth(scope) {
    let depth = 0, cur = scope;
    while (cur.parentId) { depth++; cur = allScopeMap[cur.parentId] || { parentId: null }; }
    return depth;
  }

  // Sort then build tree order
  allScopes.sort((a, b) => {
    const da = getDepth(a), db = getDepth(b);
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  });

  const ordered = [];
  function addWithChildren(parentId) {
    for (const s of allScopes) {
      if ((s.parentId || null) === parentId) { ordered.push(s); addWithChildren(s.id); }
    }
  }
  addWithChildren(null);

  listEl.innerHTML = ordered.map(scope => {
    const depth = getDepth(scope);
    const indentPx = depth > 0 ? ` style="padding-left:${depth * 28}px"` : "";
    const icon = scope.id === "global" ? "🌐" : (SCOPE_ICONS[scope.type] || "📂");
    const curClass = scope.isCurrent ? " cur" : "";
    const curLabel = scope.isCurrent ? ' <span style="font-size:0.6rem;color:var(--text-faint);margin-left:4px;">(current)</span>' : "";
    return `<div class="dest${curClass}" data-scope-id="${esc(scope.id)}"${indentPx}>
      <span class="di">${icon}</span>
      <span class="dn">${esc(scope.name)}${curLabel}</span>
      <span class="dp">${esc(scope.tag)}</span>
    </div>`;
  }).join("");

  let selectedDest = null;
  listEl.querySelectorAll(".dest").forEach(d => {
    d.addEventListener("click", () => {
      listEl.querySelectorAll(".dest").forEach(x => x.classList.remove("sel"));
      d.classList.add("sel");
      selectedDest = d.dataset.scopeId;
      document.getElementById("moveConfirm").disabled = false;
    });
  });

  document.getElementById("moveConfirm").disabled = true;
  document.getElementById("moveConfirm").onclick = async () => {
    if (!selectedDest) return;
    closeMoveModal();
    let ok = 0, fail = 0;
    for (const item of items) {
      const result = await doMove(item.path, selectedDest, true); // true = skip refresh
      if (result.ok) ok++;
      else fail++;
    }
    bulkSelected.clear();
    await refreshUI();
    toast(`Moved ${ok} item(s)${fail ? `, ${fail} failed` : ""}`);
  };

  document.getElementById("moveModal").classList.remove("hidden");
}

// ── Scope card drop zones (document-level, bypass SortableJS) ────────
// SortableJS intercepts per-element dragover events on sortable containers.
// Using document-level listeners in capture phase ensures highlighting works.

function setupScopeDropZones() {
  document.addEventListener("dragover", (e) => {
    if (!draggingItem) return;

    // Find the innermost scope-block under cursor
    const scopeBlock = e.target.closest(".scope-block");

    // Clear all highlights
    document.querySelectorAll(".scope-block.drop-target").forEach(b => b.classList.remove("drop-target"));

    if (scopeBlock) {
      const hdr = scopeBlock.querySelector(":scope > .scope-hdr");
      const scopeId = hdr?.dataset.scopeId;
      if (scopeId && scopeId !== draggingItem.scopeId) {
        e.preventDefault();
        scopeBlock.classList.add("drop-target");
      }
    }
  }, true); // capture phase

  document.addEventListener("drop", (e) => {
    if (!draggingItem) return;

    const scopeBlock = e.target.closest(".scope-block");
    document.querySelectorAll(".scope-block.drop-target").forEach(b => b.classList.remove("drop-target"));

    if (!scopeBlock) return;
    const hdr = scopeBlock.querySelector(":scope > .scope-hdr");
    const scopeId = hdr?.dataset.scopeId;
    if (!scopeId || scopeId === draggingItem.scopeId) return;

    // If drop landed inside a sortable zone, SortableJS onEnd handles it
    if (e.target.closest(".sortable-zone")) return;

    e.preventDefault();
    e.stopPropagation();

    const item = draggingItem;
    const fromScope = data.scopes.find(s => s.id === item.scopeId);
    const toScope = data.scopes.find(s => s.id === scopeId);

    pendingDrag = { item, fromScopeId: item.scopeId, toScopeId: scopeId, revertFn: () => {} };
    showDragConfirm(item, fromScope, toScope);
    draggingItem = null;
  }, true); // capture phase

  document.addEventListener("dragend", () => {
    draggingItem = null;
    document.querySelectorAll(".scope-block.drop-target").forEach(b => b.classList.remove("drop-target"));
  }, true); // capture phase
}

// ── Expand/Collapse toggle ───────────────────────────────────────────

let allExpanded = false;

function setupExpandToggle() {
  const btn = document.getElementById("expandToggle");
  btn.addEventListener("click", () => {
    allExpanded = !allExpanded;
    btn.innerHTML = allExpanded
      ? '<span class="toggle-icon expanded"></span> Collapse all'
      : '<span class="toggle-icon"></span> Expand all';

    // Scopes always stay open — only categories toggle
    // Expand all = categories open; Collapse all = categories closed (default)
    document.querySelectorAll(".scope-hdr").forEach(hdr => {
      const body = hdr.nextElementSibling;
      const tog = hdr.querySelector(".scope-tog");
      body?.classList.remove("c");
      tog?.classList.remove("c");
    });

    document.querySelectorAll(".cat-hdr").forEach(hdr => {
      const body = hdr.nextElementSibling;
      const tog = hdr.querySelector(".cat-tog");
      if (allExpanded) {
        body?.classList.remove("c");
        tog?.classList.remove("c");
      } else {
        body?.classList.add("c");
        tog?.classList.add("c");
      }
    });

    // Also expand/collapse bundles
    document.querySelectorAll(".bundle-hdr").forEach(hdr => {
      const body = hdr.nextElementSibling;
      const tog = hdr.querySelector(".bundle-tog");
      if (allExpanded) {
        body?.classList.remove("c");
        tog?.classList.remove("c");
      } else {
        body?.classList.add("c");
        tog?.classList.add("c");
      }
    });
  });
}

// ── Search ───────────────────────────────────────────────────────────

function setupSearch() {
  document.getElementById("searchInput").addEventListener("input", function () {
    const q = this.value.toLowerCase();
    const btn = document.getElementById("expandToggle");

    // Auto-expand when searching, collapse back when cleared
    if (q && !allExpanded) {
      allExpanded = true;
      btn.innerHTML = '<span class="toggle-icon expanded"></span> Collapse all';
      document.querySelectorAll(".scope-hdr").forEach(hdr => {
        hdr.nextElementSibling?.classList.remove("c");
        hdr.querySelector(".scope-tog")?.classList.remove("c");
      });
      document.querySelectorAll(".cat-hdr").forEach(hdr => {
        hdr.nextElementSibling?.classList.remove("c");
        hdr.querySelector(".cat-tog")?.classList.remove("c");
      });
    } else if (!q && allExpanded) {
      allExpanded = false;
      btn.innerHTML = '<span class="toggle-icon"></span> Expand all';
      document.querySelectorAll(".cat-hdr").forEach(hdr => {
        hdr.nextElementSibling?.classList.add("c");
        hdr.querySelector(".cat-tog")?.classList.add("c");
      });
    }

    // 1. Show/hide individual item rows
    document.querySelectorAll(".item-row").forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = (!q || text.includes(q)) ? "" : "none";
    });

    // 2a. Hide bundle groups where all items are hidden
    document.querySelectorAll(".bundle-hdr").forEach(bundleHdr => {
      const bundleBody = bundleHdr.nextElementSibling;
      if (!bundleBody) return;
      const rows = bundleBody.querySelectorAll(".item-row");
      const anyVisible = rows.length === 0 || [...rows].some(r => r.style.display !== "none");
      bundleHdr.style.display = anyVisible ? "" : "none";
      bundleBody.style.display = anyVisible ? "" : "none";
      // When searching, auto-expand visible bundles
      if (q && anyVisible) {
        bundleBody.classList.remove("c");
        bundleHdr.querySelector(".bundle-tog")?.classList.remove("c");
      }
    });

    // 2b. Hide category sections where all items are hidden
    document.querySelectorAll(".cat-hdr").forEach(catHdr => {
      const catBody = catHdr.nextElementSibling;
      if (!catBody) return;
      const rows = catBody.querySelectorAll(".item-row");
      const anyVisible = rows.length === 0 || [...rows].some(r => r.style.display !== "none");
      catHdr.style.display = anyVisible ? "" : "none";
      catBody.style.display = anyVisible ? "" : "none";
    });

    // 3. Hide scope blocks bottom-up (deepest first so parents see child visibility)
    const allBlocks = [...document.querySelectorAll(".scope-block")];
    allBlocks.reverse().forEach(block => {
      const hdr = block.querySelector(":scope > .scope-hdr");
      const body = block.querySelector(":scope > .scope-body");
      if (!hdr || !body) return;

      // Check if any direct category content is visible
      const catHdrs = body.querySelectorAll(":scope > .cat-hdr");
      const anyCatVisible = [...catHdrs].some(ch => ch.style.display !== "none");

      // Check if any child scope-block is visible
      const childScopes = body.querySelectorAll(":scope > .child-scopes > .scope-block");
      const anyChildVisible = [...childScopes].some(cb => cb.style.display !== "none");

      const visible = !q || anyCatVisible || anyChildVisible;
      block.style.display = visible ? "" : "none";
    });
  });
}

// ── Detail panel ─────────────────────────────────────────────────────

function setupDetailPanel() {
  document.getElementById("detailClose").addEventListener("click", closeDetail);
  document.getElementById("detailOpen").addEventListener("click", () => {
    if (selectedItem) window.open(`vscode://file${selectedItem.path}`, "_blank");
  });
  document.getElementById("detailMove").addEventListener("click", () => {
    if (selectedItem && !selectedItem.locked) openMoveModal(selectedItem);
  });
  document.getElementById("detailDelete").addEventListener("click", () => {
    if (selectedItem && !selectedItem.locked) openDeleteModal(selectedItem);
  });
}

function showDetail(item, rowEl) {
  selectedItem = item;
  const panel = document.getElementById("detailPanel");
  panel.classList.remove("hidden");

  document.getElementById("detailTitle").textContent = item.name;
  document.getElementById("detailType").innerHTML = `<span class="row-badge b-${item.subType || item.category}">${item.subType || item.category}</span>`;
  const scope = data.scopes.find(s => s.id === item.scopeId);
  document.getElementById("detailScope").textContent = scope?.name || item.scopeId;
  document.getElementById("detailDesc").textContent = item.description || "—";
  document.getElementById("detailSize").textContent = item.size || "—";
  const detailDate = item.ctime && item.mtime
    ? `Created: ${item.ctime} | Modified: ${item.mtime}`
    : (item.mtime || "—");
  document.getElementById("detailDate").textContent = detailDate;
  document.getElementById("detailPath").textContent = item.path;

  // Show/hide move and delete buttons
  document.getElementById("detailMove").style.display = item.locked ? "none" : "";
  document.getElementById("detailDelete").style.display = item.locked ? "none" : "";

  // Highlight row
  document.querySelectorAll(".item-row.selected").forEach(r => r.classList.remove("selected"));
  if (rowEl) rowEl.classList.add("selected");

  // Load preview
  loadPreview(item);
}

async function loadPreview(item) {
  const el = document.getElementById("previewContent");
  el.textContent = "Loading...";

  try {
    // MCP: show config directly from item data
    if (item.category === "mcp") {
      el.textContent = JSON.stringify(item.mcpConfig || {}, null, 2);
      return;
    }

    // Hook: show full hook config from settings file
    if (item.category === "hook") {
      try {
        const res = await fetchJson(`/api/file-content?path=${encodeURIComponent(item.path)}`);
        if (res.ok) {
          const settings = JSON.parse(res.content);
          const hookConfig = settings.hooks?.[item.name];
          if (hookConfig) {
            el.textContent = JSON.stringify(hookConfig, null, 2);
          } else {
            el.textContent = item.description || "(no content)";
          }
        } else {
          el.textContent = item.description || "(no content)";
        }
      } catch {
        el.textContent = item.description || "(no content)";
      }
      return;
    }

    // Plugin: directory, no single file to preview
    if (item.category === "plugin") {
      el.textContent = `Plugin directory: ${item.path}`;
      return;
    }

    // Sessions: parse JSONL into readable conversation preview
    if (item.category === "session") {
      try {
        const res = await fetchJson(`/api/session-preview?path=${encodeURIComponent(item.path)}`);
        el.textContent = res.ok ? res.content : "Cannot load session preview";
        // Scroll to bottom — user wants to see the most recent messages
        requestAnimationFrame(() => el.scrollTop = el.scrollHeight);
      } catch {
        el.textContent = "Failed to load session preview";
      }
      return;
    }

    // Skill: read SKILL.md inside the directory
    let filePath = item.path;
    if (item.category === "skill") {
      filePath = item.path + "/SKILL.md";
    }

    const res = await fetchJson(`/api/file-content?path=${encodeURIComponent(filePath)}`);
    if (res.ok) {
      el.textContent = res.content;
    } else {
      el.textContent = res.error || "Cannot load preview";
    }
  } catch {
    el.textContent = "Failed to load preview";
  }
}

function closeDetail() {
  document.getElementById("detailPanel").classList.add("hidden");
  document.querySelectorAll(".item-row.selected").forEach(r => r.classList.remove("selected"));
  selectedItem = null;
}

// ── Drag confirm rendering ───────────────────────────────────────────

function showDragConfirm(item, fromScope, toScope) {
  const catConfig = CATEGORIES[item.category] || { icon: "📄", label: item.category };
  const badgeClass = `b-${item.subType || item.category}`;
  const fromIcon = SCOPE_ICONS[fromScope?.type] || "📂";
  const toIcon = SCOPE_ICONS[toScope?.type] || "📂";

  document.getElementById("dcPreview").innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <span style="font-size:1.1rem;">${catConfig.icon}</span>
      <div>
        <div style="font-weight:700;color:var(--text-primary);font-size:0.88rem;">${esc(item.name)}</div>
        <div style="display:flex;gap:6px;align-items:center;margin-top:3px;">
          <span class="row-badge ${badgeClass}">${esc(item.subType || item.category)}</span>
          <span style="font-size:0.7rem;color:var(--text-muted);">${esc(item.category)}</span>
        </div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--border-light);">
      <div style="flex:1;text-align:center;">
        <div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">From</div>
        <div style="font-size:0.82rem;font-weight:600;color:#dc2626;">${fromIcon} ${esc(fromScope?.name || "?")}</div>
        <div style="font-size:0.6rem;color:var(--text-faint);">${esc(fromScope?.tag || "")}</div>
      </div>
      <div style="font-size:1.2rem;color:var(--text-faint);">→</div>
      <div style="flex:1;text-align:center;">
        <div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">To</div>
        <div style="font-size:0.82rem;font-weight:600;color:#16a34a;">${toIcon} ${esc(toScope?.name || "?")}</div>
        <div style="font-size:0.6rem;color:var(--text-faint);">${esc(toScope?.tag || "")}</div>
      </div>
    </div>
  `;
  document.getElementById("dragConfirmModal").classList.remove("hidden");
}

// ── Modals ───────────────────────────────────────────────────────────

function openDeleteModal(item) {
  pendingDelete = item;
  const catConfig = CATEGORIES[item.category] || { icon: "📄", label: item.category };
  const scope = data.scopes.find(s => s.id === item.scopeId);

  document.getElementById("deletePreview").innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <span style="font-size:1.1rem;">${catConfig.icon}</span>
      <div>
        <div style="font-weight:700;color:var(--text-primary);font-size:0.88rem;">${esc(item.name)}</div>
        <div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px;">${esc(scope?.name || item.scopeId)} · ${esc(item.category)}</div>
      </div>
    </div>
    <div style="font-size:0.68rem;color:#dc2626;margin-top:8px;padding-top:8px;border-top:1px solid var(--border-light);">
      ${item.category === "skill" ? "This will delete the entire skill folder and all its files." : "This will permanently delete the file."}
    </div>`;

  document.getElementById("deleteModal").classList.remove("hidden");
}

function setupModals() {
  // Drag confirm
  document.getElementById("dcCancel").addEventListener("click", () => {
    document.getElementById("dragConfirmModal").classList.add("hidden");
    if (pendingDrag?.revertFn) pendingDrag.revertFn();
    pendingDrag = null;
  });
  document.getElementById("dcConfirm").addEventListener("click", async () => {
    document.getElementById("dragConfirmModal").classList.add("hidden");
    if (pendingDrag) {
      const result = await doMove(pendingDrag.item.path, pendingDrag.toScopeId);
      if (!result.ok && pendingDrag.revertFn) pendingDrag.revertFn();
      pendingDrag = null;
    }
  });

  // Move modal
  document.getElementById("moveCancel").addEventListener("click", closeMoveModal);
  document.getElementById("moveModal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("moveModal")) closeMoveModal();
  });
  document.getElementById("dragConfirmModal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("dragConfirmModal")) {
      document.getElementById("dragConfirmModal").classList.add("hidden");
      if (pendingDrag?.revertFn) pendingDrag.revertFn();
      pendingDrag = null;
    }
  });

  // Delete modal
  document.getElementById("deleteCancel").addEventListener("click", () => {
    document.getElementById("deleteModal").classList.add("hidden");
    pendingDelete = null;
  });
  document.getElementById("deleteConfirm").addEventListener("click", async () => {
    document.getElementById("deleteModal").classList.add("hidden");
    if (pendingDelete) {
      await doDelete(pendingDelete.path);
      pendingDelete = null;
    }
  });
  document.getElementById("deleteModal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("deleteModal")) {
      document.getElementById("deleteModal").classList.add("hidden");
      pendingDelete = null;
    }
  });
}

async function openMoveModal(item) {
  const res = await fetchJson(`/api/destinations?path=${encodeURIComponent(item.path)}&category=${encodeURIComponent(item.category)}&name=${encodeURIComponent(item.name)}`);
  if (!res.ok) return toast(res.error, true);

  const listEl = document.getElementById("moveDestList");
  // Build full scope lookup for indent
  const allScopeMap = {};
  for (const s of data.scopes) allScopeMap[s.id] = s;
  for (const s of res.destinations) allScopeMap[s.id] = s;

  function getDepth(scope) {
    let depth = 0;
    let cur = scope;
    while (cur.parentId) {
      depth++;
      cur = allScopeMap[cur.parentId] || { parentId: null };
    }
    return depth;
  }

  // Add current scope (grayed out) + all destinations
  const currentScope = data.scopes.find(s => s.id === res.currentScopeId);
  const allEntries = [];

  // Insert current scope at the right position based on depth
  const allScopes = currentScope
    ? [...res.destinations, { ...currentScope, isCurrent: true }]
    : res.destinations;

  // Sort by depth then name to maintain tree order
  allScopes.sort((a, b) => {
    const da = getDepth(a), db = getDepth(b);
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  });

  // Reorder to put children right after their parent
  const ordered = [];
  function addWithChildren(parentId) {
    for (const s of allScopes) {
      if ((s.parentId || null) === parentId) {
        ordered.push(s);
        addWithChildren(s.id);
      }
    }
  }
  addWithChildren(null);

  listEl.innerHTML = ordered.map(scope => {
    const depth = getDepth(scope);
    const indentPx = depth > 0 ? ` style="padding-left:${depth * 28}px"` : "";
    const icon = scope.id === "global" ? "🌐" : (SCOPE_ICONS[scope.type] || "📂");
    const curClass = scope.isCurrent ? " cur" : "";
    const curLabel = scope.isCurrent ? ' <span style="font-size:0.6rem;color:var(--text-faint);margin-left:4px;">(current)</span>' : "";
    return `<div class="dest${curClass}" data-scope-id="${esc(scope.id)}"${indentPx}>
      <span class="di">${icon}</span>
      <span class="dn">${esc(scope.name)}${curLabel}</span>
      <span class="dp">${esc(scope.tag)}</span>
    </div>`;
  }).join("");

  // Click handlers
  let selectedDest = null;
  listEl.querySelectorAll(".dest").forEach(d => {
    d.addEventListener("click", () => {
      listEl.querySelectorAll(".dest").forEach(x => x.classList.remove("sel"));
      d.classList.add("sel");
      selectedDest = d.dataset.scopeId;
      document.getElementById("moveConfirm").disabled = false;
    });
  });

  document.getElementById("moveConfirm").disabled = true;
  document.getElementById("moveConfirm").onclick = async () => {
    if (!selectedDest) return;
    closeMoveModal();
    await doMove(item.path, selectedDest);
  };

  document.getElementById("moveModal").classList.remove("hidden");
}

function closeMoveModal() {
  document.getElementById("moveModal").classList.add("hidden");
}

// ── API calls ────────────────────────────────────────────────────────

async function refreshUI() {
  saveExpandState();
  data = await fetchJson("/api/scan");
  renderPills();
  renderTree();
  closeDetail();
}

async function doMove(itemPath, toScopeId, skipRefresh = false) {
  // Find item before move for undo info
  const item = data.items.find(i => i.path === itemPath);
  const fromScopeId = item?.scopeId;

  const response = await fetch("/api/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemPath, toScopeId, category: item?.category, name: item?.name }),
  });
  const result = await response.json();

  if (!skipRefresh) {
    if (result.ok) {
      const undoFn = async () => {
        // Move back: result.to is the new path, fromScopeId is where it came from
        const undoResult = await fetch("/api/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemPath: result.to, toScopeId: fromScopeId }),
        }).then(r => r.json());
        if (undoResult.ok) { toast("Move undone"); await refreshUI(); }
        else toast(undoResult.error, true);
      };
      toast(result.message, false, undoFn);
      await refreshUI();
    } else {
      toast(result.error, true);
    }
  }

  return result;
}

async function doDelete(itemPath, skipRefresh = false) {
  // Backup content before delete for undo
  const item = data.items.find(i => i.path === itemPath);
  let backupContent = null;
  let mcpBackup = null;
  if (item) {
    try {
      if (item.category === "mcp") {
        // MCP: backup the server config from item data
        mcpBackup = { name: item.name, config: item.mcpConfig, mcpJsonPath: item.path };
      } else {
        let readPath = item.path;
        if (item.category === "skill") readPath = item.path + "/SKILL.md";
        const backup = await fetchJson(`/api/file-content?path=${encodeURIComponent(readPath)}`);
        if (backup.ok) backupContent = backup.content;
      }
    } catch { /* best effort */ }
  }

  const response = await fetch("/api/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemPath }),
  });
  const result = await response.json();

  if (!skipRefresh) {
    if (result.ok) {
      let undoFn = null;
      if (mcpBackup) {
        // MCP undo: re-add the server entry to .mcp.json
        undoFn = async () => {
          const restoreResult = await fetch("/api/restore-mcp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(mcpBackup),
          }).then(r => r.json());
          if (restoreResult.ok) { toast("Delete undone"); await refreshUI(); }
          else toast(restoreResult.error, true);
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
          }).then(r => r.json());
          if (restoreResult.ok) { toast("Delete undone"); await refreshUI(); }
          else toast(restoreResult.error, true);
        };
      }
      toast(result.message, false, undoFn);
      await refreshUI();
    } else {
      toast(result.error, true);
    }
  }

  return result;
}

// ── Toast with optional Undo ─────────────────────────────────────────

let toastTimer = null;

function toast(msg, isError = false, undoFn = null) {
  const el = document.getElementById("toast");
  if (toastTimer) clearTimeout(toastTimer);

  if (undoFn) {
    document.getElementById("toastMsg").innerHTML =
      `${esc(msg)} <button class="toast-undo" id="toastUndo">Undo</button>`;
    el.className = "toast";
    document.getElementById("toastUndo").onclick = async () => {
      el.classList.add("hidden");
      await undoFn();
    };
    toastTimer = setTimeout(() => el.classList.add("hidden"), 8000); // longer for undo
  } else {
    document.getElementById("toastMsg").textContent = msg;
    el.className = isError ? "toast error" : "toast";
    toastTimer = setTimeout(() => el.classList.add("hidden"), 4000);
  }
}

// ── Start ────────────────────────────────────────────────────────────
init();
