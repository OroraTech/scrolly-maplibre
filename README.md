# scrolly-maplibre

Scrollytelling maps driven by a JSON config, built with [MapLibre GL JS](https://maplibre.org/) and [Scrollama](https://github.com/russellsamora/scrollama).
As the reader scrolls, the map moves to each step's view and shows that step's layers.

It supports:

- PMTiles, vector tiles, and GeoJSON layers
- Animated paths with deck.gl, for wind, rivers, routes, and other flows
- Wind particles with [windgl-maplibre](https://github.com/jessefriend/windgl-maplibre)
- Legends, popups, images, and video within steps
- Rich text sections: a hero image, pull quotes, stat rows, embedded charts, before and after sliders, and sources
- Interactive maps alongside the scrolling ones
- Several stories on one page
- Keyboard navigation, ARIA labels, and screen reader announcements

## Demo

The demo story follows water from a proposed mine site near the Boundary Waters in Minnesota to Hudson Bay.
It uses open Sentinel-2 imagery, so it needs no API key.

```bash
npm install
npm start
```

`npm start` builds the site and opens `dist/` in a browser.
The story config is [`src/config/example.json`](src/config/example.json), and its data is in `src/assets/data/`.

## Quick start

1. Install the build tools and create `keys.js`. A MapTiler key is only needed for the built-in MapTiler basemap; maps with their own `customStyle` work without one.

   ```bash
   npm install
   cp src/config/keys.example.js src/config/keys.js
   ```

2. Write a story config and save it as `src/config/<story-id>.json`.
   See [Configuration](#configuration) and the demo config, [`src/config/example.json`](src/config/example.json).

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
| `customStyle` | A MapLibre style object or style URL, used instead of the built-in MapTiler basemap. A map with its own style needs no MapTiler key |
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
    "type": "polygon",
    "items": [
      { "label": "High", "color": "#8B0000" },
      { "label": "Moderate", "color": "#FF4500" },
      { "label": "Low", "color": "#FFFF00" }
    ]
  }
}
```

A legend needs a `type`: `point`, `line`, `polygon`, `continuous`, or `mixed`.
In a `mixed` legend, each item can set its own `type` to `point`, `line`, or `polygon` to change the swatch.

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
| `fade` | `0.15` | Share of the run spent fading in, and fading out when looping. `0` turns fading off |
| `loop` | `true` | Restart when the animation ends. Set `false` to play once and keep the whole route drawn |
| `terrain` | `true` | Drape the lines over deck.gl terrain |
| `fixedElevation` | none | Fixed height in metres, instead of the terrain height |
| `elevationScale` | `2` | Terrain height multiplier |
| `frameSkip` | `1` | Render every nth frame |
| `interleaved` | `false` | Draw between map layers rather than above them |
| `layerId` | `<layer id>-trails` | deck.gl layer id |

| `scrollDriven` | `false` | Let scrolling set the time instead of a loop (see below) |
| `reveal` | `false` | Draw every path up to the current time as a solid line, so the flow grows and shrinks |
| `headColor` | none | RGBA colour of a marker at the front of a revealed flow |
| `smoothing` | `220` | How quickly a scroll-driven flow catches up, in milliseconds |

Animation speed is measured per 60fps frame and scaled by elapsed time, so it is the same on fast and slow devices.

For a scroll-driven flow, each step names the time range to cover with `animate`. The flow moves from the first value to the second as the reader scrolls through the step, and back again when they scroll up:

```json
{ "id": 2, "visibleLayers": ["route_flow"], "animate": { "route_flow": [22, 110] } }
```

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

`preMapContent`, `postMapContent`, and each map's `intermediateContent` hold a list of sections.
Text in any section, and in step descriptions, can use `**bold**`, `*italic*`, and `[links](https://example.com)`.
Formatting is built as DOM nodes, never as HTML, so story text cannot inject markup.

| Type | Fields | Shows |
| --- | --- | --- |
| `text` | `content` (string or array of paragraphs), `style` | `heading`, `subheading`, `paragraph`, `lede`, `kicker`, or `note` |
| `media` | `mediaType` (`image` or `video`), `url`, `alt`, `caption`, `credit`, `position` | An image or video with a caption and credit line |
| `hero` | `image`, `alt`, `kicker`, `title`, `dek`, `byline`, `credit` | A full-screen opening image with the title over it |
| `quote` | `content`, `attribution`, `cite` | A pull quote |
| `stats` | `items` of `{ value, label, note }`, `caption`, `credit` | A row of headline numbers |
| `embed` | `url`, `title`, `height`, `mobileHeight`, `caption`, `credit`, `position` | An iframe, such as an interactive chart |
| `compare` | `before` and `after` (`{ url, alt, label }`), `caption`, `credit`, `start` | Two aligned images with a slider |
| `scrolly-embed` | `url`, `title`, `steps` of `{ kicker, title, content }`, `caption`, `credit` | A sticky graphic beside text steps that scroll past it |
| `list` | `items`, `ordered` | A list, such as sources |
| `divider` | none | A thin rule |

`position` is `full-width` (the text column), `wide` (up to 1200px), `inline`, `left`, or `right`.
Any section can also set `className` and `id`.

```json
{
  "sections": [
    { "type": "hero", "image": "img/hero.jpg", "alt": "A lake at dawn", "title": "Downstream", "dek": "Where the water goes.", "byline": "By Jesse Friend" },
    { "type": "text", "style": "lede", "content": "The first paragraph, set larger." },
    { "type": "text", "content": ["A paragraph with a [link](https://example.com).", "And a second paragraph."] },
    { "type": "stats", "items": [{ "value": "1,921 km", "label": "to Hudson Bay" }] },
    { "type": "embed", "url": "graphics/chart.html", "title": "Chart: lake alkalinity", "height": 520 }
  ]
}
```

An embedded page can size its own frame by posting its height to the story:

```js
window.parent.postMessage({ type: 'scrolly-embed-height', height: document.documentElement.scrollHeight }, '*');
```

`scrolly-embed` posts `{ type: 'scrolly-step', index, progress }` to the embedded page as the reader scrolls, where `progress` runs from 0 to 1 through each step, so the graphic can change with the story.

Stat rows stay on one line on wider screens; set `position: "wide"` for four or more.

Steps can also set `kicker` (a small label above the title) and `className`, and `description` can be an array of paragraphs.

### Popups and filters

A layer's `style.filter` takes any MapLibre filter expression, and `minZoom` and `maxZoom` set its zoom range, for every source type.
Add `popup` to show feature properties on hover or tap. `{property}` placeholders are filled from the feature, and each line becomes a row:

```json
{ "id": "lakes", "type": "geojson", "url": "data/lakes.geojson", "popup": "{name}\nAlkalinity: {alk} mg/L", "style": { "type": "circle" } }
```

Layers are stacked in the order they appear in `layers`, whichever step shows them first.

### Camera padding

Step cards cover part of the map. `cameraPadding` keeps each step's `center` in the clear part of the screen above 768px, and `mobileCameraPadding` does the same on phones.
Each is a number or `{ top, right, bottom, left }` in pixels, and a step's `map.padding` overrides both.

```json
"initParameters": {
  "cameraPadding": { "left": 500 },
  "mobileCameraPadding": { "bottom": 320 },
  "responsive": false
}
```

By default, views zoom out a little on smaller screens. Set `responsive` to `false` to use the configured zoom everywhere.

### Tracing a river route

`scripts/trace_downstream.py` builds the GeoJSON for a river flow animation.
It finds the [HydroRIVERS](https://www.hydrosheds.org/products/hydrorivers) reach nearest a point and follows it downstream to the sea.
Each vertex gets a timestamp equal to its distance in kilometres from the start, and each reach gets a `width` from its average discharge.

```bash
pip install pyshp
python scripts/trace_downstream.py HydroRIVERS_v10_na.shp -91.73 47.81 src/assets/data/route.geojson
```

Use the output with `normalizeDuration: false`, `widthProperty: "width"`, and `widthUnits: "pixels"`.

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
| `npm start` | Build, then serve `dist/` and open it in a browser |
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

## Data

The demo route in `src/assets/data/route.geojson` is derived from HydroRIVERS:
Lehner, B., and Grill, G. (2013). Global river hydrography and network routing: baseline data and new approaches to study the world's large river systems. *Hydrological Processes*, 27(15), 2171–2186. Data available at [www.hydrosheds.org](https://www.hydrosheds.org).
The mine site location is approximate.

## License

[MIT](LICENSE)
