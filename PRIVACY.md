# Privacy Policy

**Cross-Code Organizer (CCO)** runs on your local machine. Your harness files are not uploaded to CCO or collected as telemetry.

## Data Collection

Anonymous metrics are **disabled by default**. CCO does not send an activity signal unless you explicitly enable **Anonymous monthly metrics** in Harness Doctor.

When enabled, CCO uses one activity-signal identity per UTC month and submits it to:

`https://cco-metrics-api.keungkawai5.workers.dev/v1/mau`

The complete payload is:

- schema version (`cco-mau-v1`)
- UTC month (`YYYY-MM`)
- a 128-bit pseudonymous ID that changes every month
- installed CCO version
- selected harness ID (`claude`, `codex`, `opencode`, `dsh`, or `unknown`)

The monthly ID is derived from a random secret stored only on your machine. It is stable within one month for deduplication and deliberately changes the next month, so the collector cannot build a cross-month user history. CCO calls this an active-install count because one person may use several installations and several people may share one installation.

If delivery fails or the response is lost, CCO may retransmit the identical payload after 24 hours. The collector's `(month, monthly ID)` primary key deduplicates those retries, so they do not increase the monthly count.

Detailed event counts and coarse inventory buckets stay in `~/.cco/privacy-metrics.json` for up to 30 days. They are never included in the monthly signal.

CCO never sends harness paths, file names, skill names, prompts, file contents, session content, credentials, local event counts, or inventory counts. The collector does not read or store IP addresses or user-agent strings in its database. Cloudflare necessarily processes network metadata to deliver the request under its own infrastructure policies.

You can disable metrics at any time in Harness Doctor. CCO does not use cookies, advertising trackers, or third-party analytics SDKs.

## What It Accesses

- Reads selected config and customization files for supported harnesses, including `~/.claude/`, `$CODEX_HOME` (default `~/.codex/`), `~/.config/opencode/`, `$DSH_HOME` (default `~/.dsh/`), `$DSH_AGENTS_HOME` (default `~/.agents/`), and discovered project directories
- On Linux, Live Runtime Map reads same-user procfs metadata to group supported harness process trees and sum RSS, threads, age, and process counts. It may read same-user file-descriptor links plus `/proc/net/tcp*` to associate a persistent loopback 1MCP socket with a session. It reads configured MCP command markers only for local process matching. Command lines, working directories, raw socket details, and credential values are never returned to the browser.
- Runtime Doctor can also read a HOME-scoped 1MCP config, cgroup resource counters, its loopback health endpoint, and Claude settings to detect an IntentProbe hook. It checks command-line arguments in memory for credential-shaped values but returns only a count.
- “Stop session” is the only runtime-map mutation. After an explicit browser confirmation, CCO revalidates the same-user PID, process start identity, and supported harness executable, then sends `SIGTERM` to that one harness root. It never stops a session tree containing the CCO server itself.
- Writes only when you use an editing, move, delete, restore, export, backup, or harness-control action
- Runs an HTTP server bound to `127.0.0.1` (default port 3847) and rejects non-local browser requests

## Third-Party Services

- The dashboard loads **marked** from jsDelivr for Markdown rendering and fonts from Google Fonts.
- CCO checks the npm registry for available package updates.
- When anonymous metrics are explicitly enabled, CCO sends the monthly signal described above to its first-party Cloudflare Worker and D1 database.
- An MCP security audit connects to the MCP servers already configured in the selected harness so it can inspect their tool definitions.
- Backup Center can copy harness files to a Git remote you configure. Scheduled backups repeat that sync at the selected interval until you disable the schedule.
- No third-party analytics, advertising trackers, or cross-month user identifier.

## Summary

CCO does not upload the contents of your harness files. Optional monthly metrics use a deliberately minimal, documented payload and require explicit opt-in.

---

Last updated: 2026-10-16
