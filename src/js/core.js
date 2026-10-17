import { ScrollyMap } from './core/ScrollyMap.js';
import { MapValidator } from './schema/MapValidator.js';
import { destroySection, trackViewport } from './shared/lifecycle.js';

export { ScrollyMap } from './core/ScrollyMap.js';
export { MapConfig } from './schema/MapConfig.js';
export { MapValidator } from './schema/MapValidator.js';
export { configureDependencies } from './runtime/dependencies.js';

let nextMap = 0;

export async function createMap(options = {}) {
    if (typeof document === 'undefined') throw new Error('createMap requires a browser document.');
    MapValidator.validateMapConfig(options.config, 0);
    const container = typeof options.container === 'string' ? document.querySelector(options.container) : options.container;
    if (!container) throw new Error('createMap requires an existing container element or CSS selector.');
    const namespace = `scrolly-map-${++nextMap}`;
    const root = document.createElement('div');
    root.id = `${namespace}-root`;
    root.className = 'story-container';
    root.innerHTML = `<section class="map-container"><div class="map" id="${namespace}"></div><div class="scrolly"><div class="scroll-content" id="${namespace}-steps"></div></div></section>`;
    container.appendChild(root);
    trackViewport(root);
    const instance = new ScrollyMap({
        ...options,
        mapContainer: namespace,
        scrollContainer: `${namespace}-steps`,
        mapId: namespace,
        storyContainerId: root.id
    });
    const destroyMap = instance.destroy.bind(instance);
    instance.destroy = () => {
        destroyMap();
        destroySection(root);
        root.remove();
    };
    try {
        await instance.init();
        return instance;
    } catch (error) {
        instance.destroy();
        throw error;
    }
}
