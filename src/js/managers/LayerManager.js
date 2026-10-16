import { AnimatedPaths } from '../components/AnimatedPaths.js';
import { WindGL } from '../components/WindGL.js'; 
import { Logger } from '../utils/logger.js';

const logger = new Logger('LayerManager');

/**
 * Manages map layers loading, visibility, and data handling
 */
export class LayerManager {
    constructor(map) {
        this.map = map;
        this.loadedLayers = new Set();
        this.loadingLayers = new Set();
        this.customLayers = new Map();
        this.animatedPaths = new AnimatedPaths(map);
        this.windGL = new WindGL(map);
    }

    /**
     * Updates layer visibility based on step configuration
     * @param {Object} step - Step configuration
     * @param {Array} allLayers - All available layers
     */
    async updateVisibility(step, allLayers) {
        this._allLayers = allLayers;
        const visible = step.visibleLayers || [];

        // Load any new layers that need to be visible
        for (const id of visible) {
            if (!this.loadedLayers.has(id) && !this.loadingLayers.has(id)) {
                const layerCfg = allLayers.find(l => l.id === id);
                if (layerCfg) {
                    this.loadingLayers.add(id);
                    try {
                        await this.loadLayer(layerCfg, id);
                        this.loadedLayers.add(id);

                        // Load animated paths if configured
                        if (layerCfg.animationOptions && Object.keys(layerCfg.animationOptions).length > 0) {
                            await this.loadAnimatedPathsLayer(layerCfg, id);
                        }
                    } finally {
                        this.loadingLayers.delete(id);
                    }
                }
            }
        }

        // Update custom layer visibility
        for (const [layerId, layer] of this.customLayers) {
            const shouldShow = visible.includes(layerId);
            if (shouldShow) {
                layer.show();
            } else {
                layer.hide();
            }
        }

        // Update standard layer visibility
        this.loadedLayers.forEach(id => {
            const layerCfg = allLayers.find(l => l.id === id);
            const shouldShow = visible.includes(id);

            if (this.map.getLayer(id)) {
                const hasAnimation = layerCfg?.animationOptions && Object.keys(layerCfg.animationOptions).length > 0;

                if (hasAnimation) { 
                    this.map.setLayoutProperty(id, 'visibility', 'visible');
                } else {
                    this.map.setLayoutProperty(id, 'visibility', shouldShow ? 'visible' : 'none');
                }
            }
        });
    }

    /**
     * Loads all layers for interactive map
     * @param {Array} allLayers - All available layers
     */
    async loadAllLayers(allLayers) {
        this._allLayers = allLayers;
        for (const layerCfg of allLayers) {
            if (layerCfg.id && layerCfg.url) {
                if (!this.loadedLayers.has(layerCfg.id) && !this.loadingLayers.has(layerCfg.id)) {
                    this.loadingLayers.add(layerCfg.id);
                    try {
                        await this.loadLayer(layerCfg, layerCfg.id);
                        this.loadedLayers.add(layerCfg.id);
                    } finally {
                        this.loadingLayers.delete(layerCfg.id);
                    }
                }
            }
        }
    }

    /**
     * Loads an animated paths layer
     * @param {Object} layerCfg - Layer configuration
     * @param {string} layerId - Layer ID
     */
    async loadAnimatedPathsLayer(layerCfg, layerId) {
        // Load deck.gl if not already loaded
        if (typeof window.ensureDeckGL === 'function') {
            await window.ensureDeckGL();
        }
        
        // Check if deck.gl is now available
        if (typeof deck === 'undefined') {
            console.error('deck.gl failed to load - animated paths require deck.gl library');
            return;
        }
        
        if (!this.customLayers.has(layerId)) {
            await new Promise(resolve => setTimeout(resolve, 500));

            const animatedLayer = new AnimatedPaths(this.map, {
                sourceId: layerId,
                sourceLayer: layerCfg.sourceLayer,
                // GeoJSON sources are tiled too, so read whole lines from the file itself
                data: layerCfg.type === 'geojson' ? (layerCfg.url || layerCfg.data) : null,
                ...layerCfg.animationOptions
            });
            this.customLayers.set(layerId, animatedLayer);
        }
    }

