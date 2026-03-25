#!/usr/bin/env node
/**
 * PromptUp MCP Server — standalone stdio plugin for Claude Code.
 *
 * Registers 3 tools:
 *   - evaluate_session   — evaluate a coding session across 11 skill dimensions
 *   - generate_pr_report — generate a DQS report for a git branch
 *   - get_status         — show tracking status and recent activity
 *
 * Zero infrastructure — just SQLite at ~/.promptup/promptup.db.
 */
export {};
