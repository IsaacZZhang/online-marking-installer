#!/usr/bin/env node
// 在线阅卷批改助手 · 一句话安装器
//
//   npx github:IsaacZZhang/online-marking-installer install     # 已购买 → 初始化；未购买 → 输出给 agent 的购买指令
//   npx github:IsaacZZhang/online-marking-installer status      # 查看本机安装情况
//
// 本安装器不含 skill 本体，也不碰支付：未购买时只把 skillpay 官方购买流程的精确指令交给 agent，
// 由用户本人扫码确认；买好后再运行一次即完成初始化（skill 自带的 scripts/setup.sh / setup.cmd）。
// 退出码：0 就绪 · 10 只差用户在界面上点一下 · 3 需要购买（按输出执行后重跑）· 1 失败 · 2 用法错误
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(readFileSync(path.join(HERE, '..', 'package.json'), 'utf8'));
const CFG = PKG.config;
const IS_WIN = process.platform === 'win32';
const HOME = (IS_WIN ? process.env.USERPROFILE : process.env.HOME) || homedir();
const NPX = `npx -y ${CFG.npxSpec}`;

// ───────── 宿主识别：决定 skillpay 的 --agent-type / --skills-root ─────────
function detectHost(env = process.env) {
  if (env.WORKBUDDY_CONFIG_DIR || env.WORKBUDDY_APPLICATION_NAME || env.CLIENT_INFO_PLATFORM === 'WorkBuddy') {
    return { id: 'workbuddy', name: 'WorkBuddy', root: path.join(env.WORKBUDDY_CONFIG_DIR || path.join(HOME, '.workbuddy'), 'skills') };
  }
  if (env.CODEBUDDY_PROJECT_DIR || env.CODEBUDDY_A2A_DISCOVERY_TTL_MS) return { id: 'codebuddy', name: 'CodeBuddy', root: path.join(HOME, '.codebuddy', 'skills') };
  if (env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) return { id: 'claude', name: 'Claude Code', root: path.join(HOME, '.claude', 'skills') };
  if (env.CODEX_HOME || env.CODEX_SANDBOX) return { id: 'codex', name: 'Codex', root: path.join(env.CODEX_HOME || path.join(HOME, '.codex'), 'skills') };
  // 本 skill 主要服务 WorkBuddy：识别不了宿主时默认装进 WorkBuddy（setup 也会补链）
  return { id: 'workbuddy', name: 'WorkBuddy', root: path.join(HOME, '.workbuddy', 'skills') };
}

function skillRoots(extra) {
  const env = process.env;
  const roots = [
    ['workbuddy', path.join(env.WORKBUDDY_CONFIG_DIR || path.join(HOME, '.workbuddy'), 'skills')],
    ['agents', path.join(HOME, '.agents', 'skills')],
    ['claude', path.join(HOME, '.claude', 'skills')],
    ['codebuddy', path.join(HOME, '.codebuddy', 'skills')],
    ['codex', path.join(env.CODEX_HOME || path.join(HOME, '.codex'), 'skills')],
    ['cursor', path.join(HOME, '.cursor', 'skills')],
    ['qoder', path.join(HOME, '.qoderwork', 'skills')],
    ['hermes', path.join(env.HERMES_HOME || path.join(HOME, '.hermes'), 'skills')],
  ];
  if (extra) roots.unshift(['custom', path.resolve(extra)]);
  const seen = new Set();
  return roots.filter(([, r]) => !seen.has(r) && seen.add(r) && isDir(r));
}

function isDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }

function frontmatter(dir) {
  try {
    const text = readFileSync(path.join(dir, 'SKILL.md'), 'utf8').slice(0, 6000);
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return null;
    const get = (k) => (m[1].match(new RegExp(`^${k}:\\s*["']?([^"'\\r\\n]+)`, 'm')) || [])[1]?.trim();
    return { name: get('name'), version: get('version') || '0' };
  } catch { return null; }
}

