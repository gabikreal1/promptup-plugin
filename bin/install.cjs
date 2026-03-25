#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

// Colors
const cyan = '\x1b[36m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const red = '\x1b[31m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

const pkg = require('../package.json');
const args = process.argv.slice(2);
const hasGlobal = args.includes('--global') || args.includes('-g');
const hasLocal = args.includes('--local') || args.includes('-l');
const hasUninstall = args.includes('--uninstall') || args.includes('-u');

const HOME = os.homedir();
const PLUGIN_DIR = path.join(HOME, '.promptup', 'plugin');
const DATA_DIR = path.join(HOME, '.promptup');
const CLAUDE_DIR = path.join(HOME, '.claude');

// ─── Banner ─────────────────────────────────────────────────────────────────

console.log(`
${bold}${cyan}  ┌─────────────────────────────────────┐${reset}
${bold}${cyan}  │         ${green}PROMPTUP${cyan}  v${pkg.version}            │${reset}
${bold}${cyan}  │   AI coding skill evaluator for      │${reset}
${bold}${cyan}  │   Claude Code                         │${reset}
${bold}${cyan}  └─────────────────────────────────────┘${reset}
`);

// ─── Uninstall ──────────────────────────────────────────────────────────────

if (hasUninstall) {
  console.log(`${yellow}Uninstalling PromptUp...${reset}\n`);

  // Remove skills
  const skillsDir = path.join(CLAUDE_DIR, 'skills');
  for (const skill of ['eval', 'pr-report', 'status']) {
    const dest = path.join(skillsDir, skill);
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true });
      console.log(`  ${red}✗${reset} Removed skill: ${skill}`);
    }
  }

  // Remove MCP from global settings
  const settingsLocal = path.join(CLAUDE_DIR, 'settings.local.json');
  if (fs.existsSync(settingsLocal)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsLocal, 'utf-8'));
      if (settings.mcpServers?.promptup) {
        delete settings.mcpServers.promptup;
        fs.writeFileSync(settingsLocal, JSON.stringify(settings, null, 2) + '\n');
        console.log(`  ${red}✗${reset} Removed MCP server from settings.local.json`);
      }
    } catch {}
  }

  console.log(`\n${green}PromptUp uninstalled.${reset}`);
  console.log(`${dim}Data preserved at ${DATA_DIR} — delete manually if desired.${reset}\n`);
  process.exit(0);
}

// ─── Detect scope ───────────────────────────────────────────────────────────

let scope = 'global';
if (hasLocal) scope = 'local';
if (hasGlobal) scope = 'global';

if (!hasLocal && !hasGlobal) {
  // Default to global
  scope = 'global';
  console.log(`${dim}Installing globally (use --local for project-only)${reset}\n`);
}

// ─── Find package root (where npx extracted us) ────────────────────────────

const packageRoot = path.resolve(__dirname, '..');

// ─── Step 1: Copy plugin to ~/.promptup/plugin ─────────────────────────────

console.log(`${bold}Setting up PromptUp...${reset}\n`);

