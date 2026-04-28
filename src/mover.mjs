/**
 * mover.mjs — legacy compatibility entrypoint.
 *
 * Claude-specific move/delete operations now live in
 * src/harness/adapters/claude-operations.mjs.
 */

export {
  sharesGlobalClaudeDir,
  moveItem,
  deleteItem,
  getValidDestinations,
} from "./harness/adapters/claude-operations.mjs";
