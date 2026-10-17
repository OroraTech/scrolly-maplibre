const supplied = Object.create(null);
const pending = new Map();
const protocols = new WeakSet();
const urls = {
    maplibregl: 'https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.js',
    maplibreCss: 'https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.css',
    scrollama: 'https://unpkg.com/scrollama@3.2.0/build/scrollama.min.js',
    pmtiles: 'https://unpkg.com/pmtiles@4.3.0/dist/pmtiles.js',
    windGL: 'https://cdn.jsdelivr.net/gh/jessefriend/windgl-maplibre@v0.1.3/dist/windgl.umd.js'
};

export function configureDependencies(dependencies = {}) {
    for (const [name, value] of Object.entries(dependencies)) {
        if (!['maplibregl', 'scrollama', 'pmtiles', 'deck', 'windGL'].includes(name)) {
            throw new Error(`Unknown dependency: ${name}`);
        }
        if (!value || !['object', 'function'].includes(typeof value)) {
            throw new Error(`Invalid dependency: ${name}`);
        }
        supplied[name] = value;
    }
}

export function getDependency(name) {
    return supplied[name] || globalThis[name];
}

export function requireDependency(name) {
    const dependency = getDependency(name);
    if (!dependency) throw new Error(`Missing dependency: ${name}. Supply it through dependencies or enable loadDependencies.`);
    return dependency;
}

function loadScript(url, options) {
    if (pending.has(url)) return pending.get(url);
    const promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.crossOrigin = 'anonymous';
        script.async = false;
        const timer = setTimeout(() => finish(new Error(`Dependency load timed out: ${url}`)), options.dependencyTimeout ?? 30000);
        const finish = error => {
            clearTimeout(timer);
            script.onload = null;
            script.onerror = null;
            if (error) {
                script.remove();
                reject(error);
            } else resolve();
        };
        script.onload = () => finish();
        script.onerror = () => finish(new Error(`Cannot load dependency: ${url}`));
        document.head.appendChild(script);
    });
    pending.set(url, promise);
    promise.catch(() => pending.delete(url));
    return promise;
}

async function ensureDependency(name, options = {}) {
    if (getDependency(name)) return getDependency(name);
    if (options.loadDependencies === false) return requireDependency(name);
    if (typeof document === 'undefined') throw new Error('Map initialization requires a browser document.');
    const address = options.dependencyUrls?.[name] || urls[name];
    await loadScript(address, options);
    return requireDependency(name);
}

export function registerPMTiles() {
    const library = getDependency('maplibregl');
    const archive = getDependency('pmtiles');
    if (!library || !archive || protocols.has(library)) return;
    const protocol = new archive.Protocol();
    library.addProtocol('pmtiles', protocol.tile);
    protocols.add(library);
}

export async function ensureMapDependencies(config, options = {}) {
    configureDependencies(options.dependencies);
    const libraryMissing = !getDependency('maplibregl');
    await ensureDependency('maplibregl', options);
    if (libraryMissing && options.loadDependencies !== false && options.maplibreCss !== false) {
        const address = options.dependencyUrls?.maplibreCss || urls.maplibreCss;
        if (![...document.querySelectorAll('link[rel="stylesheet"]')].some(link => link.href === address)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = address;
            document.head.appendChild(link);
        }
    }
    if (config.initParameters?.useScrollama !== false) await ensureDependency('scrollama', options);
    if ((config.layers || []).some(layer => layer.type === 'pmtiles') ||
        JSON.stringify(config.initParameters?.customStyle || '').includes('pmtiles://') ||
        config.initParameters?.pmtiles === true) {
        await ensureDependency('pmtiles', options);
    }
    registerPMTiles();
}

export async function ensureWindGL(options = {}) {
    await ensureDependency('windGL', options);
}

export async function ensureDeckGL(options = {}) {
    if (getDependency('deck')?.MapboxOverlay && getDependency('deck')?.TripsLayer) return;
    if (options.loadDependencies === false) {
        throw new Error('Supply deck with TripsLayer and MapboxOverlay for animated paths.');
    }
    for (const url of [
        'https://unpkg.com/deck.gl@9.1.14/dist.min.js',
        'https://unpkg.com/@deck.gl/geo-layers@9.1.14/dist.min.js',
        'https://unpkg.com/@deck.gl/extensions@9.1.14/dist.min.js',
        'https://unpkg.com/@deck.gl/mapbox@9.1.14/dist.min.js'
    ]) await loadScript(url, options);
    if (!getDependency('deck')?.TripsLayer || !getDependency('deck')?.MapboxOverlay) {
        throw new Error('Animated paths require deck TripsLayer and MapboxOverlay.');
    }
}
