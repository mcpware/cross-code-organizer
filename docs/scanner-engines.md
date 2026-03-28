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

## Why external engines?

CCO's built-in scanner is fast and catches the most common threats. But specialized engines go deeper:

- **cc-audit** has false-positive exclusions that reduce noise (14+ exclusion patterns per rule vs zero in built-in)
- **AgentSeal** uses machine learning to catch rephrased attacks that bypass regex
- **agent-audit** does AST-level taint analysis — tracking data from tool inputs to dangerous sinks
- **mcp-audit** generates AI-BOMs (software bill of materials) that enterprise security teams require

You don't have to choose one. Install multiple and switch between them in the dropdown to get different perspectives on the same configs.

## CCO's advantage

Other scanners produce reports. CCO produces **navigation**. When any engine finds an issue, you click the finding and land directly on the MCP server entry in the scope tree. Delete it, move it, or inspect its config — without leaving CCO.

## Output format support

CCO accepts two output formats from external scanners:

- **SARIF** (Static Analysis Results Interchange Format) — industry standard, used by cc-audit and agent-audit
- **JSON** — generic findings array, used by AgentSeal and mcp-audit

If you build your own scanner, output SARIF and CCO will pick it up automatically.