const vkey = (v) => (String(v).match(/\d+/g) || ['0']).slice(0, 4).map(Number);
const vcmp = (a, b) => { const x = vkey(a), y = vkey(b); for (let i = 0; i < 4; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };

// 找某个 skill 的所有安装（目录名可能被安装方改过，所以按 SKILL.md 的 name 认）
function findSkill(name, roots) {
  const out = [];
  for (const [agent, root] of roots) {
    let entries = [];
    try { entries = readdirSync(root); } catch { continue; }
    for (const e of entries) {
      const dir = path.join(root, e);
      if (!isDir(dir)) continue;
      const fm = frontmatter(dir);
      if (fm?.name === name) out.push({ agent, dir, version: fm.version });
    }
  }
  return out;
}

function pickBest(found) {
  return [...found].sort((a, b) => vcmp(b.version, a.version) || (a.agent === 'workbuddy' ? -1 : b.agent === 'workbuddy' ? 1 : 0))[0];
}

// ───────── 初始化：调用 skill 自带的 setup ─────────
function runSetup(dir, passthrough) {
  const script = path.join(dir, 'scripts', IS_WIN ? 'setup.cmd' : 'setup.sh');
  if (!existsSync(script)) {
    console.log(`[FAIL] ${dir} 里没有 ${path.basename(script)}：这个版本太旧，请到 ${CFG.productUrl} 更新到最新版后重跑。`);
    return 1;
  }
  const r = IS_WIN
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${script}" ${passthrough.join(' ')}"`], { stdio: 'inherit', windowsVerbatimArguments: true })
    : spawnSync('sh', [script, ...passthrough], { stdio: 'inherit' });
  if (r.error) { console.log(`[FAIL] 无法运行 ${script}：${r.error.message}`); return 1; }
  return r.status ?? 1;
}

// ───────── 未购买：给 agent 的精确指令 ─────────
function purchaseInstructions(host, onboarding, json) {
  const root = host.root;
  const steps = [];
  if (onboarding) {
    steps.push(`已检测到 skillpay-onboarding：${onboarding.dir}`);
  } else {
    steps.push('运行：npx -y @alipay/agent-payment@latest install-skill --skill-name skillpay-onboarding');
  }
  steps.push(`读取 skillpay-onboarding 的 SKILL.md，严格按它的流程购买并安装：merchantId=${CFG.merchantId}，productId=${CFG.productId}。`
    + `调用它的脚本时 --agent-type 传 "${host.name}"，--skills-root 传 "${root}"（不要用 ~/.agents/skills 等默认目录）。`
    + '登录 / 支付二维码必须原样展示给用户，由用户本人扫码确认，不要替用户授权或付款。');
  steps.push(`拿到 VERIFIED 安装回执后，再运行一次：${NPX} install —— 它会自动装好 ego lite 浏览器与阅卷环境。`);
  const text = [
    `【给 agent 的指令】本机还没有安装「${CFG.displayName}」（skill：${CFG.skill}），需要先在 skillpay 购买。`,
    ...steps.map((s, i) => `  ${i + 1}. ${s}`),
    `【可以对用户说】「${CFG.displayName}」需要先购买：我会给你一个支付宝扫码页面，你确认付款后我会自动完成安装和初始化。商品页：${CFG.productUrl}`,
  ].join('\n');
  console.log(text);
  if (json) console.log('@@OM ' + JSON.stringify({ status: 'purchase_required', merchantId: CFG.merchantId, productId: CFG.productId,
    agentType: host.name, skillsRoot: root, onboarding: onboarding?.dir || null, next: `${NPX} install` }));
  return 3;
}

// ───────── 命令 ─────────
function parse(argv) {
  const o = { cmd: 'install', json: false, root: null, pass: [] };
  const a = [...argv];
  if (a[0] && !a[0].startsWith('-')) o.cmd = a.shift();
  while (a.length) {
    const x = a.shift();
    if (x === '--json') { o.json = true; o.pass.push('--json'); }
    else if (x === '--skills-root') o.root = a.shift();
    else if (['--check', '--no-launch', '--force'].includes(x)) o.pass.push(x);
    else if (x === '-h' || x === '--help') o.cmd = 'help';
    else { o.bad = x; }
  }
  return o;
}

function help() {
  console.log(`${CFG.displayName} 安装器 v${PKG.version}

用法：
  ${NPX} install            已购买：补装进 WorkBuddy 并一键初始化；未购买：输出 skillpay 购买指令
  ${NPX} status             查看本机安装情况
  选项：--skills-root DIR   额外搜索 / 指定安装目录；--check 只检查；--no-launch 不拉起浏览器；--json 机器可读输出

退出码：0 就绪 · 10 只差用户在界面上点一下 · 3 需要先购买 · 1 失败`);
  return 0;
}

function status(o) {
  const roots = skillRoots(o.root);
  const host = detectHost();
  const found = findSkill(CFG.skill, roots);
  const onb = findSkill('skillpay-onboarding', roots);
  console.log(`宿主：${host.name}（skills 目录 ${host.root}）`);
  console.log(found.length ? found.map((f) => `[ok]   ${CFG.skill} v${f.version} · ${f.agent} · ${f.dir}`).join('\n') : `[--]   未安装 ${CFG.skill}`);
  console.log(onb.length ? `[ok]   skillpay-onboarding · ${onb[0].dir}` : '[--]   未安装 skillpay-onboarding');
  const state = path.join(HOME, '.online-marking', 'setup.json');
  if (existsSync(state)) {
    try { const s = JSON.parse(readFileSync(state, 'utf8')); console.log(`[ok]   初始化 v${s.version} · ${s.at} · ego ${s.ego_ready ? '已就绪' : '未就绪'}`); } catch { /* ignore */ }
  } else console.log('[--]   尚未初始化');
  if (o.json) console.log('@@OM ' + JSON.stringify({ status: 'status', host, installs: found, onboarding: onb.map((x) => x.dir) }));
  return 0;
}

function install(o) {
  const roots = skillRoots(o.root);
  const host = detectHost();
  if (o.root) host.root = path.resolve(o.root);
  const found = findSkill(CFG.skill, roots);
  console.log(`${CFG.displayName} 安装器 v${PKG.version} · 宿主 ${host.name}\n${'─'.repeat(60)}`);
  if (!found.length) {
    const onb = findSkill('skillpay-onboarding', skillRoots(o.root));
    return purchaseInstructions(host, onb[0], o.json);
  }
  const best = pickBest(found);
  console.log(`[ok]   已找到 ${CFG.skill} v${best.version}：${best.dir}${found.length > 1 ? `（共 ${found.length} 处，用最新的）` : ''}`);
  console.log('       开始一键初始化（装进 WorkBuddy、阅卷环境、ego lite 浏览器）…\n');
  return runSetup(best.dir, o.pass);
}

const o = parse(process.argv.slice(2));
if (o.bad) { console.error(`未知参数：${o.bad}\n`); help(); process.exit(2); }
const cmds = { install, status, help, version: () => (console.log(PKG.version), 0) };
if (!cmds[o.cmd]) { console.error(`未知命令：${o.cmd}\n`); help(); process.exit(2); }
process.exit(cmds[o.cmd](o));
