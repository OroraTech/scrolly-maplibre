# Migration from 0.1

## Existing script tags

The classic bundle remains at `dist/js/bundle.min.js`.
Use it with `dist/styles/styles.min.css` and the optional loader stylesheet.
The `window.scrollId` and `window.scrollConfigUrl` startup contract remains available.
No website-specific graphic moves into the package.

For a bundled application that needs old startup behavior, import `scrolly-maplibre/auto`.
Do not use this entry point for server-side rendering.

## New applications

Use `createMap` or `createStory` instead of global startup variables.
Import the matching styles. A story with maps needs both `core.css` and `story.css`.
These styles avoid page-wide body and html rules.
The full compatibility stylesheet retains the old page rules.

Core and story imports do not set globals, initialize maps, or show a loader.
The host application controls loading and error states.
Runtime libraries load during initialization, unless you set `loadDependencies: false`.

## API keys

The build no longer reads `src/config/keys.js`.
Use a keyless `customStyle`, or pass `initParameters.mapTilerKey`.
Browser keys are public. Restrict them at your provider.

## Cleanup

Call the controller's `destroy()` method before removing a component.
This removes its map, section listeners, and generated DOM.
Shared runtime libraries remain available for other instances.

## Package scope

The map API remains the default export path.
The story renderer is optional through `/story`.
Artwork and article-specific data remain in the website.
A second graphics package is not required until several sites share actual graphics code.
