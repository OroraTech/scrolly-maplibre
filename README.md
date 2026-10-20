# scrolly-maplibre

Config-driven maps and optional story sections, built with MapLibre GL JS and Scrollama.

The repository and releases are hosted by [OroraTech](https://github.com/OroraTech/scrolly-maplibre).

## Choose an entry point

| Import | Purpose |
| --- | --- |
| `scrolly-maplibre` or `scrolly-maplibre/core` | Maps, layers, camera transitions, legends, and popups |
| `scrolly-maplibre/story` | Story sections, embedded graphics, and optional maps |
| `scrolly-maplibre/auto` | Legacy script-tag startup |

Importing core or story does not change the page or download libraries.
Map initialization loads only the required runtime libraries.
A story without maps needs neither MapLibre nor WebGL.
Custom artwork, datasets, and article-specific layouts belong in your website, not this package.

## Install

Install the package from the GitHub release. You do not need an npm account.

```sh
npm install https://github.com/OroraTech/scrolly-maplibre/releases/download/v0.2.1/scrolly-maplibre-0.2.1.tgz
```

The package is not on the npm registry yet.
After it is published there, you can use `npm install scrolly-maplibre`.

Use an ESM-capable bundler. Node.js 22 or later is required to build this repository.
Version 0.2 is an early release. Check the examples in your target browsers before production use.

## Create a map

Add `<div id="map"></div>` to your page, then run:

```js
import { createMap } from 'scrolly-maplibre';
import 'scrolly-maplibre/core.css';

const map = await createMap({
    container: '#map',
    config: {
        id: 'overview',
        initParameters: {
            useScrollama: false,
            isInteractive: true,
            customStyle: {
                version: 8,
                sources: {
                    osm: {
                        type: 'raster',
                        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                        tileSize: 256,
                        attribution: '© OpenStreetMap contributors'
                    }
                },
                layers: [{ id: 'basemap', type: 'raster', source: 'osm' }]
            },
            map: { center: [-91.5, 48], zoom: 7, pitch: 0, bearing: 0 }
        },
        layers: []
    }
});
```

Call `map.destroy()` when you remove the component.
For a scrolling map, set `useScrollama: true` and add `steps`.
Each step needs an `id`, a `map` view, and a `visibleLayers` array.

This example uses the public OpenStreetMap tile service.
Follow its usage policy, or select a tile provider that fits your traffic.
A `customStyle` needs no MapTiler key.
For the built-in MapTiler style, pass `initParameters.mapTilerKey` explicitly.
Never put a secret server credential in a browser config.

## Create a story

Add `<main id="story"></main>` to your page:

```js
import { createStory } from 'scrolly-maplibre/story';
import 'scrolly-maplibre/story.css';

const story = await createStory('#story', {
    preMapContent: {
        sections: [
            { type: 'text', style: 'heading', content: 'Follow the water' },
            { type: 'text', content: 'Your introduction goes here.' },
            {
                type: 'scrolly-embed',
                url: '/graphics/water.html',
                title: 'Water moving through rock',
                steps: [
                    { title: 'Rain falls', content: 'Water reaches the surface.' },
                    { title: 'Water moves', content: 'Water follows connected paths.' }
                ]
            }
        ]
    }
});
```

Call `story.destroy()` on unmount.
Stories with maps also need `core.css`.
Generated IDs are unique across instances. Provide unique IDs for your own content.

Supported section types include text, media, quotes, stats, heroes, embeds, lists, dividers, comparisons, and scrolling embeds.
The [config reference](docs/configuration.md) lists their fields.
The [embedding guide](docs/embedding.md) explains the iframe message protocol.

## Control runtime dependencies

By default, map initialization loads pinned browser builds from public CDNs.
MapLibre CSS is loaded with MapLibre.
Scrollama, PMTiles, deck.gl, and WindGL load only when needed.
Destroying a map does not unload shared libraries.

For a bundler, offline deployment, or strict content security policy, supply your own libraries:

```js
import maplibregl from 'maplibre-gl';
import scrollama from 'scrollama';
import 'maplibre-gl/dist/maplibre-gl.css';

const map = await createMap({
    container: '#map',
    config,
    dependencies: { maplibregl, scrollama },
    loadDependencies: false
});
```

Install the libraries you import in your application.
Supported dependency names are `maplibregl`, `scrollama`, `pmtiles`, `deck`, and `windGL`.
Dependencies are shared across instances on a page; use one compatible version of each library.
For animated paths, the supplied `deck` namespace must include `TripsLayer` and `MapboxOverlay`.
You can also override `dependencyUrls`, `dependencyTimeout` (milliseconds), and `maplibreCss`.
Config URLs, styles, tiles, and graphic URLs must remain accessible under your content security policy.

## Lifecycle and errors

Both creation functions return promises.
Catch initialization errors and show a fallback in your application.
Failed initialization removes the instance root and listeners.
The returned controllers support repeated `destroy()` calls.
Destroy a story or map before replacing its host content.

`createSection(section)` returns a standalone section element.
If you use it without `createStory`, call `destroySection(element)` before removal.

## Develop and test

```sh
npm ci
npm test
npm run test:types
npm run check:package
npm run preview
```

Build first with `npm run build` if you only want to preview.
The preview serves `dist/`.
Open `/examples/core.html` or `/examples/story.html` for small examples.
The larger repository demo is at `/index.html`.

The build produces ESM entry points, lazy chunks, scoped styles, declarations, and a classic compatibility bundle.
Run `npm run test:browser` for desktop and mobile Chromium smoke checks. Install Chrome first, or set `BROWSER_PATH` to a compatible browser executable.
The first browser test downloads pinned runtime fixtures. Set `SCROLLY_RUNTIME_DIR` to a prepared fixture directory for offline tests.
The npm archive excludes demo datasets and private config files.
See [migration](docs/migration.md) for existing script-tag installations.
Source and examples use the MIT license.
