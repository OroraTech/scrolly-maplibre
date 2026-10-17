import { Logger } from '../utils/logger.js';

const logger = new Logger('MapConfig');

export class MapConfig {
    constructor(options = {}) {
        this.customStyle = options.customStyle || null;
        // The built-in basemap uses MapTiler; a map with its own style does not need a key
        if (!options.mapTilerKey && !this.customStyle) {
            throw new Error('A MapTiler API key is required unless the map sets customStyle');
        }

        this.mapTilerKey = options.mapTilerKey || null;
        this.useScrollama = options.useScrollama ?? true;
        this.isInteractive = options.isInteractive ?? false;
        this.interactiveConstraints = options.interactiveConstraints || null;
    }

    getMapConfig(initialSettings) {
        const mapOptions = {
            container: 'map',
            zoom: initialSettings.zoom,
            center: initialSettings.center,
            pitch: initialSettings.pitch,
            bearing: initialSettings.bearing,
            antialias: true,
            hash: false,
            attributionControl: false,
            style: this.customStyle || this.getMapStyle(),
            maxZoom: 22,
            maxPitch: 85,
            interactive: this.isInteractive
        };

        logger.debug('Generated base map options', mapOptions);

        if (this.isInteractive && this.interactiveConstraints) {
            if (this.interactiveConstraints.maxBounds) {
                mapOptions.maxBounds = this.interactiveConstraints.maxBounds;
            }
            if (this.interactiveConstraints.minZoom !== undefined) {
                mapOptions.minZoom = this.interactiveConstraints.minZoom;
            }
            if (this.interactiveConstraints.maxZoom !== undefined) {
                mapOptions.maxZoom = this.interactiveConstraints.maxZoom;
            }
        }

        return mapOptions;
    }

    getMapStyle() {
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        
        const style = {
            version: 8,
            sources: this.getSources(),
            layers: this.getLayers(),
            glyphs: `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${this.mapTilerKey}`,
            light: {
                anchor: 'viewport',
                color: 'white',
                intensity: 0.5
            }
        };
        
        // Only add terrain to style if NOT on iOS
        if (!isIOS) {
            style.terrain = {
                source: 'terrainSource',
                exaggeration: 2
            };
        }
        
        return style;
    }

    getSources() {
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const isMobile = window.innerWidth <= 768;
        
        const sources = {
            sat: {
                type: 'raster',
                tiles: [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${this.mapTilerKey}`],
                tileSize: 256,
                maxzoom: 19
            }
        };
        
        // Only add vector source if NOT on iOS (it can cause performance issues)
        if (!isIOS) {
            sources.maptilerPlanetSource = {
                type: 'vector',
                url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${this.mapTilerKey}`
            };
            
            sources.terrainSource = {
                type: 'raster-dem',
                url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${this.mapTilerKey}`,
                tileSize: isMobile ? 512 : 256,
                maxzoom: 14
            };
            sources.hillshadeSource = {
                type: 'raster-dem',
                url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${this.mapTilerKey}`,
                tileSize: isMobile ? 512 : 256,
                maxzoom: 14
            };
            
            logger.debug('Desktop/Android - All sources enabled');
        } else {
            logger.debug('iOS detected - terrain and vector sources disabled');
        }
        
        return sources;
    }
    
    getLayers() {
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        
        const layers = [
            {
                id: 'sat',
                type: 'raster',
                source: 'sat'
            }
        ];

        // Only add layers that need vector or terrain sources if NOT on iOS
        if (!isIOS) {
            layers.push({
                id: 'hills',
                type: 'hillshade',
                source: 'hillshadeSource',
                layout: { visibility: 'visible' },
                paint: {
                    'hillshade-shadow-color': '#473B24',
                    'hillshade-exaggeration': 0.25
                }
            });

            // Add label layers (require maptilerPlanetSource)
            layers.push(
                {
                    id: 'city-labels',
                    type: 'symbol',
                    source: 'maptilerPlanetSource', 
                    minzoom: 3, 
                    maxzoom: 16,
                    'source-layer': 'place',
                    layout: {
                        'text-field': '{name:en}',
                        'text-font': ['Figtree Regular'],
                        'text-size': ['interpolate', ['linear'], ['zoom'], 3, 11, 8, 15, 11, 16, 16, 21],
                        'text-max-width': 10,
                        'visibility': 'visible'
                    },
                    paint: {
                        'text-color': 'hsl(0, 0%, 0%)',
                        'text-halo-color': 'hsla(0, 0%, 100%, 0.75)',
                        'text-halo-width': 2,
                        'text-halo-blur': 0
                    },
                    filter: ["==", "class", "city"]
                },
                {
                    id: 'country-labels',
                    type: 'symbol',
                    source: 'maptilerPlanetSource',
                    minzoom: 1,
                    maxzoom: 12,
                    'source-layer': 'place',
                    layout: {
                        'text-field': '{name:en}',
                        'text-font': ['Figtree Bold'],
                        'text-size': ['interpolate', ['linear'], ['zoom'], 0, 8, 1, 10, 4, ['case', [">", ["get", "rank"], 2], 13, 15], 8, ['case', [">", ["get", "rank"], 2], 18, 22]],
                        'text-padding': { 'stops': [[1, 0], [4, 2]] },
                        'text-max-width': 8,
                        'visibility': 'visible'
                    },
                    paint: {
                        'text-color': 'hsl(0, 0%, 13%)',
                        'text-halo-color': 'hsla(0, 0%, 100%, 0.75)',
                        'text-halo-width': 2,
                        'text-halo-blur': 1
                    },
                    filter: ["==", "class", "country"]
                }
            );
        } else {
            logger.debug('iOS detected - labels disabled (no vector source)');
        }
        
        logger.debug('Layers:', layers.map(l => l.id));
        
        return layers;
    }
}
