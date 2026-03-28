# Scanner Engines

CCO includes a built-in security scanner with 60+ detection rules. For deeper scanning, you can plug in any compatible external engine. CCO auto-detects installed engines and adds them to the scanner dropdown.

## How it works

1. Install any engine below
2. Open CCO → Security Scan panel
3. The engine appears in the dropdown automatically
4. Select it and click "Start Security Scan"
5. Results show in CCO with click-to-navigate — click any finding to jump to the MCP server entry

## Compatible Engines

| Engine | Rules | What it catches | Install | License |
|--------|------:|-----------------|---------|---------|
| **Built-in** | 60+ | Prompt injection, tool poisoning, credential exposure, data exfiltration, code execution | Included | MIT |
| **[cc-audit](https://github.com/ryo-ebata/cc-audit)** | 184 | Everything above + persistence (crontab, systemd, LaunchAgent), Docker security, supply chain, privilege escalation. False-positive handling. CWE IDs. Auto-fix. | `npm i -g @cc-audit/cc-audit` | MIT |
| **[AgentSeal](https://github.com/AgentSeal/agentseal)** | 400+ | Semantic ML detection (MiniLM), TR39 confusable characters, dataflow analysis, 225 adversarial probes, MCP registry trust scores (6,600+ servers) | `pip install agentseal` | FSL-1.1 |
| **[agent-audit](https://github.com/HeadyZhang/agent-audit)** | 53 | AST taint analysis, OWASP Agentic Top 10 (ASI-01 to ASI-10), "missing control" detection (no kill switch, no rate limit), memory poisoning | `pip install agent-audit` | MIT |
| **[mcp-audit](https://github.com/apisec-inc/mcp-audit)** | 60 | Secrets exposure, shadow API inventory, AI-BOM (CycloneDX), endpoint classification, OWASP LLM Top 10 | `pip install mcp-audit` | MIT |

## Built-in vs external — they scan different things

**Built-in scanner (recommended first):** Connects to each MCP server via JSON-RPC, retrieves actual tool definitions, and scans descriptions for prompt injection and hidden instructions. This is the primary attack surface — tool descriptions go straight into Claude's context as trusted text.

**External scanners (complementary):** Scan your config files for supply chain risks, credential exposure, CVEs, and permission issues. They do NOT connect to MCP servers or read tool definitions — they check the config text itself.

| What gets scanned | Built-in | External |
|-------------------|:---:|:---:|
| **Tool descriptions** (prompt injection, hidden instructions) | **Yes** | No |
| **Tool schemas** (suspicious parameter names) | **Yes** | No |
| Supply chain (unpinned packages, known malicious) | Basic | **Deep** |
| Credential exposure (API keys, secrets) | Basic | **Deep** |
| CVE checks (known vulnerabilities) | No | **Yes** |
| File permissions (world-readable configs) | No | **Yes** |
| Config hygiene (missing auth, insecure URLs) | No | **Yes** |

**Best practice: run built-in first** (catches the dangerous stuff — hidden instructions in tool descriptions), then run an external engine for supply chain and config hygiene.

## CCO's advantage

Other scanners produce reports. CCO produces **navigation**. When any engine finds an issue, you click "Fix with Claude →" to copy a detailed prompt — including the engine name, rule ID, server path, and suggested fix — ready to paste into Claude Code.

## Output format support

CCO accepts two output formats from external scanners:

- **SARIF** (Static Analysis Results Interchange Format) — industry standard, used by cc-audit and agent-audit
- **JSON** — generic findings array, used by AgentSeal and mcp-audit

If you build your own scanner, output SARIF and CCO will pick it up automatically.
