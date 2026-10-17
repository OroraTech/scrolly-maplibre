import { StoryBuilder } from './components/StoryBuilder.js';
import { ConfigValidator } from './schema/ConfigValidator.js';
import { destroySection, trackViewport } from './shared/lifecycle.js';

export { StoryBuilder } from './components/StoryBuilder.js';
export { ConfigValidator } from './schema/ConfigValidator.js';
export { createSection } from './components/Sections.js';
export { destroySection } from './shared/lifecycle.js';

let nextStory = 0;

export async function createStory(container, config, options = {}) {
    if (typeof document === 'undefined') throw new Error('createStory requires a browser document.');
    const host = typeof container === 'string' ? document.querySelector(container) : container;
    if (!host) throw new Error('createStory requires an existing container element or CSS selector.');
    const normalized = { ...config, maps: config?.maps ?? [] };
    ConfigValidator.validate(normalized);
    const root = document.createElement('div');
    root.id = `scrolly-story-${++nextStory}`;
    root.className = 'story-container';
    host.appendChild(root);
    const maps = [];
    let destroyed = false;
    const controller = {
        element: root,
        maps,
        destroy() {
            if (destroyed) return;
            destroyed = true;
            maps.forEach(map => map.destroy());
            destroySection(root);
            root.remove();
        }
    };
    try {
        StoryBuilder.createStoryStructure(root.id, normalized, { namespaceSections: true });
        trackViewport(root);
        if (normalized.maps.length) {
            const { ScrollyMap } = await import('./core/ScrollyMap.js');
            for (const [index, config] of normalized.maps.entries()) {
                const instance = new ScrollyMap({
                    ...options,
                    mapContainer: `${root.id}-map${index + 1}`,
                    scrollContainer: `${root.id}-scroll-content${index + 1}`,
                    mapId: `${root.id}-map${index + 1}`,
                    storyContainerId: root.id,
                    config
                });
                maps.push(instance);
                await instance.init();
            }
        }
        return controller;
    } catch (error) {
        controller.destroy();
        throw error;
    }
}
