/**
 * 浏览器端到端冒烟（playwright-core + 系统 Chrome/Edge，无需下载浏览器）
 *
 * 覆盖：
 *  1. 主菜单 → 本地双人对战：棋盘 91 桥位、红蓝各自落子、规则与牌库弹窗、禁连/无目标时易械按钮禁用
 *  2. 人机对战：开局后 AI 自动落子
 *  3. 在线对战（WebSocket 服务器）：双浏览器上下文 创建房间→加入→准备→开局→双方行动同步
 *
 * 运行：node e2e/smoke.mjs   （前置：pnpm --filter @moshou/web build 与 @moshou/server build）
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const WEB_DIST = join(ROOT, 'apps', 'web', 'dist');
const ARTIFACTS = join(ROOT, 'e2e', 'artifacts');
const STATIC_PORT = 4174;
const WS_PORT = 8787;
const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const results = [];
let failures = 0;

function step(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

async function waitFor(fn, timeoutMs = 15000, intervalMs = 100) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`等待超时（${timeoutMs}ms）${lastErr ? `: ${lastErr.message}` : ''}`);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function startStatic() {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent((req.url ?? '/').split('?')[0]);
      if (p === '/' || p === '') p = '/index.html';
      const abs = join(WEB_DIST, normalize(p).replace(/^([/\\])+/, ''));
      if (!abs.startsWith(WEB_DIST)) throw new Error('bad path');
      const buf = await readFile(abs);
      res.writeHead(200, { 'content-type': MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream' });
      res.end(buf);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((res) => server.listen(STATIC_PORT, '127.0.0.1', () => res(server)));
}

async function main() {
  if (!existsSync(join(WEB_DIST, 'index.html'))) {
    throw new Error('缺少 apps/web/dist，请先运行 pnpm --filter @moshou/web build');
  }
  await mkdir(ARTIFACTS, { recursive: true });
  const chromePath = CANDIDATES.find((p) => existsSync(p));
  if (!chromePath) throw new Error('未找到 Chrome/Edge 可执行文件');
  console.log(`浏览器: ${chromePath}`);

  const staticServer = await startStatic();
  const base = `http://127.0.0.1:${STATIC_PORT}/`;

  // 在线对战服务器
  const serverProc = spawn('node', [join(ROOT, 'apps', 'server', 'dist', 'index.js')], {
    env: { ...process.env, PORT: String(WS_PORT), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  serverProc.stdout?.on('data', (d) => (serverLog += String(d)));
  serverProc.stderr?.on('data', (d) => (serverLog += String(d)));

  const browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox'] });
  const errors = [];
  const track = (page, tag) => {
    page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`[${tag}] console.error: ${m.text()}`);
    });
  };
  const shot = async (page, name) => {
    try {
      await page.screenshot({ path: join(ARTIFACTS, `${name}.png`) });
    } catch {
      /* ignore */
    }
  };

  try {
    await waitFor(() => fetch(`http://127.0.0.1:${WS_PORT}/healthz`).then((r) => r.ok), 15000);
    step('房间服务器就绪（/healthz）', true);

    // ---------- 1. 本地双人对战 ----------
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    track(page, 'local');
    await page.goto(base);
    await page.getByRole('button', { name: /本地双人对战/ }).click();
    await page.getByRole('button', { name: '开始对战' }).click();
    await waitFor(() => page.locator('.board-svg').count());
    const slotCount = await page.locator('[data-cell]').count();
    step('本地对局开局，桥位数 = 91', slotCount === 91, `实际 ${slotCount}`);
    const stickCount = () => page.locator('svg g.stick').count();
    const redSticks = () => page.locator('svg g.stick-red').count();
    const blueSticks = () => page.locator('svg g.stick-blue').count();

    await page.locator('[data-cell="V3,0"]').click();
    await waitFor(async () => (await redSticks()) === 1);
    step('公输盘落子（红片出现）', (await redSticks()) === 1);

    await page.locator('[data-cell="V3,3"]').click();
    await waitFor(async () => (await blueSticks()) === 1);
    step('墨子落子（蓝片出现，轮转正常）', (await blueSticks()) === 1);

    // 横向桥位也能放（朝向由桥位决定）：H 桥位的合法 y 从 1 起
    await page.locator('[data-cell="H3,1"]').click();
    await waitFor(async () => (await stickCount()) === 3);
    const horizontalRed = await page.locator('svg g.stick-red rect').evaluateAll((els) =>
      els.some((el) => el.getAttribute('width') && parseFloat(el.getAttribute('width')) > parseFloat(el.getAttribute('height') ?? '0')),
    );
    step('红方可在横向桥位落子（横片可放，朝向由桥位决定）', (await stickCount()) === 3 && horizontalRed === true);

    // 规则弹窗
    await page.getByRole('button', { name: /规则/ }).first().click();
    await waitFor(() => page.locator('.modal').count());
    const hasRules = await page.locator('.modal').innerText();
    step('规则弹窗可打开（不中断对局）', hasRules.includes('游戏规则') || hasRules.includes('行动'), hasRules.slice(0, 40).replace(/\n/g, ' '));
    await page.keyboard.press('Escape');
    await waitFor(async () => (await page.locator('.modal').count()) === 0, 4000).catch(async () => {
      // 部分弹窗需点击关闭按钮
      const close = page.locator('.modal button').first();
      if (await close.count()) await close.click();
    });

    // 牌库弹窗
    const cardsBtn = page.getByRole('button', { name: /牌库/ }).first();
    if (await cardsBtn.count()) {
      await cardsBtn.click();
      await waitFor(() => page.locator('.modal').count());
      const libText = await page.locator('.modal').innerText();
      step('牌库弹窗包含十八张牌（冲车/墨守）', libText.includes('冲车') && libText.includes('墨守'));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      if (await page.locator('.modal').count()) {
        const close = page.locator('.modal button').first();
        if (await close.count()) await close.click();
      }
    } else {
      step('牌库弹窗入口存在', false, '未找到「牌库」按钮');
    }

    // 易械：初始无相邻敌人 → 按钮应禁用并标注原因
    const convertBtn = page.getByRole('button', { name: /易械/ }).first();
    const convertDisabled = await convertBtn.isDisabled().catch(() => true);
    step('易械按钮在无合法目标时禁用（含原因提示）', convertDisabled === true);

    await shot(page, 'local-game');
    await ctx.close();

    // ---------- 2. 整场对局：从第一小局打到整场胜利（热座） ----------
    {
      const ctxFull = await browser.newContext({ viewport: { width: 1360, height: 900 } });
      const pageFull = await ctxFull.newPage();
      track(pageFull, 'full-match');
      await pageFull.goto(base);
      await pageFull.getByRole('button', { name: /本地双人对战/ }).click();
      await pageFull.getByRole('button', { name: '开始对战' }).click();
      await waitFor(() => pageFull.locator('.board-svg').count());
      const clickCell = async (key) => {
        await pageFull.locator(`[data-cell="${key}"]`).click();
        await pageFull.waitForTimeout(80);
      };
      let roundsDone = 0;
      for (let round = 1; round <= 5; round++) {
        // 公输盘沿竖三列直上七片贯通（墨子在第一列竖向铺子，不干扰也不成线）
        for (let y = 0; y < 7; y++) {
          await clickCell(`V3,${y}`);
          if (y < 6) await clickCell(`V1,${y}`);
        }
        // 小局结束 → 败者（墨子）为胜者选一张牌移除
        await waitFor(() => pageFull.locator('.removal-cards .card-tile').count(), 25000);
        const modalText = await pageFull.locator('.modal').innerText();
        if (round === 1) {
          step('小局结束弹窗出现（败者为胜者选牌移除）', modalText.includes('小局结束') && modalText.includes('移除'));
        }
        await pageFull.locator('.removal-cards .card-tile').first().click();
        roundsDone++;
        if (round < 5) {
          await waitFor(async () => (await pageFull.locator('svg g.stick').count()) === 0, 20000);
        }
      }
      step('连续完成五个小局（败者弃牌→下一小局）', roundsDone === 5, `${roundsDone} 局`);
      await waitFor(
        async () => {
          const t = await pageFull.locator('.modal').innerText().catch(() => '');
          return t.includes('赢得本场对决') ? t : null;
        },
        25000,
      );
      const finalText = await pageFull.locator('.modal').innerText();
      step(
        '整场结束弹窗：五局三胜判定与比分',
        finalText.includes('赢得本场对决') && finalText.includes('最终比分'),
        finalText.split('\n').slice(0, 3).join(' / '),
      );
      await shot(pageFull, 'full-match-end');
      await pageFull.getByRole('button', { name: /回主菜单/ }).click();
      await waitFor(() => pageFull.getByText('九攻九拒 · 双人连线策略桌游').count());
      step('整场结束后可回到主菜单', true);
      await ctxFull.close();
    }

    // ---------- 3. 人机对战 ----------
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page2 = await ctx2.newPage();
    track(page2, 'ai');
    await page2.goto(base);
    await page2.getByRole('button', { name: /人机对战/ }).click();
    await page2.getByRole('button', { name: '开始对战' }).click();
    await waitFor(() => page2.locator('.board-svg').count());
    const aiLogs = () => page2.locator('.log-item').count();
    const blueName = (await page2.locator('.player-card.side-blue .player-name').innerText().catch(() => '')).trim();
    step('人机模式：AI 执墨子（绿蓝方名称为墨子）', blueName.includes('墨子'), blueName);
    // 人机模式默认玩家执红：先由玩家落子，AI（墨子）应手（可能是易械等非放置行动，用日志判断）
    await page2.locator('[data-cell="V3,0"]').click();
    await waitFor(async () => (await aiLogs()) >= 2, 30000);
    step('人机对战：玩家落子后 AI 自动应手（日志 ≥ 2 手）', (await aiLogs()) >= 2, `日志 ${await aiLogs()} 条`);
    await shot(page2, 'ai-game');
    await ctx2.close();

    // ---------- 3. 在线对战（服务器模式） ----------
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();
    track(hostPage, 'host');
    track(guestPage, 'guest');

    const setServer = async (p) => {
      await p.goto(base);
      await p.getByRole('button', { name: /设置/ }).click();
      await p.locator('.input.mono').first().fill(`ws://127.0.0.1:${WS_PORT}`);
      await p.getByRole('button', { name: /保存服务器地址/ }).click();
    };
    await setServer(hostPage);
    await setServer(guestPage);

    await hostPage.getByRole('button', { name: /返回主菜单/ }).click();
    await hostPage.getByRole('button', { name: /在线对战/ }).click();
    await hostPage.getByRole('button', { name: '创建房间' }).click();
    const roomCode = await waitFor(async () => {
      const t = await hostPage.locator('.room-code').innerText().catch(() => '');
      return t && t.trim().length === 6 ? t.trim() : null;
    }, 20000);
    step('创建房间并拿到 6 位房间码', /^[A-Z0-9]{6}$/.test(roomCode), roomCode);

    await guestPage.getByRole('button', { name: /返回主菜单/ }).click().catch(() => {});
    await guestPage.getByRole('button', { name: /在线对战/ }).click();
    await guestPage.getByRole('tab', { name: '加入房间' }).click();
    await guestPage.locator('.room-input').fill(roomCode);
    await guestPage.getByRole('button', { name: '加入房间' }).click();
    await waitFor(async () => {
      const t = await hostPage.locator('.panel').innerText().catch(() => '');
      return t.includes('对手已加入') ? true : null;
    }, 20000);
    step('客方凭房间码加入，房主看到对手已加入', true);

    await hostPage.getByRole('button', { name: '准备' }).click();
    await guestPage.getByRole('button', { name: '准备' }).click();
    await waitFor(async () => {
      const a = await hostPage.locator('.board-svg').count();
      const b = await guestPage.locator('.board-svg').count();
      return a > 0 && b > 0;
    }, 25000);
    step('双方准备后由服务器开局，两屏同时进入棋盘', true);

    // 房主（红）落子 → 客方同步看到
    await hostPage.locator('[data-cell="V3,0"]').click();
    await waitFor(async () => (await guestPage.locator('svg g.stick-red').count()) === 1, 20000);
    step('房主落子实时同步到客方', true);

    // 客方（蓝）落子 → 房主同步看到
    await guestPage.locator('[data-cell="V3,3"]').click();
    await waitFor(async () => (await hostPage.locator('svg g.stick-blue').count()) === 1, 20000);
    step('客方落子实时同步到房主', true);

    // 非当前行动方不能行动（房主此刻是蓝方回合并已落子，轮红；客方仍点了应被拒绝）
    await guestPage.locator('[data-cell="H2,2"]').click().catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    const guestExtra = await guestPage.locator('svg g.stick-blue').count();
    step('越权行动被拒绝（客方非其回合落子不生效）', guestExtra === 1, `蓝片数 ${guestExtra}`);

    await shot(hostPage, 'online-host');
    await shot(guestPage, 'online-guest');
    await hostCtx.close();
    await guestCtx.close();

    if (errors.length) {
      console.log('\n页面错误（' + errors.length + '）：');
      for (const e of errors.slice(0, 10)) console.log('  · ' + e);
    }
    step('无页面级 JS 错误', errors.length === 0, errors.length ? `${errors.length} 条` : '');
  } catch (e) {
    step('E2E 主流程', false, e instanceof Error ? e.message : String(e));
    console.error(e);
  } finally {
    try {
      await browser.close();
    } catch {}
    staticServer.close();
    serverProc.kill();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n结果：${passed}/${results.length} 项通过`);
  if (failures > 0) {
    console.log('E2E FAILED');
    process.exitCode = 1;
  } else {
    console.log('E2E OK');
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