    /**
     * Loads a single layer (PMTiles, vector tiles, GeoJSON, or WindGL)
     * @param {Object} layerCfg - Layer configuration
     * @param {string} layerId - Layer ID
     */
    async loadLayer(layerCfg, layerId) {
        if (this.map.getLayer(layerId)) {
            logger.warn(`Layer ${layerId} already exists`);
            return;
        }

        try {
            switch (layerCfg.type) {
                case 'pmtiles':
                    await this._loadPMTilesLayer(layerCfg, layerId);
                    break;
                case 'vector-tiles':
                    await this._loadVectorTilesLayer(layerCfg, layerId);
                    break;
                case 'geojson':
                    await this._loadGeoJSONLayer(layerCfg, layerId);
                    break;
                case 'windgl': 
                    await this._loadWindGLLayer(layerCfg, layerId);
                    break;
                default:
                    logger.warn(`Unknown layer type: ${layerCfg.type}`);
            }
            this._applyStyleOptions(layerCfg, layerId);
            this._placeInConfigOrder(layerId);
            if (layerCfg.popup) this._attachPopup(layerCfg, layerId);
        } catch (error) {
            console.error(`Failed to load layer ${layerId}:`, error);

            if (error.message.includes('already exists')) {
                logger.warn(`Layer ${layerId} already exists, continuing...`);
                return;
            }

            if (error.message.includes('Wrong magic number')) {
                console.error(`PMTiles URL may be returning invalid data: ${layerCfg.url}`);
            }

            throw error;
        }
    }

    /**
     * Applies style.filter and the layer zoom range, the same way for every source type.
     * @param {Object} layerCfg - Layer configuration
     * @param {string} layerId - Layer ID
     */
    _applyStyleOptions(layerCfg, layerId) {
        if (!this.map.getLayer(layerId)) return;
        if (layerCfg.style?.filter) this.map.setFilter(layerId, layerCfg.style.filter);
        if (layerCfg.minZoom !== undefined || layerCfg.maxZoom !== undefined) {
            this.map.setLayerZoomRange(layerId, layerCfg.minZoom ?? 0, layerCfg.maxZoom ?? 24);
        }
    }

    /**
     * Layers load the first time a step shows them, so move each one to its place
     * in the config's layer order: below the first later layer already on the map.
     * @param {string} layerId - Layer ID
     */
    _placeInConfigOrder(layerId) {
        const order = (this._allLayers || []).map(l => l.id);
        const index = order.indexOf(layerId);
        if (index < 0 || !this.map.getLayer(layerId)) return;
        const before = order.slice(index + 1).find(id => this.map.getLayer(id));
        if (before) this.map.moveLayer(layerId, before);
    }

