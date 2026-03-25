#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

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

  // Remove skills (pup namespace)
  const pupDir = path.join(CLAUDE_DIR, 'skills', 'pup');
  if (fs.existsSync(pupDir)) {
    fs.rmSync(pupDir, { recursive: true });
    console.log(`  ${red}✗${reset} Removed skills: /pup:eval, /pup:pr-report, /pup:status`);
  }
  // Also clean up old non-namespaced skills from previous versions
  for (const skill of ['eval', 'pr-report', 'status']) {
    const dest = path.join(CLAUDE_DIR, 'skills', skill);
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true });
      console.log(`  ${red}✗${reset} Removed legacy skill: ${skill}`);
    }
  }

  // Remove hooks from settings.json
  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      let changed = false;

      for (const event of ['SessionStart', 'UserPromptSubmit']) {
        if (settings.hooks?.[event]) {
          settings.hooks[event] = settings.hooks[event].filter(
            (h) => !h.hooks?.some((hk) => hk.command?.includes('.promptup')),
          );
          if (settings.hooks[event].length === 0) delete settings.hooks[event];
          changed = true;
        }
      }

      if (settings.statusLine?.command?.includes('.promptup')) {
        delete settings.statusLine;
        changed = true;
      }

      if (changed) {
        if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
        console.log(`  ${red}✗${reset} Removed hooks and statusline from settings.json`);
      }
    } catch {}
  }

  // Also clean settings.local.json (from older installs)
  const settingsLocalPath = path.join(CLAUDE_DIR, 'settings.local.json');
  if (fs.existsSync(settingsLocalPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsLocalPath, 'utf-8'));
      let changed = false;

      for (const event of ['SessionStart', 'UserPromptSubmit']) {
        if (settings.hooks?.[event]) {
          settings.hooks[event] = settings.hooks[event].filter(
            (h) => !h.hooks?.some((hk) => hk.command?.includes('.promptup')),
          );
          if (settings.hooks[event].length === 0) delete settings.hooks[event];
          changed = true;
        }
      }

      if (settings.statusLine?.command?.includes('.promptup')) {
        delete settings.statusLine;
        changed = true;
      }

      if (changed) {
        if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;
        const remaining = Object.keys(settings).length;
        if (remaining === 0) {
          fs.unlinkSync(settingsLocalPath);
        } else {
          fs.writeFileSync(settingsLocalPath, JSON.stringify(settings, null, 2) + '\n');
        }
        console.log(`  ${red}✗${reset} Cleaned settings.local.json`);
      }
    } catch {}
  }

  // Remove MCP from .mcp.json files
  for (const mcpPath of [
    path.join(CLAUDE_DIR, '.mcp.json'),
    path.join(process.cwd(), '.mcp.json'),
  ]) {
    if (fs.existsSync(mcpPath)) {
      try {
        const mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
        if (mcp.mcpServers?.promptup) {
          delete mcp.mcpServers.promptup;
          if (Object.keys(mcp.mcpServers).length === 0) {
            fs.unlinkSync(mcpPath);
          } else {
            fs.writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + '\n');
          }
          console.log(`  ${red}✗${reset} Removed MCP from ${mcpPath}`);
        }
      } catch {}
    }
  }

  // Remove plugin dir
  if (fs.existsSync(PLUGIN_DIR)) {
    fs.rmSync(PLUGIN_DIR, { recursive: true });
    console.log(`  ${red}✗${reset} Removed plugin at ${PLUGIN_DIR}`);
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
  scope = 'global';
  console.log(`${dim}Installing globally (use --local for project-only)${reset}\n`);
}

// ─── Find package root (where npx extracted us) ────────────────────────────

const packageRoot = path.resolve(__dirname, '..');

// ─── Step 1: Copy plugin to ~/.promptup/plugin ─────────────────────────────

console.log(`${bold}Setting up PromptUp...${reset}\n`);

fs.mkdirSync(PLUGIN_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

// Copy dist/
copyDirSync(path.join(packageRoot, 'dist'), path.join(PLUGIN_DIR, 'dist'));
console.log(`  ${green}✓${reset} Installed plugin runtime`);

// Copy hooks/
copyDirSync(path.join(packageRoot, 'hooks'), path.join(PLUGIN_DIR, 'hooks'));
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

// Copy package.json for version tracking + dependency install
fs.copyFileSync(
  path.join(packageRoot, 'package.json'),
  path.join(PLUGIN_DIR, 'package.json'),
);

// ─── Step 2: Install dependencies ───────────────────────────────────────────

console.log(`  ${dim}Installing dependencies (better-sqlite3, MCP SDK)...${reset}`);
try {
  execSync('npm install --production --no-audit --no-fund', {
    cwd: PLUGIN_DIR,
    stdio: 'pipe',
    timeout: 120000,
  });
  console.log(`  ${green}✓${reset} Dependencies installed`);
} catch (err) {
  console.log(`  ${red}✗${reset} Dependency install failed: ${err.message}`);
  console.log(`  ${yellow}Try manually: cd ${PLUGIN_DIR} && npm install --production${reset}`);
}

// ─── Step 3: Install skills to ~/.claude/skills/pup/ ────────────────────────

const pupSkillsDir = path.join(CLAUDE_DIR, 'skills', 'pup');
fs.mkdirSync(pupSkillsDir, { recursive: true });

for (const skill of ['eval', 'pr-report', 'status']) {
  const src = path.join(PLUGIN_DIR, 'skills', 'pup', skill);
  const dest = path.join(pupSkillsDir, skill);
  if (fs.existsSync(src)) {
    copyDirSync(src, dest);
    console.log(`  ${green}✓${reset} Skill: /pup:${skill}`);
  }
}

// ─── Step 4: Configure MCP server ───────────────────────────────────────────

const mcpEntry = {
  command: 'node',
  args: [path.join(PLUGIN_DIR, 'dist', 'index.js')],
};

// MCP always goes to project .mcp.json (Claude Code reads MCP from here)
const mcpPath = path.join(process.cwd(), '.mcp.json');
const mcp = fs.existsSync(mcpPath)
  ? JSON.parse(fs.readFileSync(mcpPath, 'utf-8'))
  : {};

if (!mcp.mcpServers) mcp.mcpServers = {};
mcp.mcpServers.promptup = mcpEntry;
fs.writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + '\n');
console.log(`  ${green}✓${reset} MCP server → .mcp.json`);

// Also try to register globally via claude CLI (silent fail if not available)
try {
  execSync(
    `claude mcp add promptup -s user -- node ${path.join(PLUGIN_DIR, 'dist', 'index.js')}`,
    { stdio: 'pipe', timeout: 10000 },
  );
  console.log(`  ${green}✓${reset} MCP server → claude global config`);
} catch {
  // claude CLI not available or failed — that's fine, .mcp.json is enough
}

// ─── Step 5: Configure hooks (in settings.json like GSD does) ───────────────

const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
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

// Statusline (respect existing — prompt if already set, like GSD)
if (!settings.statusLine) {
  settings.statusLine = {
    type: 'command',
    command: `bash ${path.join(PLUGIN_DIR, 'statusline.sh')}`,
    padding: 2,
  };
  console.log(`  ${green}✓${reset} Statusline: pupmeter`);
} else if (!settings.statusLine.command?.includes('.promptup')) {
  console.log(`  ${yellow}⚠${reset} Statusline already configured — skipped (existing: ${settings.statusLine.command?.slice(0, 40)}...)`);
}

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

// ─── Step 6: Create default config ─────────────────────────────────────────

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
    /pup:eval           — Run an evaluation
    /pup:pr-report      — Generate PR report
    /pup:status         — Check status

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
