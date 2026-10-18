import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 沙箱环境禁止 fork 子进程管道，使用 Worker 线程池
    pool: 'threads',
    include: ['test/**/*.test.ts'],
  },
});
