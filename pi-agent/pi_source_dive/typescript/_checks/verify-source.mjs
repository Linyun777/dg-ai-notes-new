// Run from any directory: node verify-source.mjs <official-pi-checkout> [isolated-package-directory]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const revision = '4a080252f06caf63a525d7873c5d94d3c23887e0';
const sourceRoot = resolve(process.argv[2] ?? '');
assert(process.argv[2], 'Pass the official Pi checkout path');
const chapterRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim(), revision);
execFileSync('git', ['diff', '--quiet', revision, '--', 'README.md', 'package.json', 'packages'], { cwd: sourceRoot });
for (const name of ['ai', 'agent', 'coding-agent']) {
  const pkg = JSON.parse(readFileSync(join(sourceRoot, 'packages', name, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '1.4.0', name);
}

const chapters = [1, 2, 3].map((no) => {
  const name = readdirSync(chapterRoot).find((file) => file.startsWith(`第${no}章-`));
  assert(name, `Missing chapter ${no}`);
  return { no, path: join(chapterRoot, name), body: readFileSync(join(chapterRoot, name), 'utf8') };
});
const documents = [
  ...chapters,
  ...['README.md', '版本审计与更新方案.md', '补充-v1.4重要机制.md'].map((name) => ({
    path: join(chapterRoot, name), body: readFileSync(join(chapterRoot, name), 'utf8'),
  })),
];
let officialReferences = 0;
let localLinks = 0;
const seen = new Set();
for (const doc of documents) {
  assert.equal((doc.body.match(/^```/gm) ?? []).length % 2, 0, `Unclosed code fence: ${doc.path}`);
  for (const [, target] of doc.body.matchAll(/\]\(([^)]+)\)/g)) {
    if (target.startsWith('https://github.com/earendil-works/pi/blob/')) {
      const url = new URL(target);
      const prefix = `/earendil-works/pi/blob/${revision}/`;
      assert(url.pathname.startsWith(prefix), `Unpinned source: ${target}`);
      const file = join(sourceRoot, decodeURIComponent(url.pathname.slice(prefix.length)));
      assert(existsSync(file), `Missing official source: ${target}`);
      const lines = readFileSync(file, 'utf8').split('\n');
      if (url.hash) {
        const anchor = url.hash.match(/^#L(\d+)(?:-L(\d+))?$/);
        assert(anchor, `Unknown line anchor: ${target}`);
        for (const line of anchor.slice(1).filter(Boolean)) assert(Number(line) <= lines.length && Number(line) > 0, target);
      }
      seen.add(target);
      officialReferences++;
    } else if (!/^(?:https?:|#|\/)/.test(target)) {
      assert(existsSync(resolve(dirname(doc.path), decodeURIComponent(target.split('#')[0]))), `Broken local link: ${target}`);
      localLinks++;
    }
  }
}
for (const chapter of chapters) {
  for (const [path] of chapter.body.matchAll(/packages\/[\w./-]+\.(?:ts|json)\b/g)) {
    assert(existsSync(join(sourceRoot, path)), `Missing chapter path: ${path}`);
  }
}

const contracts = [
  ['packages/agent/src/types.ts', ['finishTurn?: FinishTurn', 'prepareRequest?: PrepareRequest', 'export interface AgentContext', 'export type StreamFn']],
  ['packages/agent/src/agent-loop.ts', ['export async function runAgentLoop(', 'failToolCallsFromTruncatedMessage', 'declareToolChanges', 'finalizedCalls.every']],
  ['packages/coding-agent/src/core/sdk.ts', ['export interface CreateAgentSessionResult', 'session: AgentSession', 'Promise<CreateAgentSessionResult>']],
  ['packages/ai/src/types.ts', ['export type Message = SystemMessage | UserMessage | AssistantMessage | ToolResultMessage', 'export type TranscriptContext']],
];
for (const [file, symbols] of contracts) {
  const source = readFileSync(join(sourceRoot, file), 'utf8');
  for (const symbol of symbols) assert(source.includes(symbol), `${file}: ${symbol}`);
}
const agentTypes = readFileSync(join(sourceRoot, 'packages/agent/src/types.ts'), 'utf8');
assert(!agentTypes.includes('shouldStopAfterTurn'));
const aiTypes = readFileSync(join(sourceRoot, 'packages/ai/src/types.ts'), 'utf8');
assert.equal((aiTypes.match(/export type KnownProvider =([\s\S]+?);/)[1].match(/\|/g) ?? []).length, 42);
console.log(`Source v1.4.0 / ${revision}: ${officialReferences} source links (${seen.size} unique), ${localLinks} local links; chapter paths and key contracts passed`);

if (process.argv[3]) {
  const packagesRoot = resolve(process.argv[3]);
  for (const name of ['pi-ai', 'pi-agent-core', 'pi-coding-agent']) {
    const pkg = JSON.parse(readFileSync(join(packagesRoot, 'node_modules/@earendil-works', name, 'package.json'), 'utf8'));
    assert.equal(pkg.version, '1.4.0', name);
  }
  const blocks = (text) => [...text.matchAll(/^```typescript\n([\s\S]*?)^```/gm)].map((match) => match[1]);
  const first = blocks(chapters[0].body);
  const second = blocks(chapters[1].body).filter((body) => body.includes('const models = createModels(') || body.includes('const stream = models.streamSimple('));
  assert.equal(first.length, 3);
  assert.equal(second.length, 2);
  for (const [name, examples] of [['chapter01', first], ['chapter02', second]]) {
    const path = join(packagesRoot, `${name}.mts`);
    writeFileSync(path, examples.join('\n\n'));
    execFileSync(process.execPath, [
      join(packagesRoot, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict',
      '--module', 'NodeNext', '--target', 'ES2023', '--skipLibCheck', '--types', 'node', path,
    ], { cwd: packagesRoot, stdio: 'inherit' });
    console.log(`${name}: ${examples.length} actual chapter example blocks passed strict type checking`);
  }
}
