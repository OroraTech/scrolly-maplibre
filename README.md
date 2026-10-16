# scrolly-maplibre

Scrollytelling maps driven by a JSON config, built with [MapLibre GL JS](https://maplibre.org/) and [Scrollama](https://github.com/russellsamora/scrollama).
As the reader scrolls, the map moves to each step's view and shows that step's layers.

It supports:

- PMTiles, vector tiles, and GeoJSON layers
- Animated paths with deck.gl, for wind, rivers, routes, and other flows
- Wind particles with [windgl-maplibre](https://github.com/jessefriend/windgl-maplibre)
- Legends, images, and video within steps
- Interactive maps alongside the scrolling ones
- Several stories on one page
- Keyboard navigation, ARIA labels, and screen reader announcements

## Quick start

1. Install the build tools and add your MapTiler key.

   ```bash
   npm install
   cp src/config/keys.example.js src/config/keys.js
   ```

2. Write a story config and save it as `src/config/<story-id>.json`.
   See [Configuration](#configuration) and [`src/config/example.json`](src/config/example.json), which uses placeholder data URLs.

3. Add the story to a page.
   Set `window.scrollId` in an inline script and load the framework.
   The story is inserted after that script.

   ```html
   <script>window.scrollId = 'my-story';</script>
   <script type="module" src="js/core/init.js"></script>
   ```

4. Build with `npm run build`, and preview `dist/` with `npm run preview`.

### Where configs are loaded from

By default, a story with the id `my-story` loads `config/my-story.json`, relative to the page.
To load configs from somewhere else, set a URL template before the framework loads:

```html
<script>window.scrollConfigUrl = 'https://example.com/stories/{scrollId}.json';</script>
```

## Configuration

A story config has optional content before and after the maps, and a list of maps.

```json
{
  "preMapContent": { "sections": [] },
  "maps": [],
  "postMapContent": { "sections": [] }
}
```

### Maps

A scrolling map:

```json
{
  "id": "overview",
  "initParameters": {
    "useScrollama": true,
    "isInteractive": false,
    "map": { "zoom": 12.5, "center": [-118.5276, 34.0459], "pitch": 50, "bearing": 14 }
  },
  "layers": [],
  "steps": []
}
```

An interactive map that the reader can pan and zoom:

```json
{
  "id": "explore",
  "initParameters": {
    "isInteractive": true,
    "useScrollama": false,
    "map": { "zoom": 11, "center": [-118.5, 34.0], "pitch": 45, "bearing": 0 },
    "interactiveConstraints": {
      "maxBounds": [[-119.0, 33.8], [-118.0, 34.2]],
      "minZoom": 9,
      "maxZoom": 16
    }
  },
  "layers": []
}
```

Other map `initParameters`:

| Option | Purpose |
| --- | --- |
| `customStyle` | A MapLibre style object, used instead of the built-in MapTiler basemap |
| `cameraDuration` | Default camera move time in milliseconds |

To skip preloading step images and video, set `"initParameters": { "skipAssetPreloading": true }` at the top level of the story config.

### Steps

```json
{
  "id": 1,
  "title": "Step title",
  "description": "Text for this step",
  "position": "left",
  "map": { "center": [-118.56, 34.05], "zoom": 14, "pitch": 50, "bearing": 10, "duration": 2500 },
  "visibleLayers": ["layer1", "layer2"],
  "media": {
    "type": "image",
    "url": "assets/img/photo.jpg",
    "caption": "Photo caption",
    "alt": "Description of the photo",
    "position": "full-width"
  }
}
```

- `position`: `left`, `center`, or `right`
- `media.type`: `image` or `video`
- `media.position`: `full-width`, `left`, or `right`

### Layers

Each layer has an `id`, a `type` (`pmtiles`, `vector-tiles`, `geojson`, or `windgl`), a `url`, and a MapLibre `style`.
PMTiles and vector layers also need `sourceLayer`.

```json
{
  "id": "burn_severity",
  "type": "pmtiles",
  "url": "https://example.com/burn_severity.pmtiles",
  "sourceLayer": "burn_areas",
  "style": {
    "type": "fill",
    "paint": {
      "fill-color": ["match", ["get", "severity"], "high", "#8B0000", "moderate", "#FF4500", "low", "#FFFF00", "#cccccc"]
    }
  },
  "legend": {
    "title": "Burn severity",
    "type": "categorical",
    "items": [
      { "label": "High", "color": "#8B0000" },
      { "label": "Moderate", "color": "#FF4500" },
      { "label": "Low", "color": "#FFFF00" }
    ]
  }
}
```

Legend items can set `"type"` to `point`, `line`, or `polygon` (the default) to change the swatch.

### Animated paths

Add `animationOptions` to a line layer to animate it with a deck.gl `TripsLayer`.
Set the layer's own line opacity to 0 if only the animation should show.

Each line can carry a `timestamps` property with one value per vertex.
Without it, timestamps are spaced evenly from the line's `speed` property.

| Option | Default | Purpose |
| --- | --- | --- |
| `animationSpeed` | `0.02` | Time added per frame |
| `trailLength` | `500` | Length of each trail, in timestamp units |
| `pathColor` | `[255, 255, 255, 255]` | RGBA colour |
| `speedProperty` | `"speed"` | Property used to space timestamps and set width |
| `widthProperty` | none | Property that sets line width instead of speed, such as stream order |
| `widthScale` | `1` | Multiplier for `widthProperty` |
| `data` | none | GeoJSON URL or object to read whole lines from, instead of the loaded map tiles |
| `normalizeDuration` | `true` | Stretch every line to the same duration. Set `false` to keep the timestamps as they are, so lines share one clock |
| `loop` | `true` | Restart when the animation ends. Set `false` to play once and keep the whole route drawn |
| `terrain` | `true` | Drape the lines over deck.gl terrain |
| `fixedElevation` | none | Fixed height in metres, instead of the terrain height |
| `elevationScale` | `2` | Terrain height multiplier |
| `frameSkip` | `1` | Render every nth frame |
| `interleaved` | `false` | Draw between map layers rather than above them |
| `layerId` | `<layer id>-trails` | deck.gl layer id |

For wind particles, the defaults work as they are.
For a river network, give each reach timestamps measured from one starting point, and turn off normalizing and terrain:

```json
"animationOptions": {
  "data": "data/route.geojson",
  "normalizeDuration": false,
  "terrain": false,
  "loop": false,
  "widthProperty": "order"
}
```

### Wind particles

```json
{
  "id": "wind_particles",
  "type": "windgl",
  "url": "https://example.com/wind/tile.json",
  "windOptions": {
    "particleColor": "#ffffff",
    "particleSpeed": 0.75,
    "particleSize": 2
  }
}
```

### Content sections

`preMapContent` and `postMapContent` hold text and media sections:

```json
{
  "sections": [
    { "type": "text", "content": "Heading text", "style": "heading" },
    { "type": "text", "content": "Paragraph text", "style": "paragraph" },
    { "type": "media", "mediaType": "image", "url": "assets/img/photo.jpg", "caption": "Caption", "alt": "Description", "position": "full-width" }
  ]
}
```

## Theming

Colours and the font are CSS custom properties in `src/styles/styles.css`.
Override them on `:root` or on a `.story-container`:

```css
:root {
  --scrolly-bg: #111418;
  --scrolly-panel: #1d232a;
  --scrolly-text: #f7f7f5;
  --scrolly-accent: #5aa9e6;
  --scrolly-font: Figtree, system-ui, sans-serif;
}
```

## Development

| Command | Purpose |
| --- | --- |
| `npm run build` | Bundle, minify, and copy everything to `dist/` |
| `npm run preview` | Serve `dist/` locally |
| `npm test` | Run the unit tests |

The source is organised by role:

```
src/js/
├── core/        Entry point and the ScrollyMap class
├── managers/    Map, layers, scrolling, legends, content, and tile preloading
├── components/  Animated paths, wind particles, and story markup
├── schema/      Config validation and map defaults
└── utils/       StoryManager and logging
```

The framework needs a browser with WebGL.
