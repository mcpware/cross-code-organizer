/**
 * claude-prompts.mjs — Claude Code prompt templates used by organizer actions.
 *
 * Data only. Rendering code substitutes {{placeholders}} at the call site.
 */

export const CLAUDE_PROMPT_PLACEHOLDERS = [
  "category",
  "cdCmd",
  "destName",
  "executable",
  "fileName",
  "fromScopeName",
  "mcpCommand",
  "mcpConfigJson",
  "mcpPackageArg",
  "name",
  "path",
  "scopeId",
  "sessionId",
  "subType",
  "toScopeName",
];

export const CLAUDE_CC_ACTION_PROMPTS = {
  common: {
    unlockedInfo: {
      ico: "🤖",
      label: "",
      prompt: null,
      info: "Use these prompts for guided changes — Claude Code will read the file, explain the impact, and confirm before making changes.",
    },
    explain: {
      ico: "📋",
      label: "Explain This",
      prompt: `I have a Claude Code {{category}} called "{{name}}" at:
{{path}}

Please read this file and explain:
1. What does this {{category}} do?
2. When does it get loaded / triggered?
3. What would break if I removed or changed it?
4. Are there any other files that depend on it?`,
    },
  },
  categories: {
    session: [
      {
        ico: "💡",
        label: "",
        prompt: null,
        info: "Sessions can be resumed directly in Claude Code. Copy the command below and paste it in any terminal to continue where you left off.",
      },
      {
        ico: "💬",
        label: "Resume Session",
        prompt: `{{cdCmd}}{{executable}} --resume {{sessionId}}

# Session file: {{path}}`,
      },
      {
        ico: "📋",
        label: "Summarize",
        prompt: `I have a Claude Code session at:
{{path}}

Please read this session file and give me a summary:
1. What was this session about?
2. What was accomplished?
3. Were there any unfinished tasks or pending actions?
4. What files were modified?`,
      },
      {
        ico: "🧹",
        label: "Distill Session",
        when: "notDistilled",
        prompt: `Please distill this session for me:
{{path}}

This will:
1. Back up the original (CC compact will destroy it otherwise)
2. Create a clean resumable session
3. Generate an index of large tool results`,
      },
    ],
    memory: [
      { use: "common.explain" },
      {
        ico: "✏️",
        label: "Edit Content",
        prompt: `I want to edit this Claude Code memory: "{{name}}"
Path: {{path}}
Type: {{subType}}

Before editing:
1. Read the current content
2. Show me the current frontmatter (name, description, type) and body
3. Ask me what I want to change
4. Show the before vs after diff
5. Only save after I confirm`,
      },
    ],
    skill: [
      { use: "common.explain" },
      {
        ico: "✏️",
        label: "Edit Skill",
        prompt: `I want to edit this Claude Code skill: "{{name}}"
Path: {{path}}

Before editing:
1. Read the SKILL.md content
2. Explain what this skill does and when it triggers
3. Ask me what I want to change
4. Show the before vs after diff
5. Warn if the change could affect how Claude Code invokes it
6. Only save after I confirm`,
      },
    ],
    mcp: [
      {
        ico: "📋",
        label: "Explain This",
        prompt: `I have a Claude Code MCP server called "{{name}}" at:
{{path}}

Please explain:
1. What does this MCP server do?
2. What tools does it provide?
3. How is it configured (command, args, env)?
4. Is it currently working? Check if the command exists on this system.`,
      },
      {
        ico: "🔧",
        label: "Edit Config",
        prompt: `I want to modify this MCP server configuration: "{{name}}"
Path: {{path}}

Before changing:
1. Read the current MCP config
2. Show me the current command, args, and env settings
3. Ask me what I want to change
4. Show the before vs after diff
5. Warn if this could break any tools that depend on this MCP server
6. Only save after I confirm`,
      },
      {
        ico: "🩺",
        label: "Fix Server",
        when: "securitySeverityUnreachable",
        prompt: `My MCP server "{{name}}" is unreachable — it failed to connect during a security scan.
Config path: {{path}}
Config: {{mcpConfigJson}}

Please diagnose and fix:
1. Check if the command exists: which {{mcpCommand}}
2. If it's an npx package, check if it's installed: npm ls -g {{mcpPackageArg}}
3. Check if required env vars are set
4. Try running the server manually to see the error
5. Suggest a fix (install package, set env var, fix config)
6. Only make changes after I confirm`,
      },
    ],
    plan: [
      { use: "common.explain" },
      {
        ico: "▶️",
        label: "Continue Plan",
        prompt: `I have an existing Claude Code plan at:
{{path}}

Please read this plan and:
1. Summarize what the plan is about
2. Show which steps are done and which are remaining
3. Ask me if I want to continue from where it left off`,
      },
    ],
    command: [
      { use: "common.explain" },
      {
        ico: "✏️",
        label: "Edit Command",
        prompt: `I want to edit this Claude Code command: "{{name}}"
Path: {{path}}

Before editing:
1. Read the current content
2. Explain what this command does and its argument format
3. Ask me what I want to change
4. Show the before vs after diff
5. Only save after I confirm`,
      },
    ],
    agent: [
      { use: "common.explain" },
      {
        ico: "✏️",
        label: "Edit Agent",
        prompt: `I want to edit this Claude Code agent: "{{name}}"
Path: {{path}}

Before editing:
1. Read the current content
2. Explain what this agent does, what tools it has, and what model it uses
3. Ask me what I want to change
4. Show the before vs after diff
5. Only save after I confirm`,
      },
    ],
    rule: [
      {
        ico: "💡",
        label: "",
        prompt: null,
        info: "Rules enforce project-specific constraints. Use these prompts to understand or modify them.",
      },
      {
        ico: "📋",
        label: "Explain This",
        prompt: `I have a Claude Code rule: "{{name}}"
Path: {{path}}

Please read this rule and explain:
1. What constraint does it enforce?
2. Why was it created?
3. What would happen if it were removed?
4. Are there any edge cases it doesn't cover?`,
      },
      {
        ico: "✏️",
        label: "Modify",
        prompt: `I want to modify this Claude Code rule: "{{name}}"
Path: {{path}}

Before making any changes:
1. Read the current content
2. Explain the rule
3. Ask me what I want to change
4. Show the before vs after diff
5. Warn if the change could weaken important constraints
6. Only save after I confirm`,
      },
    ],
    config: [
      {
        ico: "💡",
        label: "",
        prompt: null,
        info: "Config files are managed by Claude Code. Use these prompts to ask Claude Code to help you understand or modify them.",
      },
      {
        ico: "📋",
        label: "Explain This",
        prompt: `I have a Claude Code config file: "{{name}}"
Path: {{path}}

Please read it and explain:
1. What does each setting do?
2. Which settings are most important?
3. Are there any settings that look unusual or could cause issues?`,
      },
      {
        ico: "✏️",
        label: "Modify",
        prompt: `I want to modify this Claude Code config: "{{name}}"
Path: {{path}}

Before making any changes:
1. Read the current content
2. Explain what each setting does
3. Ask me what I want to change
4. Show exactly what will change (before vs after)
5. Warn if the change could break anything
6. Only apply after I confirm`,
      },
      {
        ico: "🗑️",
        label: "Remove",
        prompt: `I want to remove this Claude Code config file: "{{name}}"
Path: {{path}}

⚠️ This is a config file — removing it can significantly change how Claude Code behaves in this project.

Before doing ANYTHING:
1. Read the entire file and explain what it is — is this CLAUDE.md (project instructions), settings.json (project settings), or settings.local.json (local overrides)?
2. Explain in plain language what EVERY setting/instruction in this file does
3. Explain exactly what will change after removal:
   - If CLAUDE.md: all project-specific instructions, coding conventions, and custom rules will be lost. Claude Code will behave generically.
   - If settings.json: project-level permission overrides, model preferences, and tool settings will revert to defaults.
   - If settings.local.json: local environment overrides (API keys, personal preferences) will be lost.
4. List everything that depends on or references this file
5. Ask me: "Are you sure you want to remove this? Here is what you will lose: [list]. Type YES to confirm."
6. Only remove after I type YES — do not proceed on any other response`,
      },
    ],
    hook: [
      {
        ico: "💡",
        label: "",
        prompt: null,
        info: "Hooks run automatically on Claude Code events. Use these prompts to understand or modify them safely.",
      },
      {
        ico: "📋",
        label: "Explain This",
        prompt: `I have a Claude Code hook: "{{name}}"
Path: {{path}}

Please explain:
1. What event triggers this hook?
2. What does the hook script do?
3. What would happen if I disabled or removed it?
4. Is the hook script working correctly? Check if the script exists and is executable.`,
      },
      {
        ico: "✏️",
        label: "Modify",
        prompt: `I want to modify this Claude Code hook: "{{name}}"
Path: {{path}}

Before changing:
1. Read the hook config and the script it runs
2. Explain when it triggers and what it does
3. Ask me what I want to change
4. Show the before vs after diff
5. Warn about any side effects (e.g. breaking pre-commit checks)
6. Only apply after I confirm`,
      },
      {
        ico: "🗑️",
        label: "Remove",
        prompt: `I want to remove this Claude Code hook: "{{name}}"
Path: {{path}}

Before removing:
1. Read the hook and explain what it does
2. Tell me what behavior will stop after removal
3. Check if other hooks or configs depend on it
4. Only remove after I explicitly confirm`,
      },
    ],
    plugin: [
      {
        ico: "💡",
        label: "",
        prompt: null,
        info: "Plugins extend Claude Code's capabilities. Use these prompts to understand or manage them.",
      },
      {
        ico: "📋",
        label: "Explain This",
        prompt: `I have a Claude Code plugin: "{{name}}"
Path: {{path}}

Please explain:
1. What does this plugin do?
2. What features or commands does it add?
3. Is it actively loaded by Claude Code?
4. What would change if I removed it?`,
      },
      {
        ico: "🗑️",
        label: "Remove",
        prompt: `I want to remove this Claude Code plugin: "{{name}}"
Path: {{path}}

Before removing:
1. Explain what features this plugin provides
2. Check if any skills, hooks, or configs reference it
3. Tell me what will stop working after removal
4. Only remove after I explicitly confirm`,
      },
    ],
    default: [
      { use: "common.explain" },
    ],
  },
};

export const CLAUDE_MOVE_PROMPT_TEMPLATES = {
  withSourceScope: `I want to move this Claude Code {{category}} to a different scope.

Item: "{{name}}"
Current path: {{path}}
From scope: {{fromScopeName}}
Move to scope: {{toScopeName}}

Before moving:
1. Read the file and understand what it does
2. Determine the correct destination path for the "{{toScopeName}}" scope
3. Check if a {{category}} with the same name already exists at the destination
4. Explain what will change — which projects will gain or lose access to this {{category}}
5. Warn me about any potential conflicts or breaking changes
6. Only move the file after I confirm`,
  withoutSourceScope: `I want to move this Claude Code {{category}} to a different scope.

Item: "{{name}}"
Current path: {{path}}
Move to scope: {{destName}}

Before moving:
1. Read the file and understand what it does
2. Determine the correct destination path for the "{{destName}}" scope
3. Check if a {{category}} with the same name already exists at the destination
4. Explain what will change — which projects will gain or lose access to this {{category}}
5. Warn me about any potential conflicts or breaking changes
6. Only move the file after I confirm`,
};
