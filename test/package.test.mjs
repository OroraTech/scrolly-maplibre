import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MapConfig, MapValidator } from '../dist/core.js';
import { ConfigValidator, createStory, createSection, destroySection } from '../dist/story.js';
import { ensureMapDependencies, ensureWindGL, configureDependencies } from '../src/js/runtime/dependencies.js';
import { installDOM } from './dom-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const input = () => ({
    id: 'example',
    initParameters: { useScrollama: false, customStyle: { version: 8, sources: {}, layers: [] }, map: { center: [0, 0], zoom: 3, pitch: 0, bearing: 0 } },
    layers: []
});

test('public imports require no DOM and cause no network or page initialization', () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
        globalThis.fetch = () => { throw new Error('Unexpected network'); };
        const core = await import('./dist/core.js');
        const story = await import('./dist/story.js');
        if (typeof core.createMap !== 'function' || typeof story.createStory !== 'function') throw new Error('Missing API');
        if ('window' in globalThis || 'document' in globalThis) throw new Error('Unexpected browser globals');
    `], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
});

test('core has no eager story renderer or animation implementation', async () => {
    const visited = new Set();
    async function walk(url) {
        if (visited.has(url.href)) return '';
        visited.add(url.href);
        const source = await readFile(url, 'utf8');
        const dependencies = [...source.matchAll(/(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?['"](\.\.?\/[^'"]+)['"]/g)];
        return source + (await Promise.all(dependencies.map(match => walk(new URL(match[1], url))))).join('\n');
    }
    const graph = await walk(new URL('../dist/core.js', import.meta.url));
    assert.ok(!graph.includes('function createHero'));
    assert.ok(!graph.includes('function createScrollyEmbed'));
    assert.ok(!graph.includes('class AnimatedPaths'));
    assert.ok(!graph.includes('class WindGL'));
});

test('custom styles need no keys file; built-in styles accept an explicit key', () => {
    assert.equal(new MapConfig({ customStyle: 'style.json' }).mapTilerKey, null);
    assert.equal(new MapConfig({ mapTilerKey: 'example-public-browser-key' }).mapTilerKey, 'example-public-browser-key');
    assert.throws(() => new MapConfig(), /API key/);
});

test('map and story validators reject invalid coordinates and duplicate IDs', () => {
    const map = input();
    MapValidator.validateMapConfig(map);
    ConfigValidator.validate({ preMapContent: { sections: [{ type: 'text', content: 'No map required.' }] } });
    assert.throws(() => MapValidator.validateMapConfig(null), /Map config/);
    assert.throws(() => MapValidator.validateMapConfig({ ...map, initParameters: { ...map.initParameters, map: { ...map.initParameters.map, center: [NaN, 0] } } }), /center/);
    assert.throws(() => ConfigValidator.validate({ maps: [map, map] }), /Duplicate/);
});

test('graphics-only stories render without map dependencies and have independent lifecycles', async () => {
    const dom = installDOM();
    try {
        const config = { preMapContent: { sections: [
            { type: 'text', style: 'heading', content: 'Independent story' },
            { type: 'stats', items: [{ value: '3', label: 'stages' }] },
            { type: 'scrolly-embed', url: 'graphic.html', title: 'An example graphic', steps: [{ title: 'A stage', content: 'A description.' }] }
        ] } };
        const first = await createStory(dom.host, config);
        const second = await createStory(dom.host, config);
        assert.equal(first.maps.length, 0);
        assert.notEqual(first.element.id, second.element.id);
        assert.notEqual(first.element.children[0].id, second.element.children[0].id);
        assert.equal(dom.doc.head.children.length, 0);
        dom.flush();
        const iframe = first.element.querySelector('iframe');
        assert.equal(iframe.contentWindow.messages[0].type, 'scrolly-step');
        first.destroy();
        const remaining = dom.view.count();
        first.destroy();
        assert.equal(dom.view.count(), remaining);
        second.destroy();
        assert.equal(dom.view.count(), 0);
        assert.equal(dom.frames.size, 0);
        assert.equal(dom.host.children.length, 0);
    } finally { dom.restore(); }
});

test('embed sizing checks its source and removes its listener on destroy', () => {
    const dom = installDOM();
    try {
        const figure = createSection({ type: 'embed', url: 'chart.html', title: 'Chart' });
        const frame = figure.querySelector('iframe');
        dom.view.dispatchEvent(new MessageEvent('message', { data: { type: 'scrolly-embed-height', height: 600 } }));
        assert.equal(frame.style.height, undefined);
        const event = new Event('message');
        Object.defineProperties(event, { source: { value: frame.contentWindow }, data: { value: { type: 'scrolly-embed-height', height: 600 } } });
        dom.view.dispatchEvent(event);
        assert.equal(frame.style.height, '600px');
        destroySection(figure);
        assert.equal(dom.view.count(), 0);
    } finally { dom.restore(); }
});

test('section resources reject executable URLs', () => {
    const dom = installDOM();
    try {
        assert.throws(() => createSection({ type: 'embed', url: 'javascript:alert(1)' }), /resources/);
    } finally { dom.restore(); }
});

test('injected map dependencies require no downloads and PMTiles registration is deduplicated', async () => {
    let protocols = 0;
    const library = { addProtocol() { protocols++; } };
    const archive = { Protocol: class { constructor() { this.tile = () => {}; } } };
    await ensureMapDependencies(input(), { dependencies: { maplibregl: library }, loadDependencies: false });
    assert.equal(protocols, 0);
    await ensureMapDependencies({ ...input(), layers: [{ id: 'archive', type: 'pmtiles' }] }, { dependencies: { pmtiles: archive }, loadDependencies: false });
    await ensureMapDependencies(input(), { loadDependencies: false });
    assert.equal(protocols, 1);
    await assert.rejects(ensureWindGL({ loadDependencies: false }), /Missing dependency: windGL/);
    assert.throws(() => configureDependencies({ typo: {} }), /Unknown dependency/);
});

test('modular styles are scoped and compatibility styles remain available', async () => {
    const core = await readFile(new URL('../dist/styles/core.css', import.meta.url), 'utf8');
    const story = await readFile(new URL('../dist/styles/story.css', import.meta.url), 'utf8');
    const compatibility = await readFile(new URL('../dist/styles/styles.min.css', import.meta.url), 'utf8');
    assert.ok(!core.includes('.story-hero'));
    assert.ok(story.includes('.story-hero'));
    for (const stylesheet of [core, story]) assert.ok(!/(?:^|})(?:html|body|:root)[{:]/.test(stylesheet));
    assert.ok(compatibility.includes('.story-scrolly-embed'));
});

test('public export paths and declarations exist', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
    for (const [name, target] of Object.entries(manifest.exports)) {
        if (typeof target === 'string') await readFile(new URL('../' + target.slice(2), import.meta.url));
        else {
            await readFile(new URL('../' + target.import.slice(2), import.meta.url));
            await readFile(new URL('../' + target.types.slice(2), import.meta.url));
        }
        assert.ok(name.startsWith('.'));
    }
});