    /**
     * Shows a popup on hover or tap. The template fills {property} placeholders
     * from the feature, and each line becomes its own row. Text only, never HTML.
     * @param {Object} layerCfg - Layer configuration with a popup template
     * @param {string} layerId - Layer ID
     */
    _attachPopup(layerCfg, layerId) {
        if (typeof maplibregl === 'undefined' || !maplibregl.Popup) return;
        const template = Array.isArray(layerCfg.popup) ? layerCfg.popup.join('\n') : String(layerCfg.popup);
        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'scrolly-popup', offset: 10 });

        const fill = (props) => template.replace(/\{([\w.-]+)\}/g, (_, key) => {
            const value = props?.[key];
            if (value === undefined || value === null || value === '') return '—';
            return typeof value === 'number' ? value.toLocaleString('en-US', { maximumFractionDigits: 1 }) : String(value);
        });

        const show = (e) => {
            const feature = e.features?.[0];
            if (!feature) return;
            const content = document.createElement('div');
            fill(feature.properties).split('\n').forEach((line, i) => {
                const row = document.createElement(i === 0 ? 'strong' : 'div');
                row.textContent = line;
                content.appendChild(row);
            });
            this.map.getCanvas().style.cursor = 'pointer';
            popup.setLngLat(e.lngLat).setDOMContent(content).addTo(this.map);
        };

        this.map.on('mousemove', layerId, show);
        this.map.on('click', layerId, show);
        this.map.on('mouseleave', layerId, () => {
            this.map.getCanvas().style.cursor = '';
            popup.remove();
        });
    }

    /**
     * Loads a WindGL layer
     * @param {Object} layerCfg - Layer configuration
     * @param {string} layerId - Layer ID
     */
    async _loadWindGLLayer(layerCfg, layerId) {
        if (!window.windGL) {
            throw new Error('WindGL library not loaded');
        }

        // Pass the entire layerCfg which contains both url and windOptions
        this.windGL.addLayer(layerId, layerCfg);
    }

    /**
     * Cleans up existing layer and source
     * @param {string} layerId - Layer ID
     */
    async _cleanupExistingLayer(layerId) {
        try {
            if (this.map.getLayer(layerId)) {
                this.map.removeLayer(layerId);
            }
        } catch (e) {
            // Layer might not exist, continue
        }

        try {
            if (this.map.getSource(layerId)) {
                this.map.removeSource(layerId);
            }
        } catch (e) {
            // Source might not exist, continue
        }
    }

    /**
     * Loads a PMTiles layer
     * @param {Object} layerCfg - Layer configuration
     * @param {string} layerId - Layer ID
     */
    async _loadPMTilesLayer(layerCfg, layerId) {
        // Ensure PMTiles protocol is initialized
        if (!window._pmtilesProtocolInitialized) {
            const protocol = new pmtiles.Protocol();
            maplibregl.addProtocol('pmtiles', protocol.tile);
            window._pmtilesProtocolInitialized = true;
        }

        const pmtUrl = `pmtiles://${layerCfg.url}`;

        // Verify PMTiles file accessibility
        try {
            const response = await fetch(layerCfg.url, { method: 'HEAD' });
            if (!response.ok) {
                throw new Error(`PMTiles file not accessible: ${response.status}`);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && !contentType.includes('application/octet-stream') && !contentType.includes('application/x-protobuf')) {
                logger.warn(`Unexpected content type for PMTiles: ${contentType}`);
            }
        } catch (fetchError) {
            console.error(`Failed to verify PMTiles file: ${layerCfg.url}`, fetchError);
            throw new Error(`PMTiles file verification failed: ${fetchError.message}`);
        }

        // Add source
        this.map.addSource(layerId, {
            type: 'vector',
            url: pmtUrl,
            attribution: layerCfg.attribution ?? '',
            minzoom: layerCfg.minZoom ?? 0,
            maxzoom: layerCfg.maxZoom ?? 22
        });

        await new Promise(r => setTimeout(r, 250));

        if (this.map.getLayer(layerId)) {
            logger.warn(`Layer ${layerId} still exists, skipping add`);
            return;
        }

        // Add layer
        this.map.addLayer({
            id: layerId,
            type: layerCfg.style.type,
            source: layerId,
            'source-layer': layerCfg.sourceLayer,
            layout: layerCfg.style.layout ?? {},
            paint: layerCfg.style.paint ?? {},
            minzoom: layerCfg.minZoom ?? 0,
            maxzoom: layerCfg.maxZoom ?? 22
        });

        // Force repaint on iOS after adding layer
        if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
            // Wait for next frame, then force repaint
            await new Promise(resolve => requestAnimationFrame(resolve));
            this.map.triggerRepaint();
            
            // Double-check after a short delay
            setTimeout(() => {
                this.map.triggerRepaint();
            }, 100);
        }
    }

    /**
     * Loads a vector tiles layer
     * @param {Object} layerCfg - Layer configuration
     * @param {string} layerId - Layer ID
     */
    async _loadVectorTilesLayer(layerCfg, layerId) {
        this.map.addSource(layerId, {
            type: 'vector',
            tiles: [layerCfg.url],
            minzoom: layerCfg.minZoom ?? 0,
            maxzoom: layerCfg.maxZoom ?? 20
        });

        this.map.addLayer({
            id: layerId,
            type: layerCfg.style.type,
            source: layerId,
            'source-layer': layerCfg.sourceLayer,
            layout: layerCfg.style.layout ?? {},
            paint: layerCfg.style.paint ?? {}
        });
    }

    /**
     * Loads a GeoJSON layer
     * @param {Object} layerCfg - Layer configuration
     * @param {string} layerId - Layer ID
     */
    async _loadGeoJSONLayer(layerCfg, layerId) {
        const data = layerCfg.url ? await (await fetch(layerCfg.url)).json() : layerCfg.data;

        this.map.addSource(layerId, { type: 'geojson', data });

        this.map.addLayer({
            id: layerId,
            type: layerCfg.style.type,
            source: layerId,
            layout: layerCfg.style.layout ?? {},
            paint: layerCfg.style.paint ?? {}
        });
    }

    /**
     * Gets all default visible layers (those with legends)
     * @param {Array} allLayers - All available layers
     * @returns {Array} Default visible layer IDs
     */
    getDefaultVisibleLayers(allLayers) {
        return allLayers.filter(layer => layer.legend).map(layer => layer.id);
    }

    /**
     * Destroys all custom layers
     */
    destroy() {
        this.customLayers.forEach(layer => layer.destroy());
        this.customLayers.clear();
    }
}
