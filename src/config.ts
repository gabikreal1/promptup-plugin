/**
 * PromptUp configuration manager.
 *
 * Manages ~/.promptup/config.json with defaults.
 * First run creates the file with recommended settings.
 * Users override what they want — the file IS the documentation.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PromptUpConfig {
  evaluation: {
    auto_trigger: 'off' | 'prompt_count' | 'session_end';
    interval: number;
    weight_profile: 'balanced' | 'greenfield' | 'bugfix' | 'refactor' | 'security_review';
    timeout_seconds: number;
    feedback_detail: 'brief' | 'standard' | 'detailed';
  };
  dimensions: {
    enabled: string[];
    custom_weights: Record<string, number> | null;
  };
  decisions: {
    signal_filter: 'high' | 'high+medium' | 'all';
    show_routine_count: boolean;
  };
  pr_report: {
    auto_post: boolean;
    base_branch: string;
  };
  classification: {
    bands: Record<string, [number, number]>;
  };
  statusline: {
    enabled: boolean;
    show_recommendation: boolean;
  };
}

// ─── Defaults (the PromptUp opinion) ────────────────────────────────────────

export const DEFAULT_CONFIG: PromptUpConfig = {
  evaluation: {
    auto_trigger: 'off',
    interval: 10,
    weight_profile: 'balanced',
    timeout_seconds: 120,
    feedback_detail: 'standard',
  },
  dimensions: {
    enabled: ['all'],
    custom_weights: null,
  },
  decisions: {
    signal_filter: 'high+medium',
    show_routine_count: true,
  },
  pr_report: {
    auto_post: false,
    base_branch: 'auto',
  },
  classification: {
    bands: {
      junior: [0, 40],
      middle: [41, 70],
      senior: [71, 100],
    },
  },
  statusline: {
    enabled: true,
    show_recommendation: true,
  },
};

// ─── Config path ────────────────────────────────────────────────────────────

function getConfigPath(): string {
  const dir = process.env.CLAUDE_PLUGIN_DATA ?? join(homedir(), '.promptup');
  return join(dir, 'config.json');
}

// ─── Read / Write ───────────────────────────────────────────────────────────

export function loadConfig(): PromptUpConfig {
  const path = getConfigPath();
  if (!existsSync(path)) {
    // First run — create with defaults
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    // Deep merge with defaults so new fields get populated on upgrade
    return deepMerge(DEFAULT_CONFIG, raw) as PromptUpConfig;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: PromptUpConfig): void {
  const path = getConfigPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function updateConfig(updates: Record<string, unknown>): PromptUpConfig {
  const config = loadConfig();
  // Apply dot-path updates: "evaluation.interval" = 5
  for (const [key, value] of Object.entries(updates)) {
    setNestedValue(config, key, value);
  }
  saveConfig(config);
  return config;
}

export function getConfigValue(path: string): unknown {
  const config = loadConfig();
  return getNestedValue(config, path);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function deepMerge(defaults: any, overrides: any): any {
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    if (
      typeof defaults[key] === 'object' &&
      defaults[key] !== null &&
      !Array.isArray(defaults[key]) &&
      typeof overrides[key] === 'object' &&
      overrides[key] !== null &&
      !Array.isArray(overrides[key])
    ) {
      result[key] = deepMerge(defaults[key], overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}

function setNestedValue(obj: any, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === undefined) current[parts[i]] = {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

function getNestedValue(obj: any, path: string): unknown {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}
