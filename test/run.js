// 安装器回归测试：假 HOME 下覆盖「未购买 / 装在 ~/.agents/skills / 已装在 WorkBuddy」三种情况。
// 用法：node test/run.js [/abs/path/to/online-marking]   （第二种情况需要真实 skill 目录，默认取同级 ../online-marking）
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, existsSync, lstatSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', 'bin', 'cli.js');
const SKILL_SRC = path.resolve(process.argv[2] || path.join(HERE, '..', '..', 'online-marking'));
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };

function run(home, args, extraEnv = {}) {
  const env = { PATH: '/usr/bin:/bin', HOME: home, USERPROFILE: home, WORKBUDDY_CONFIG_DIR: path.join(home, '.workbuddy'), ...extraEnv };
  const r = spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8', timeout: 600_000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

// 1. 未购买 → 退出码 3，指令里带商品号与 WorkBuddy 安装目录
{
  const home = mkdtempSync(path.join(tmpdir(), 'om-inst-'));
  mkdirSync(path.join(home, '.workbuddy', 'skills'), { recursive: true });
  const r = run(home, ['install', '--json']);
  check(r.code === 3, `未购买 → 退出码 3（实际 ${r.code}）`);
  check(r.out.includes('P0806000211890959') && r.out.includes('2088312185165963'), '指令包含商户号与商品号');
  check(r.out.includes(path.join(home, '.workbuddy', 'skills')), '指令把 --skills-root 指向 WorkBuddy');
  check(r.out.includes('install-skill --skill-name skillpay-onboarding'), '未装 onboarding 时提示先安装');
  check(/@@OM \{"status":"purchase_required"/.test(r.out), '输出机器可读行');
  // 已有 onboarding 时不再提示安装
  const onb = path.join(home, '.agents', 'skills', 'skillpay-onboarding');
  mkdirSync(onb, { recursive: true });
  writeFileSync(path.join(onb, 'SKILL.md'), '---\nname: skillpay-onboarding\n---\n');
  const r2 = run(home, ['install']);
  check(r2.code === 3 && r2.out.includes('已检测到 skillpay-onboarding'), '已装 onboarding 时直接指向它');
  rmSync(home, { recursive: true, force: true });
}

// 2. skillpay 装到 ~/.agents/skills（目录名被改）→ 找到并初始化，链进 WorkBuddy
if (existsSync(path.join(SKILL_SRC, 'SKILL.md'))) {
  const home = mkdtempSync(path.join(tmpdir(), 'om-inst-'));
  const dst = path.join(home, '.agents', 'skills', 'online-marking-paid');
  cpSync(SKILL_SRC, dst, { recursive: true, filter: (p) => !/[\\/](\.git|tests|__pycache__)([\\/]|$)/.test(p) });
  const r = run(home, ['install', '--no-launch']);
  const wb = path.join(home, '.workbuddy', 'skills', 'online-marking');
  check(r.code === 0, `已购买（~/.agents/skills）→ 初始化成功（退出码 ${r.code}）`);
  check(existsSync(wb) && lstatSync(wb).isSymbolicLink() && realpathSync(wb) === realpathSync(dst), '已链接进 ~/.workbuddy/skills/online-marking');
  check(existsSync(path.join(home, '.online-marking', 'setup.json')), '写了初始化标记');
  // 3. 再跑一次：WorkBuddy 里已有 → 幂等
  const r3 = run(home, ['install', '--no-launch']);
  check(r3.code === 0 && r3.out.includes('已找到 online-marking'), '重复运行幂等');
  const s = run(home, ['status']);
  check(s.code === 0 && s.out.includes('初始化 v'), 'status 显示安装与初始化状态');
  rmSync(home, { recursive: true, force: true });
} else {
  console.log(`SKIP  找不到 skill 源目录 ${SKILL_SRC}，跳过已购买场景`);
}

// 4. 用法错误
{
  const r = run(tmpdir(), ['bogus-cmd']);
  check(r.code === 2, '未知命令 → 退出码 2');
}

console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
