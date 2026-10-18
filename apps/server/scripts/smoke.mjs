#!/usr/bin/env node
/**
 * 《墨守成规》服务器冒烟测试。
 *
 * 流程：启动（或复用）本机服务器 → 两个客户端走完
 * 建房→加入→就绪→开局→行动→错误→断线重连 全流程 → 全部通过输出 SMOKE OK。
 *
 * 用法：
 *   pnpm --filter @moshou/server build   # 先编译
 *   node apps/server/scripts/smoke.mjs   # 或 pnpm --filter @moshou/server smoke
 *
 * 端口可用 MSCG_SMOKE_PORT 覆盖（默认 8787）。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '..');
const distEntry = path.join(serverDir, 'dist', 'index.js');
const PORT = process.env.MSCG_SMOKE_PORT ?? '8787';
const BASE = `ws://127.0.0.1:${PORT}/ws`;
const HEALTH_URL = `http://127.0.0.1:${PORT}/healthz`;
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function healthz() {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.ok === true;
  } catch {
    return false;
  }
}

/** 启动服务器子进程；若本机已有服务器在监听则复用。返回子进程句柄（复用时为 null）。 */
async function ensureServer() {
  if (await healthz()) {
    console.log(`[smoke] 复用已运行的服务器 127.0.0.1:${PORT}`);
    return null;
  }
  if (!existsSync(distEntry)) {
    throw new Error('未找到 dist/index.js，请先执行 pnpm --filter @moshou/server build');
  }
  console.log('[smoke] 启动服务器子进程…');
  const child = spawn(process.execPath, [distEntry], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'inherit',
    windowsHide: true,
  });
  for (let i = 0; i < 60; i++) {
    if (await healthz()) {
      console.log('[smoke] 服务器就绪');
      return child;
    }
    if (child.exitCode !== null) {
      throw new Error(`服务器进程提前退出（exit code ${child.exitCode}）`);
    }
    await sleep(200);
  }
  child.kill();
  throw new Error('等待服务器就绪超时');
}

/** 带消息队列与 expect 等待器的 ws 客户端 */
function makeClient(url, label) {
  const ws = new WebSocket(url);
  const queue = [];
  const waiters = [];
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    const i = waiters.findIndex((w) => w.type === msg.t);
    if (i >= 0) {
      const w = waiters.splice(i, 1)[0];
      clearTimeout(w.timer);
      w.resolve(msg);
    } else {
      queue.push(msg);
    }
  });
  ws.on('error', () => {
    /* close 会随后触发 */
  });
  const opened = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return {
    label,
    ws,
    opened,
    send(obj) {
      ws.send(JSON.stringify(obj));
    },
    expect(type, timeoutMs = 5000) {
      const i = queue.findIndex((m) => m.t === type);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const w = { type, resolve, reject, timer: null };
        w.timer = setTimeout(() => {
          const idx = waiters.indexOf(w);
          if (idx >= 0) waiters.splice(idx, 1);
          reject(new Error(`${label}: 等待消息 ${type} 超时`));
        }, timeoutMs);
        waiters.push(w);
      });
    },
    close() {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
  };
}

