#!/usr/bin/env node

/**
 * MCP server layer for Claude Code Organizer.
 * Wraps existing scan/move/delete functions as MCP tools
 * so AI clients (Claude, Cursor, Windsurf) can discover and call them.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { scan } from './scanner.mjs';
import { moveItem, deleteItem, getValidDestinations } from './mover.mjs';
import { introspectServers } from './mcp-introspector.mjs';
import { runSecurityScan } from './security-scanner.mjs';
import { getAdapter, getDefaultAdapterId } from './harness/registry.mjs';

const harness = await getAdapter(getDefaultAdapterId());
const harnessName = harness.displayName;
const scopeList = harness.scopeTypes.map(scope => scope.label).join(' and ');
const categoryList = harness.categories.map(category => category.label).join(', ');
const actionCategories = harness.categories
  .filter(category => category.movable || category.deletable)
  .map(category => category.id);
const categoryEnumValues = actionCategories.length ? actionCategories : harness.categories.map(category => category.id);
const categoryEnum = z.enum(categoryEnumValues);
const categoryDescription = `Category of item (${categoryList})`;

const server = new McpServer({
  name: 'claude-code-organizer',
  version: '0.5.0',
});

// Cache scan data so move/delete can look up items
let cachedData = null;

async function freshScan() {
  cachedData = await scan();
  return cachedData;
}

/**
 * Find an item in cached scan data by category + name + scopeId.
 * Returns the item object that mover.mjs expects.
 */
function findItem(category, name, scopeId) {
  if (!cachedData) return null;
  return cachedData.items.find(i =>
    i.category === category &&
    (i.name === name || i.fileName === name) &&
    i.scopeId === scopeId
  ) || null;
}

server.tool(
  'scan_inventory',
  `Scan all ${harnessName} configurations across ${scopeList} scopes. Returns ${categoryList} with file paths and metadata.`,
  {},
  async () => {
    const data = await freshScan();
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  'move_item',
  `Move a ${harnessName} configuration item from one scope to another. Run scan_inventory first to see available items and scope IDs.`,
  {
    category: categoryEnum.describe(categoryDescription),
    name: z.string().describe('Name of the item (as shown in scan_inventory results)'),
    fromScopeId: z.string().describe('Source scope ID (e.g. "global" or the encoded project directory name)'),
    toScopeId: z.string().describe('Destination scope ID'),
  },
  async ({ category, name, fromScopeId, toScopeId }) => {
    if (!cachedData) await freshScan();

    const item = findItem(category, name, fromScopeId);
    if (!item) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: false, error: `Item not found: ${category} "${name}" in scope "${fromScopeId}". Run scan_inventory first to see available items.` }) }],
      };
    }

    const result = await moveItem(item, toScopeId, cachedData.scopes);
    if (result.ok) await freshScan();

    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  }
);

server.tool(
  'delete_item',
  `Delete a ${harnessName} configuration item. Run scan_inventory first to see available items and scope IDs.`,
  {
    category: categoryEnum.describe(categoryDescription),
    name: z.string().describe('Name of the item (as shown in scan_inventory results)'),
    scopeId: z.string().describe('Scope ID where the item lives'),
  },
  async ({ category, name, scopeId }) => {
    if (!cachedData) await freshScan();

    const item = findItem(category, name, scopeId);
    if (!item) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: false, error: `Item not found: ${category} "${name}" in scope "${scopeId}". Run scan_inventory first to see available items.` }) }],
      };
    }

    const result = await deleteItem(item, cachedData.scopes);
    if (result.ok) await freshScan();

    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  }
);

server.tool(
  'list_destinations',
  'List valid destination scopes for a specific item. Shows where this item can be moved to.',
  {
    category: categoryEnum.describe(categoryDescription),
    name: z.string().describe('Name of the item'),
    scopeId: z.string().describe('Current scope ID of the item'),
  },
  async ({ category, name, scopeId }) => {
    if (!cachedData) await freshScan();

    const item = findItem(category, name, scopeId);
    if (!item) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: false, error: `Item not found: ${category} "${name}" in scope "${scopeId}". Run scan_inventory first to see available items.` }) }],
      };
    }

    const destinations = getValidDestinations(item, cachedData.scopes);
    return {
      content: [{ type: 'text', text: JSON.stringify({ ok: true, destinations, currentScopeId: item.scopeId }, null, 2) }],
    };
  }
);

server.tool(
  'audit_security',
  'Scan all MCP servers for security vulnerabilities. Connects to each server, retrieves tool definitions, and runs pattern-based detection for prompt injection, tool poisoning, credential exposure, and other threats. Returns findings with severity levels and baseline comparison.',
  {},
  async () => {
    if (!cachedData) await freshScan();

    const mcpItems = cachedData.items.filter(i => i.category === 'mcp' && i.mcpConfig);
    const introspectionResults = await introspectServers(mcpItems);
    const scanResults = await runSecurityScan(introspectionResults, cachedData);

    return {
      content: [{ type: 'text', text: JSON.stringify(scanResults, null, 2) }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
