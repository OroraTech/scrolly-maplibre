import { createMap, MapConfig, MapValidator, type MapInput, type MapView } from 'scrolly-maplibre';
import { createStory, createSection, destroySection, type StoryInput } from 'scrolly-maplibre/story';

const view: MapView = { center: [-91.5, 48], zoom: 7, pitch: 0, bearing: 0 };
const config: MapInput = {
    id: 'example',
    initParameters: { map: view, useScrollama: false, customStyle: { version: 8, sources: {}, layers: [] } },
    layers: []
};
MapValidator.validateMapConfig(config);
new MapConfig({ customStyle: {} }).getMapConfig(view);
const map = await createMap({ container: '#map', config, loadDependencies: false, dependencies: { maplibregl: {} } });
map.destroy();
const storyConfig: StoryInput = { maps: [config], preMapContent: { sections: [{ type: 'text', content: 'Example' }] } };
const story = await createStory('#story', storyConfig);
story.maps.forEach(instance => instance.destroy());
story.destroy();
destroySection(createSection({ type: 'divider' }));
