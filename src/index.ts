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

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { initDatabase, closeDatabase } from './db.js';
import { handleEvaluateSession, handleGeneratePRReport, handleGetStatus, handleConfigure } from './tools.js';

initDatabase();

const server = new McpServer({
  name: 'promptup',
  version: '1.0.0',
});

// Tool 1: evaluate_session
server.tool(
  'evaluate_session',
  'Evaluate a coding session across 11 skill dimensions. Spawns an independent Claude analysis of the session transcript. Returns composite score, dimension breakdown, trends, and recommendations.',
  {
    session_id: z.string().optional().describe('Session ID to evaluate. If omitted, evaluates the most recent session.'),
  },
  async (args) => {
    const result = await handleEvaluateSession(args);
    return { ...result } as any;
  },
);

// Tool 2: generate_pr_report
server.tool(
  'generate_pr_report',
  'Generate a Decision Quality Score (DQS) report for a git branch. Matches commits to sessions, analyzes developer decisions, and produces a structured markdown report. Optionally posts as a GitHub PR comment.',
  {
    branch: z.string().optional().describe('Git branch name. Defaults to current branch.'),
    post: z.boolean().optional().default(false).describe('If true, post the report as a GitHub PR comment via gh CLI.'),
  },
  async (args) => {
    const result = await handleGeneratePRReport(args);
    return { ...result } as any;
  },
);

// Tool 3: get_status
server.tool(
  'get_status',
  'Show PromptUp tracking status: session count, evaluation history, decision counts, and recent activity.',
  {},
  async () => {
    const result = await handleGetStatus({});
    return { ...result } as any;
  },
);

// Tool 4: configure
server.tool(
  'configure',
  'Show or modify PromptUp configuration. Call with no args to see all settings. Use "set" to change values (dot-path keys like "evaluation.interval"). Use "get" to read a specific value.',
  {
    get: z.string().optional().describe('Dot-path to read a specific config value, e.g. "evaluation.interval"'),
    set: z.record(z.unknown()).optional().describe('Key-value pairs to update, e.g. {"evaluation.interval": 5, "evaluation.auto_trigger": "prompt_count"}'),
  },
  async (args) => {
    const result = await handleConfigure(args);
    return { ...result } as any;
  },
);

// Start
const transport = new StdioServerTransport();
await server.connect(transport);

process.on('SIGINT', () => { closeDatabase(); process.exit(0); });
process.on('SIGTERM', () => { closeDatabase(); process.exit(0); });
