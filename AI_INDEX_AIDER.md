
src/effective.mjs:
⋮
│export function hasEffectiveRule(category) {
│  return category in EFFECTIVE_RULES;
⋮
│export function getAncestorScopes(scopeId, scopes) {
│  const scope = scopes.find(s => s.id === scopeId);
│  if (!scope?.repoDir) return [];
│  return scopes.filter(s =>
│    s.repoDir &&
│    s.id !== scopeId &&
│    s.id !== "global" &&
│    scope.repoDir.startsWith(s.repoDir + "/")
│  );
⋮

src/history.mjs:
⋮
│export async function getHistory(filterFile) {
│  if (!existsSync(MANIFEST_PATH)) return [];
│
│  const raw = await readFile(MANIFEST_PATH, "utf-8");
│  const entries = raw
│    .trim()
│    .split("\n")
│    .filter(Boolean)
│    .map((line) => {
│      try {
⋮

src/mcp-introspector.mjs:
⋮
│function jsonRpcRequest(method, params = {}) {
│  return JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params });
⋮
│async function introspectStdioServer(config, serverName) {
│  const { command, args = [], env = {} } = config;
│  if (!command) return { ok: false, tools: [], error: "No command specified" };
│
│  return new Promise((resolve) => {
│    const timer = setTimeout(() => {
│      child.kill("SIGKILL");
│      resolve({ ok: false, tools: [], error: `Timeout after ${TIMEOUT_MS / 1000}s` });
│    }, TIMEOUT_MS);
│
⋮
│async function introspectHttpServer(config, serverName) {
│  const url = config.url;
│  if (!url) return { ok: false, tools: [], error: "No URL specified" };
│
│  const headers = {
│    "Content-Type": "application/json",
│    ...(config.headers || {}),
│  };
│
│  // Try streamable HTTP POST
⋮
│function hashTool(tool) {
│  const data = JSON.stringify({
│    name: tool.name,
│    description: tool.description,
│    inputSchema: tool.inputSchema,
│  });
│  return createHash("sha256").update(data).digest("hex");
⋮
│function hashServerTools(tools) {
│  const hashes = {};
│  for (const tool of tools) {
│    hashes[tool.name] = hashTool(tool);
│  }
│  return hashes;
⋮

src/mover.mjs:
⋮
│async function safeRename(src, dest, isDir = false) {
│  try {
│    await rename(src, dest);
│  } catch (err) {
│    if (err.code === "EXDEV") {
│      // Cross-device: copy then delete
│      await cp(src, dest, { recursive: isDir });
│      await rm(src, { recursive: isDir, force: true });
│    } else {
│      throw err;
⋮
│function resolveMemoryDir(scopeId) {
│  if (scopeId === "global") return join(CLAUDE_DIR, "memory");
│  return join(CLAUDE_DIR, "projects", scopeId, "memory");
⋮
│function resolveSkillDir(scopeId, scopes) {
│  if (scopeId === "global") return join(CLAUDE_DIR, "skills");
│  const scope = scopes.find(s => s.id === scopeId);
│  if (!scope || !scope.repoDir) return null;
│  return join(scope.repoDir, ".claude", "skills");
⋮
│function resolveRuleDir(scopeId, scopes) {
│  if (scopeId === "global") return join(CLAUDE_DIR, "rules");
│  const scope = scopes.find(s => s.id === scopeId);
│  if (!scope || !scope.repoDir) return null;
│  return join(scope.repoDir, ".claude", "rules");
⋮
│function resolveCommandDir(scopeId, scopes) {
│  if (scopeId === "global") return join(CLAUDE_DIR, "commands");
│  const scope = scopes.find(s => s.id === scopeId);
│  if (!scope || !scope.repoDir) return null;
│  return join(scope.repoDir, ".claude", "commands");
⋮
│function resolveAgentDir(scopeId, scopes) {
│  if (scopeId === "global") return join(CLAUDE_DIR, "agents");
│  const scope = scopes.find(s => s.id === scopeId);
│  if (!scope || !scope.repoDir) return null;
│  return join(scope.repoDir, ".claude", "agents");
⋮
│function resolveMcpJson(scopeId, scopes) {
│  if (scopeId === "global") return join(CLAUDE_DIR, ".mcp.json");
│  const scope = scopes.find(s => s.id === scopeId);
│  if (!scope || !scope.repoDir) return null;
│  return join(scope.repoDir, ".mcp.json");
⋮
│export function getValidDestinations(item, scopes) {
│  if (item.locked) return [];
│
│  return scopes
│    .filter(s => s.id !== item.scopeId)
│    .filter(s => {
│      switch (item.category) {
│        case "memory":
│        case "skill":
│        case "command":
⋮

src/tokenizer.mjs:
⋮
│async function init() {
│  if (_tokenizer !== null) return;
│  try {
│    const [{ default: Tokenizer }, encoding] = await Promise.all([
│      import("ai-tokenizer"),
│      import("ai-tokenizer/encoding"),
│    ]);
│    _tokenizer = new Tokenizer(encoding.claude);
│    _method = "measured";
│  } catch {
│    // ai-tokenizer not installed — use fallback
│    _tokenizer = {
│      count(text) {
│        // bytes/4 is ~75-85% accurate for English text
│        return Math.ceil(Buffer.byteLength(text, "utf-8") / 4);
│      },
│    };
│    _method = "estimated";
⋮

src/ui/app.js:
⋮
│async function init() {
│  try {
│    data = await fetchJson("/api/scan");
│    selectedScopeId = getInitialSelectedScopeId();
│    initializeScopeState();
│    setupUi();
│    setupScopeNotice();
│    // Load cached scan results + check for new servers BEFORE first render
│    await loadCachedSecurityResults();
│    await checkForNewMcpServers();
⋮

tests/e2e/dashboard.spec.mjs:
⋮
│async function fileExists(p) {
│  try { await access(p); return true; } catch { return false; }
⋮
│async function createTestEnv() {
│  const port = PORT_COUNTER++;
│  const tmpDir = await mkdtemp(join(tmpdir(), 'cco-test-'));
│  const claudeDir = join(tmpDir, '.claude');
│
│  // ── Directory structure ──
│  const dirs = {
│    globalMem: join(claudeDir, 'memory'),
│    globalSkills: join(claudeDir, 'skills'),
│  };
│
⋮

tests/e2e/settings.spec.mjs:
⋮
│async function createSettingsEnv() {
│  const port = PORT_COUNTER++;
│  const tmpDir = await mkdtemp(join(tmpdir(), 'cco-settings-test-'));
│  const claudeDir = join(tmpDir, '.claude');
│  await mkdir(join(claudeDir, 'memory'), { recursive: true });
│  await writeFile(join(claudeDir, 'memory', 'MEMORY.md'), '# Memory Index\n');
│
│  // Global user settings
│  await writeFile(join(claudeDir, 'settings.json'), JSON.stringify({
│    outputStyle: 'streamlined',
⋮

tests/unit/test-move-destinations.mjs:
⋮
│function makeItem(category, scopeId, name = 'test-item') {
│  return { category, scopeId, name, path: `/fake/${name}`, locked: false };
⋮

tests/unit/test-path-correctness.mjs:
⋮
│function resolveSkillDir(scopeId) {
│  if (scopeId === 'global') return join(CLAUDE_DIR, 'skills');
│  const scope = SCOPES.find(s => s.id === scopeId);
│  return scope?.repoDir ? join(scope.repoDir, '.claude', 'skills') : null;
⋮
│function resolveMemoryDir(scopeId) {
│  if (scopeId === 'global') return join(CLAUDE_DIR, 'memory');
│  return join(CLAUDE_DIR, 'projects', scopeId, 'memory');
⋮
│function resolveCommandDir(scopeId) {
│  if (scopeId === 'global') return join(CLAUDE_DIR, 'commands');
│  const scope = SCOPES.find(s => s.id === scopeId);
│  return scope?.repoDir ? join(scope.repoDir, '.claude', 'commands') : null;
⋮
│function resolveAgentDir(scopeId) {
│  if (scopeId === 'global') return join(CLAUDE_DIR, 'agents');
│  const scope = SCOPES.find(s => s.id === scopeId);
│  return scope?.repoDir ? join(scope.repoDir, '.claude', 'agents') : null;
⋮
│function resolveRuleDir(scopeId) {
│  if (scopeId === 'global') return join(CLAUDE_DIR, 'rules');
│  const scope = SCOPES.find(s => s.id === scopeId);
│  return scope?.repoDir ? join(scope.repoDir, '.claude', 'rules') : null;
⋮
│function resolveMcpJson(scopeId) {
│  if (scopeId === 'global') return join(CLAUDE_DIR, '.mcp.json');
│  const scope = SCOPES.find(s => s.id === scopeId);
│  return scope?.repoDir ? join(scope.repoDir, '.mcp.json') : null;
⋮
