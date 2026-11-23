import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// 将纯核心编译到临时目录，使用 Node 内置测试器；无需浏览器或新的测试依赖。
const output = mkdtempSync(join(tmpdir(), 'word-defense-tests-'));
try {
  execFileSync(process.execPath, [
    'node_modules/typescript/bin/tsc',
    'src/games/word-defense/core/GameWorld.ts', 'src/games/word-defense/data/battleConfig.ts',
    '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
    '--strict', '--skipLibCheck', '--rootDir', 'src/games/word-defense', '--outDir', output,
  ], { stdio: 'inherit' });
  writeFileSync(join(output, 'package.json'), '{"type":"module"}');
  execFileSync(process.execPath, ['--test', 'tests/word-defense.test.mjs'], {
    stdio: 'inherit', env: { ...process.env, WORD_DEFENSE_BUILD: output },
  });
} catch (error) {
  process.exitCode = error.status ?? 1;
} finally {
  // 测试编译产物不写入源码或仓库，失败也执行清理。
  rmSync(output, { recursive: true, force: true });
}
