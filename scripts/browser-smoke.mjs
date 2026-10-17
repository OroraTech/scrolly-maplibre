import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_URL || 'playwright-core');

const stage = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const runtime = process.env.SCROLLY_RUNTIME_DIR || path.join(tmpdir(), 'scrolly-browser-runtimes');
await mkdir(runtime, { recursive: true });
for (const [filename, url] of Object.entries({
    'maplibre.js': 'https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.js',
    'maplibre.css': 'https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.css',
    'scrollama.js': 'https://unpkg.com/scrollama@3.2.0/build/scrollama.min.js'
})) {
    try { await readFile(path.join(runtime, filename)); }
    catch {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Runtime download failed: ${url}`);
        const { writeFile } = await import('node:fs/promises');
        await writeFile(path.join(runtime, filename), Buffer.from(await response.arrayBuffer()));
    }
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const style = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#dfe8df' } }] };
const view = { center: [-91.5, 48], zoom: 7, pitch: 0, bearing: 0, duration: 0 };
const config = {
    maps: [{
        id: 'test',
        initParameters: { useScrollama: true, isInteractive: false, customStyle: style, map: view, skipAssetPreloading: true },
        layers: [{ id: 'point', type: 'geojson', data: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Test point' }, geometry: { type: 'Point', coordinates: view.center } }] }, style: { type: 'circle', paint: { 'circle-color': '#bd6346', 'circle-radius': 8 } }, legend: { title: 'Place', type: 'point', items: [{ color: '#bd6346', label: 'Test point' }] } }],
        steps: [{ id: 'first', title: 'First view', description: 'A test map.', visibleLayers: ['point'], map: view }, { id: 'second', title: 'Second view', description: 'A new view.', visibleLayers: [], map: { ...view, zoom: 8 } }]
    }]
};
const server = http.createServer(async (request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname === '/harness') {
            response.setHeader('content-type', 'text/html');
            response.end('<!doctype html><html><head><link rel="stylesheet" href="/dist/styles/core.css"><link rel="stylesheet" href="/dist/styles/story.css"></head><body style="margin:0"><main id="host"></main></body></html>');
            return;
        }
        if (url.pathname === '/auto.html') {
            response.setHeader('content-type', 'text/html');
            response.end('<!doctype html><html><head><link rel="stylesheet" href="/dist/styles/styles.min.css"></head><body><script>window.scrollId="test";window.scrollConfigUrl="/config.json";</script><script src="/dist/js/bundle.min.js"></script></body></html>');
            return;
        }
        if (url.pathname === '/config.json') {
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify(config));
            return;
        }
        const file = path.resolve(stage, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(stage + path.sep)) throw new Error('Invalid path.');
        const actual = file.endsWith(path.sep) ? path.join(file, 'index.html') : file;
        const content = await readFile(actual);
        response.setHeader('content-type', types[path.extname(actual)] || 'application/octet-stream');
        response.end(content);
    } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' }), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
    for (const width of [1440, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors = [];
        const requests = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://**/*', async route => {
            const address = route.request().url();
            requests.push(address);
            if (address.includes('maplibre-gl@')) return route.fulfill({ path: path.join(runtime, address.endsWith('.css') ? 'maplibre.css' : 'maplibre.js'), contentType: address.endsWith('.css') ? 'text/css' : 'text/javascript' });
            if (address.includes('scrollama@')) return route.fulfill({ path: path.join(runtime, 'scrollama.js'), contentType: 'text/javascript' });
            await route.abort();
        });
        await page.goto(origin + '/dist/examples/story.html');
        await page.waitForFunction(() => window.example);
        assert.equal(requests.length, 0, 'Map-free story downloaded runtimes');
        const graphic = page.frames().find(frame => frame.url().endsWith('/graphic.html'));
        assert.ok(graphic);
        await page.locator('.se-step').nth(2).scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        const transform = await graphic.locator('#circle').evaluate(element => element.style.transform);
        assert.ok(transform.includes('scale('));
        await page.evaluate(() => { window.example.destroy(); window.example.destroy(); });
        assert.equal(await page.locator('#story').evaluate(element => element.children.length), 0);
        await page.goto(origin + '/harness');
        const interactive = structuredClone(config.maps[0]);
        interactive.initParameters.useScrollama = false;
        interactive.initParameters.isInteractive = true;
        delete interactive.steps;
        const mapResult = await page.evaluate(async config => {
            const { createMap } = await import('/dist/core.js');
            window.instance = await createMap({ container: '#host', config });
            return { point: !!window.instance.map.getLayer('point'), canvas: document.querySelectorAll('canvas').length, ready: window.instance._isReady };
        }, interactive);
        assert.equal(mapResult.ready, true);
        assert.equal(mapResult.point, true);
        assert.equal(mapResult.canvas, 1);
        assert.ok(!requests.some(url => /pmtiles|windgl|deck\.gl/.test(url)));
        await page.evaluate(() => { window.instance.destroy(); window.instance.destroy(); });
        assert.equal(await page.locator('#host').evaluate(element => element.children.length), 0);
        const storyResult = await page.evaluate(async config => {
            const { createStory } = await import('/dist/story.js');
            window.instance = await createStory('#host', config);
            return { maps: window.instance.maps.length, steps: document.querySelectorAll('.scroll-step').length };
        }, config);
        assert.equal(storyResult.maps, 1);
        assert.equal(storyResult.steps, 2);
        await page.locator('.scroll-step').nth(1).scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);

        await page.evaluate(() => window.instance.destroy());
        assert.equal(await page.locator('canvas').count(), 0);
        await page.evaluate(async config => {
            const { createStory } = await import('/dist/story.js');
            config.maps.push({ ...structuredClone(config.maps[0]), id: 'another-map' });
            window.instance = await createStory('#host', config);
        }, config);
        assert.equal(await page.locator('canvas').count(), 2);
        assert.equal(await page.locator('.content-box').evaluateAll(elements => elements.every(element => {
            const title = document.getElementById(element.getAttribute('aria-labelledby'));
            return title && element.contains(title);
        })), true);
        await page.evaluate(() => window.instance.destroy());
        assert.deepEqual(errors, []);
        await page.goto(origin + '/auto.html');
        await page.waitForFunction(() => window.__scrollymap_global_tracker?.allMaps?.size === 1 && [...window.__scrollymap_global_tracker.allMaps][0].map._isReady, null, { timeout: 30000 });
        assert.equal(await page.locator('.scroll-step').count(), 2);
        assert.deepEqual(errors, []);
        console.log('Browser ' + width + ': map-free story, iframe steps, real MapLibre, inline GeoJSON, scrolling story, destroy/remount, and classic bundle passed.');
        await page.close();
    }
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
