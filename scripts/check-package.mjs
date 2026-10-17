import { mkdtemp, readFile, writeFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(path.join(tmpdir(), 'scrolly-consumer-'));
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this check with npm run check:package.');
function run(args, cwd) {
    const result = spawnSync(process.execPath, [npm, ...args], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, npm_config_cache: path.join(directory, 'cache') }
    });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    return result.stdout;
}
try {
    const output = run(['pack', '--json', '--pack-destination', directory], root);
    const records = JSON.parse(output.slice(output.indexOf('[')));
    const files = records[0].files.map(file => file.path);
    assert.ok(files.includes('dist/core.js'));
    assert.ok(files.includes('dist/story.js'));
    assert.ok(files.includes('dist/js/bundle.min.js'));
    assert.ok(files.includes('docs/migration.md'));
    assert.ok(!files.some(file => /(?:^|\/)(?:keys\.js|assets|config|node_modules)(?:\/|$)/.test(file)));
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    run(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', path.join(directory, records[0].filename)], directory);
    const consumer = `import assert from 'node:assert/strict';
import { createMap, MapValidator } from 'scrolly-maplibre';
import { createStory, createSection } from 'scrolly-maplibre/story';
import { readFile } from 'node:fs/promises';
for (const value of [createMap, MapValidator, createStory, createSection]) assert.equal(typeof value, 'function');
for (const file of ['core.css', 'story.css', 'loader.css']) assert.ok((await readFile(new URL(import.meta.resolve('scrolly-maplibre/' + file)), 'utf8')).length);
assert.equal(typeof document, 'undefined');
console.log('Fresh consumer imports and stylesheet exports passed.');`;
    await writeFile(path.join(directory, 'consumer.mjs'), consumer);
    const result = spawnSync(process.execPath, ['consumer.mjs'], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    console.log(result.stdout.trim());
    const manifest = JSON.parse(await readFile(path.join(directory, 'node_modules/scrolly-maplibre/package.json'), 'utf8'));
    console.log(`Checked scrolly-maplibre ${manifest.version}: ${files.length} packed files; no demo data or keys.`);
} finally {
    const resolved = await realpath(directory);
    const temporary = await realpath(tmpdir());
    if (path.dirname(resolved).toLowerCase() !== temporary.toLowerCase() || !path.basename(resolved).startsWith('scrolly-consumer-')) {
        throw new Error('Refusing cleanup outside the consumer test directory.');
    }
    await rm(resolved, { recursive: true, force: true });
}