async function main() {
  let child = null;
  const clients = [];
  let failures = 0;

  const ok = (cond, label, extra) => {
    if (cond) {
      console.log(`  ✓ ${label}`);
    } else {
      failures += 1;
      console.error(`  ✗ ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`);
    }
  };
  const client = (url, label) => {
    const c = makeClient(url, label);
    clients.push(c);
    return c;
  };

  try {
    child = await ensureServer();

    // 1) A 建房 → created（6 位房间码 + token）
    const A = client(`${BASE}`, 'A(host)');
    await A.opened;
    A.send({ t: 'create', name: 'Alice', config: { size: 5, pool: 12, firstTurn: 'red' } });
    const created = await A.expect('created');
    ok(typeof created.code === 'string' && CODE_RE.test(created.code), 'host create 收到 6 位房间码', created);
    ok(typeof created.token === 'string' && created.token.length >= 16, 'host create 收到 token', created.token);
    const code = created.code;

    A.send({ t: 'ping' });
    await A.expect('pong');
    ok(true, 'ping → pong');

    // 2) B 凭房间码加入 → joined（token，state=null 未开局）
    const B = client(`${BASE}?code=${code}`, 'B(guest)');
    await B.opened;
    B.send({ t: 'join', name: 'Bob' });
    const joined = await B.expect('joined');
    ok(typeof joined.token === 'string' && joined.state === null, 'guest join 收到 token 且未开局', joined);
    const aPeer = await A.expect('peer');
    ok(aPeer.name === 'Bob' && aPeer.present === true, 'host 收到 guest 上线 peer', aPeer);
    const bPeer = await B.expect('peer');
    ok(bPeer.name === 'Alice' && bPeer.present === true, 'guest 收到 host 上线 peer', bPeer);

    // 3) 双方就绪 → 开局广播 state（回合 = red）
    A.send({ t: 'ready' });
    B.send({ t: 'ready' });
    const s0a = await A.expect('state');
    const s0b = await B.expect('state');
    ok(s0a.state.round.turn === 'red' && s0a.state.round.log.length === 0, '开局广播 state（回合=red）', s0a.state.round);
    ok(s0b.state.round.log.length === 0, 'guest 同样收到开局 state');

    // 4) B 非法抢先（当前是 red 回合）→ NOT_YOUR_TURN
    B.send({ t: 'action', seq: 0, action: { kind: 'place', side: 'blue', cell: 'H1,1' } });
    const err1 = await B.expect('error');
    ok(err1.code === 'NOT_YOUR_TURN', 'B 抢先行动 → NOT_YOUR_TURN', err1);

    // 5) A 合法行动 → 双方收到新 state
    A.send({ t: 'action', seq: 0, action: { kind: 'place', side: 'red', cell: 'H0,1' } });
    const s1a = await A.expect('state');
    const s1b = await B.expect('state');
    ok(s1a.state.round.log.length === 1 && s1a.state.round.turn === 'blue', 'A 合法放置后 state 更新（轮到 blue）', s1a.state.round.log);
    ok(s1b.state.round.cells['H0,1']?.side === 'red', 'guest 同步看到 H0,1 为红方木片');

    // 6) B 合法行动 → state
    B.send({ t: 'action', seq: 1, action: { kind: 'place', side: 'blue', cell: 'H1,1' } });
    const s2b = await B.expect('state');
    const s2a = await A.expect('state');
    ok(s2b.state.round.log.length === 2 && s2b.state.round.turn === 'red', 'B 合法放置后 state 更新（轮到 red）');
    ok(s2a.state.round.cells['H1,1']?.side === 'blue', 'host 同步看到 H1,1 为蓝方木片');

    // 7) A 重复 seq → BAD_SEQ
    A.send({ t: 'action', seq: 1, action: { kind: 'place', side: 'red', cell: 'H0,2' } });
    const err2 = await A.expect('error');
    ok(err2.code === 'BAD_SEQ', '重复 seq → BAD_SEQ', err2);

    // 8) A 非法行动（占用位放置）→ ILLEGAL
    A.send({ t: 'action', seq: 2, action: { kind: 'place', side: 'red', cell: 'H0,1' } });
    const err3 = await A.expect('error');
    ok(err3.code === 'ILLEGAL', '占用位放置 → ILLEGAL', err3);

    // 9) A 断线 → B 收到离线 peer；A 凭 token 重连 → resync + B 收到上线 peer
    A.close();
    const off = await B.expect('peer');
    ok(off.name === 'Alice' && off.present === false, 'A 断线后 B 收到 peer present:false', off);

    const A2 = client(`${BASE}`, 'A(reconnect)');
    await A2.opened;
    A2.send({ t: 'reconnect', token: created.token });
    const resync = await A2.expect('resync');
    ok(
      resync.state && resync.state.round.log.length === 2 && resync.state.round.turn === 'red',
      'token 重连收到 resync（状态与断线前一致）',
      resync.state?.round.log,
    );
    const on = await B.expect('peer');
    ok(on.name === 'Alice' && on.present === true, 'A 重连后 B 收到 peer present:true', on);

    // 10) 房间不存在 → NO_ROOM
    const C = client(`${BASE}?code=ABCDEF`, 'C');
    await C.opened;
    C.send({ t: 'join', name: 'Carol' });
    const err4 = await C.expect('error');
    ok(err4.code === 'NO_ROOM', '不存在房间 join → NO_ROOM', err4);

    // 11) 房间已满 → ROOM_FULL
    const D = client(`${BASE}?code=${code}`, 'D');
    await D.opened;
    D.send({ t: 'join', name: 'Dave' });
    const err5 = await D.expect('error');
    ok(err5.code === 'ROOM_FULL', '满员房间 join → ROOM_FULL', err5);

    // 12) 单条消息 > 64KB → 服务器断开
    const E = client(`${BASE}`, 'E(oversize)');
    await E.opened;
    const eClosed = new Promise((resolve) => E.ws.on('close', resolve));
    E.ws.send('x'.repeat(70 * 1024));
    const eClosedInTime = await Promise.race([eClosed.then(() => true), sleep(3000).then(() => false)]);
    ok(eClosedInTime, '超大消息被服务器断开');

    // 13) 限速：单连接每秒最多 20 条 → 超出断开
    const F = client(`${BASE}`, 'F(rate)');
    await F.opened;
    const fClosed = new Promise((resolve) => F.ws.on('close', resolve));
    for (let i = 0; i < 25; i++) F.send({ t: 'ping' });
    const fClosedInTime = await Promise.race([fClosed.then(() => true), sleep(3000).then(() => false)]);
    ok(fClosedInTime, '超速连接被服务器断开');
  } catch (err) {
    failures += 1;
    console.error('SMOKE FAILED:', err?.stack ?? err);
  } finally {
    for (const c of clients) c.close();
    if (child) child.kill();
  }

  if (failures > 0) {
    console.error(`SMOKE FAILED（${failures} 项未通过）`);
    process.exitCode = 1;
  } else {
    console.log('SMOKE OK');
  }
}

main();