// Ensure dirs exist
fs.mkdirSync(PLUGIN_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

// Copy dist/
copyDirSync(path.join(packageRoot, 'dist'), path.join(PLUGIN_DIR, 'dist'));
console.log(`  ${green}✓${reset} Installed plugin runtime`);

// Copy hooks/
copyDirSync(path.join(packageRoot, 'hooks'), path.join(PLUGIN_DIR, 'hooks'));
// Make hooks executable
for (const f of fs.readdirSync(path.join(PLUGIN_DIR, 'hooks'))) {
  if (f.endsWith('.sh')) {
    fs.chmodSync(path.join(PLUGIN_DIR, 'hooks', f), 0o755);
  }
}
console.log(`  ${green}✓${reset} Installed hooks`);

// Copy skills/
copyDirSync(path.join(packageRoot, 'skills'), path.join(PLUGIN_DIR, 'skills'));
console.log(`  ${green}✓${reset} Installed skills`);

// Copy statusline
if (fs.existsSync(path.join(packageRoot, 'statusline.sh'))) {
  fs.copyFileSync(
    path.join(packageRoot, 'statusline.sh'),
    path.join(PLUGIN_DIR, 'statusline.sh'),
  );
  fs.chmodSync(path.join(PLUGIN_DIR, 'statusline.sh'), 0o755);
  console.log(`  ${green}✓${reset} Installed statusline`);
}

// Copy package.json for version tracking
fs.copyFileSync(
  path.join(packageRoot, 'package.json'),
  path.join(PLUGIN_DIR, 'package.json'),
);

// ─── Step 2: Install skills to ~/.claude/skills/ ────────────────────────────

const skillsDir = path.join(CLAUDE_DIR, 'skills');
fs.mkdirSync(skillsDir, { recursive: true });

for (const skill of ['eval', 'pr-report', 'status']) {
  const src = path.join(PLUGIN_DIR, 'skills', skill);
  const dest = path.join(skillsDir, skill);
  if (fs.existsSync(src)) {
    copyDirSync(src, dest);
    console.log(`  ${green}✓${reset} Skill: /${skill}`);
  }
}

// ─── Step 3: Configure MCP server ───────────────────────────────────────────

const mcpEntry = {
  command: 'node',
  args: [path.join(PLUGIN_DIR, 'dist', 'index.js')],
};

if (scope === 'global') {
  // Add to ~/.claude/settings.local.json
  const settingsPath = path.join(CLAUDE_DIR, 'settings.local.json');
  const settings = fs.existsSync(settingsPath)
    ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    : {};

  if (!settings.mcpServers) settings.mcpServers = {};
  settings.mcpServers.promptup = mcpEntry;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`  ${green}✓${reset} MCP server → ~/.claude/settings.local.json (global)`);
} else {
  // Add to .mcp.json in current directory
  const mcpPath = path.join(process.cwd(), '.mcp.json');
  const mcp = fs.existsSync(mcpPath)
    ? JSON.parse(fs.readFileSync(mcpPath, 'utf-8'))
    : {};

  if (!mcp.mcpServers) mcp.mcpServers = {};
  mcp.mcpServers.promptup = mcpEntry;
  fs.writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + '\n');
  console.log(`  ${green}✓${reset} MCP server → .mcp.json (local)`);
}

// ─── Step 4: Configure hooks ────────────────────────────────────────────────

const settingsPath = path.join(CLAUDE_DIR, 'settings.local.json');
const settings = fs.existsSync(settingsPath)
  ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
  : {};

if (!settings.hooks) settings.hooks = {};

// SessionStart: update check
if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
const hasUpdateHook = settings.hooks.SessionStart.some(
  (h) => h.hooks?.some((hk) => hk.command?.includes('check-update.sh')),
);
if (!hasUpdateHook) {
  settings.hooks.SessionStart.push({
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: `bash ${path.join(PLUGIN_DIR, 'hooks', 'check-update.sh')}`,
        async: true,
      },
    ],
  });
  console.log(`  ${green}✓${reset} Hook: SessionStart → update check`);
}

// UserPromptSubmit: auto-eval
if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];
const hasAutoEval = settings.hooks.UserPromptSubmit.some(
  (h) => h.hooks?.some((hk) => hk.command?.includes('auto-eval.sh')),
);
if (!hasAutoEval) {
  settings.hooks.UserPromptSubmit.push({
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: `bash ${path.join(PLUGIN_DIR, 'hooks', 'auto-eval.sh')}`,
        async: true,
      },
    ],
  });
  console.log(`  ${green}✓${reset} Hook: UserPromptSubmit → auto-eval`);
}

// Statusline
if (!settings.statusLine) {
  settings.statusLine = {
    type: 'command',
    command: `bash ${path.join(PLUGIN_DIR, 'statusline.sh')}`,
    padding: 2,
  };
  console.log(`  ${green}✓${reset} Statusline: pupmeter`);
}

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

// ─── Step 5: Create default config ─────────────────────────────────────────

const configPath = path.join(DATA_DIR, 'config.json');
if (!fs.existsSync(configPath)) {
  const defaultConfig = {
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
      bands: { junior: [0, 40], middle: [41, 70], senior: [71, 100] },
    },
    statusline: {
      enabled: true,
      show_recommendation: true,
    },
  };
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + '\n');
  console.log(`  ${green}✓${reset} Config: ~/.promptup/config.json`);
}

// ─── Done ───────────────────────────────────────────────────────────────────

console.log(`
${bold}${green}PromptUp installed!${reset}

  ${bold}Tools:${reset}
    evaluate_session    — Evaluate coding sessions (11 dimensions)
    generate_pr_report  — DQS reports for git branches
    get_status          — Tracking status & activity
    configure           — View/modify settings

  ${bold}Skills:${reset}
    /eval               — Run an evaluation
    /pr-report          — Generate PR report
    /status             — Check status

  ${bold}Statusline:${reset}
    pupmeter shows your latest score in the status bar

  ${bold}Config:${reset}
    ~/.promptup/config.json

${dim}Restart Claude Code to activate. Run with --uninstall to remove.${reset}
`);

// ─── Helpers ────────────────────────────────────────────────────────────────

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
