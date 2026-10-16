import { Logger } from '../utils/logger.js';

const logger = new Logger('MapManager');

/**
 * Handles map initialization, configuration, and terrain management
 */
export class MapManager {
    constructor(mapContainer, mapId) {
        this.mapContainer = mapContainer;
        this.mapId = mapId;
        this.map = null;
    }

    /**
     * Initializes the map with configuration
     * @param {Object} config - Map configuration
     * @returns {Object} The initialized map instance
     */
    async initialize(config) {        
        // Initialize PMTiles protocol if needed
        await this._initializePMTiles();

        // Create map configuration
        const { MapConfig } = await import('../schema/MapConfig.js');
        const mapConfig = new MapConfig({
            isInteractive: config.initParameters.isInteractive ?? false,
            useScrollama: config.initParameters.useScrollama ?? true,
            customStyle: config.initParameters.customStyle,
            interactiveConstraints: config.initParameters.interactiveConstraints
        });

        // Get map element and initial settings
        const mapEl = document.getElementById(this.mapContainer);
        if (!mapEl) {
            throw new Error(`Map container ${this.mapContainer} not found`);
        }
        
        const initial = config.initParameters.map;
        const mapOptions = mapConfig.getMapConfig(initial);
        mapOptions.container = this.mapContainer;

        // Create map instance with timeout
        try {
            this.map = new maplibregl.Map(mapOptions);
        } catch (error) {
            throw new Error(`Map creation failed: ${error.message}`);
        }

        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                    (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
        let customAttribution =
        '<a href="https://maplibre.org/" target="_blank" rel="noopener">MapLibre</a>';

        if (isIOS) {
        customAttribution = [
            '<a href="https://maplibre.org/" target="_blank" rel="noopener">MapLibre</a>',
            '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">© MapTiler</a>',
            '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>'
        ].join(' | ');

        logger.debug('iOS detected - using custom attribution');
        }

        this.map.on('load', () => {
            // Remove default attribution if needed
            if (this.map.attributionControl) {
                this.map.removeControl(this.map.attributionControl);
            }

            this.map.addControl(
                new maplibregl.AttributionControl({
                    compact: false,
                    customAttribution
                }),
                'bottom-right'
            );
        });
        
        // ADD: Suppress texture warnings on Android VMs
        this._setupTextureErrorHandling();

        // Add WebGL context handlers
        this.map.on('webglcontextlost', (e) => {
            console.error(`WebGL context lost for map ${this.mapId}`);
            if (e && typeof e.preventDefault === 'function') {
                e.preventDefault();
            }
        });

        this.map.on('webglcontextrestored', () => {
            if (this.map.getStyle()) {
                this.map.triggerRepaint();
            }
        });

        // Add error handler
        this.map.on('error', (e) => {
            console.error(`Map error for ${this.mapId}:`, e);
        });

        // Wait for map to load with timeout
        try {
            await this._configureLoadedMap(config, mapEl, initial);
        } catch (error) {
            console.error(`MapManager: Configuration failed for ${this.mapId}:`, error);
            throw error;
        }

        return this.map;
    }

    /**
     * Configures the map after it's loaded
     * @param {Object} config - Map configuration
     * @param {HTMLElement} mapEl - Map container element
     * @param {Object} initial - Initial map settings
     */
    async _configureLoadedMap(config, mapEl, initial) {
        // Wait for map load with timeout
        const loadTimeout = 90000; 
        const loadPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Map load timeout after ${loadTimeout}ms`));
            }, loadTimeout);
            
            // Try load event
            this.map.once('load', () => {
                clearTimeout(timeout);
                resolve();
            });
            
            // Fallback to idle event (sometimes load doesn't fire but idle does)
            const idleFallbackTimeout = setTimeout(() => {
                if (this.map.loaded()) {
                    clearTimeout(timeout);
                    resolve();
                }
            }, 5000);
            
            this.map.on('idle', () => {
                clearTimeout(idleFallbackTimeout);
                if (this.map.loaded()) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            
            // Handle errors
            this.map.once('error', (e) => {
                clearTimeout(timeout);
                clearTimeout(idleFallbackTimeout);
                reject(new Error(`Map load error: ${e.error?.message || 'Unknown error'}`));
            });
        });

        try {
            await loadPromise;
        } catch (error) {
            // Log minimal error info in production
            console.error(`Map ${this.mapId} failed to load:`, error.message);
            throw error;
        }

        // Apply terrain
        await this._applyTerrain();

        // Set initial view
        this._setMapView(initial);

        // Apply fog if configured
        if (config.initParameters.fogConfig) {
            this._applyFog(config.initParameters.fogConfig);
        }

        // Configure mode-specific features (interactive vs story)
        const isInteractive = config.initParameters.isInteractive ?? false;
        if (isInteractive) {
            await this._configureInteractiveMode(mapEl);
        } else {
            await this._configureStoryMode(mapEl);
        }

        // Add resize handler
        this._addResizeHandler(mapEl);
    }

    /**
     * Configures interactive mode
     * @param {HTMLElement} mapEl - Map container element
     */
    async _configureInteractiveMode(mapEl) {
        // Add interactive class to the map element
        mapEl.classList.add('interactive');
        
        this.addInteractiveOverlay(mapEl);

        const nav = new maplibregl.NavigationControl({
            showCompass: true,
            showZoom: true,
            visualizePitch: true
        });
        this.map.addControl(nav, 'top-right');

        this.disableMapInteractionsForInteractivity();
    }

    /**
     * Configures story mode
     * @param {HTMLElement} mapEl - Map container element
     */
    async _configureStoryMode(mapEl) {
        mapEl.classList.remove('interactive');
        this.disableMapInteractions();
    }

    /**
     * Initializes PMTiles protocol if not already done
     */
    async _initializePMTiles() {
        if (typeof pmtiles !== 'undefined' && !window._pmtilesProtocolInitialized) {
            try {
                const protocol = new pmtiles.Protocol();
                maplibregl.addProtocol('pmtiles', protocol.tile);
                window._pmtilesProtocolInitialized = true;
            } catch (error) {
                console.error('Error initializing PMTiles protocol:', error);
            }
        }
    }

    /**
     * Applies terrain if available in the map style
     */
    async _applyTerrain() {
        const terrainSource = this.map.getSource('terrainSource');
        if (terrainSource) {
            const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
            
            // iOS-friendly exaggeration
            let exaggeration;
            if (isIOS) {
                exaggeration = 1.0;  // Conservative for iOS
            } else {
                exaggeration = window.innerWidth <= 768 ? 1.5 : 2.0;
            }
            
            this.map.setTerrain({ 
                source: 'terrainSource', 
                exaggeration: exaggeration 
            });
            await this.waitForTerrainReady();
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    /**
     * Sets initial map position with responsive adjustments
     * @param {Object} settings - Initial map settings
     */
    setInitialPosition(settings) {
        const mapSettings = this.getResponsiveMapSettings(settings);

        this.map.easeTo({
            center: mapSettings.center,
            zoom: mapSettings.zoom,
            pitch: mapSettings.pitch,
            bearing: mapSettings.bearing
        });
    }

    /**
     * Disables all map interactions for story mode
     */
    disableMapInteractions() {
        this.map.dragPan.disable();
        this.map.doubleClickZoom.disable();
        this.map.touchZoomRotate.disableRotation();
        this.map.keyboard.disable();
        this.map.scrollZoom.disable();
        this.map.dragRotate.disable();
    }

    /**
     * Disables specific interactions for interactive mode
     */
    disableMapInteractionsForInteractivity() {
        this.map.scrollZoom.disable();

        this.map.on('contextmenu', e => {
            e.preventDefault();
            const current = this.map.getZoom();
            this.map.easeTo({ zoom: current - 0.3, duration: 500 });
        });
    }

    /**
     * Adds interactive overlay with prompt
     * @param {HTMLElement} mapEl - Map container element
     */
    addInteractiveOverlay(mapEl) {
        const overlay = document.createElement('div');
        overlay.className = 'map-overlay';

        const prompt = document.createElement('div');
        prompt.className = 'map-overlay-prompt';
        prompt.innerHTML = '👆<br>Click anywhere to explore the map';

        overlay.appendChild(prompt);
        mapEl.appendChild(overlay);

        const hide = () => {
            overlay.classList.add('hidden');
            setTimeout(() => overlay.remove(), 300);
            mapEl.removeEventListener('click', hide);
            this.map.off('mousedown', hide);
        };

        mapEl.addEventListener('click', hide);
        this.map.on('mousedown', hide);
    }

    /**
     * Gets responsive map settings based on screen size
     * @param {Object} baseSettings - Base map settings
     * @returns {Object} Adjusted map settings
     */
    getResponsiveMapSettings(baseSettings) {
        const width = window.innerWidth;
        let adjustedSettings = { ...baseSettings };

        if (width <= 480) {
            adjustedSettings.zoom = Math.max(baseSettings.zoom - 1.75, 5);
            adjustedSettings.pitch = Math.max(baseSettings.pitch - 15, 0);
            adjustedSettings.center = [ 
                baseSettings.center[0], 
                baseSettings.center[1] - 0.003 
            ];
            logger.debug('Using mobile (<=480px) responsive settings');
        } else if (width <= 768) {
            adjustedSettings.zoom = Math.max(baseSettings.zoom - 1.5, 5);
            adjustedSettings.pitch = Math.max(baseSettings.pitch - 10, 0);
            adjustedSettings.center = [ 
                baseSettings.center[0], 
                baseSettings.center[1] - 0.002 
            ];
            logger.debug('Using tablet (<=768px) responsive settings');
        } else if (width <= 1024) {
            adjustedSettings.zoom = Math.max(baseSettings.zoom - 1.25, 5);
            adjustedSettings.pitch = Math.max(baseSettings.pitch - 5, 0);
            adjustedSettings.center = [ 
                baseSettings.center[0], 
                baseSettings.center[1] - 0.001 
            ];
            logger.debug('Using laptop (<=1024px) responsive settings');
        } else if (width <= 1440) {
            adjustedSettings.zoom = Math.max(baseSettings.zoom - 1, 5);
            adjustedSettings.pitch = Math.max(baseSettings.pitch - 2, 0);
            adjustedSettings.center = [ 
                baseSettings.center[0], 
                baseSettings.center[1] - 0.001 
            ];
            logger.debug('Using desktop (<=1440px) responsive settings');
        }

        return adjustedSettings;
    }

    /**
     * Waits for terrain source to be loaded and applied
     */
    async waitForTerrainReady() {
        if (!this.map) return;
        const terrain = this.map.getTerrain();
        if (!terrain) return;

        const sourceId = terrain?.source || 'terrainSource';

        if (typeof this.map.isSourceLoaded === 'function' && this.map.isSourceLoaded(sourceId)) {
            return;
        }

        await new Promise((resolve) => {
            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    resolve();
                }
            }, 1500);

            const onSourceData = (e) => {
                if (e.sourceId === sourceId && e.isSourceLoaded) {
                    if (!resolved) {
                        resolved = true;
                        cleanup();
                        resolve();
                    }
                }
            };

            const cleanup = () => {
                clearTimeout(timeout);
                this.map.off('sourcedata', onSourceData);
            };

            this.map.on('sourcedata', onSourceData);
        });
    }

    /**
     * Resizes the map
     */
    resize() {
        if (this.map) {
            this.map.resize();
        }
    }

    /**
     * Destroys the map instance
     */
    destroy() {
        // Clean up resize observer
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        
        // Clean up empty texture
        if (this._emptyTexture && this.map) {
            const canvas = this.map.getCanvas();
            if (canvas) {
                const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
                if (gl) {
                    gl.deleteTexture(this._emptyTexture);
                }
            }
            this._emptyTexture = null;
        }
        
        // Destroy map
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
    }

    /**
     * Setup texture error handling for Android
     * @private
     */
    _setupTextureErrorHandling() {
        // Aggressively force texture binding on style load
        this.map.once('style.load', () => {
            this._ensureTexturesReady();
        });

        // Monitor all source loading
        this.map.on('sourcedata', (e) => {
            if (e.isSourceLoaded && e.sourceId) {
                const source = this.map.getSource(e.sourceId);
                if (source && source.type === 'vector') {
                    // Force texture allocation for vector tiles
                    setTimeout(() => {
                        this._ensureTexturesReady();
                        this.map.triggerRepaint();
                    }, 200);
                }
            }
        });

        // Ensure textures on first render
        this.map.once('render', () => {
            setTimeout(() => {
                this._ensureTexturesReady();
            }, 500);
        });
    }

    /**
     * Ensure all texture units have valid bindings
     * @private
     */
    _ensureTexturesReady() {
        try {
            const canvas = this.map.getCanvas();
            if (!canvas) return;

            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            if (!gl) return;

            // Get max texture units
            const maxUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
            
            // Save current texture binding state
            const currentTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
            const currentUnit = gl.getParameter(gl.ACTIVE_TEXTURE);

            // Create or reuse empty texture
            if (!this._emptyTexture) {
                this._emptyTexture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, this._emptyTexture);
                gl.texImage2D(
                    gl.TEXTURE_2D, 
                    0, 
                    gl.RGBA, 
                    1, 1, 0, 
                    gl.RGBA, 
                    gl.UNSIGNED_BYTE, 
                    new Uint8Array([0, 0, 0, 0])
                );
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            }

            // Bind empty texture to all potentially used units
            const unitsToCheck = [0, 1, 2, 3, 4, 5, 6, 7]; // MapLibre typically uses 0-7
            unitsToCheck.forEach(unit => {
                if (unit < maxUnits) {
                    gl.activeTexture(gl.TEXTURE0 + unit);
                    const bound = gl.getParameter(gl.TEXTURE_BINDING_2D);
                    if (!bound) {
                        // Only bind if nothing is bound
                        gl.bindTexture(gl.TEXTURE_2D, this._emptyTexture);
                    }
                }
            });

            // Restore previous state
            gl.activeTexture(currentUnit);
            gl.bindTexture(gl.TEXTURE_2D, currentTexture);

        } catch (error) {
            // Silent error handling - don't let texture binding issues crash the app
            logger.warn('Texture binding check failed:', error);
        }
    }

    /**
     * Check if WebGL is supported
     * @private
     */
    _checkWebGLSupport() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            return !!gl;
        } catch (e) {
            return false;
        }
    }

    /**
     * Sets initial map view
     * @private
     */
    _setMapView(initial) {
        if (!initial) return;
        
        const mapSettings = this.getResponsiveMapSettings(initial);
                
        this.map.jumpTo({
            center: mapSettings.center,
            zoom: mapSettings.zoom,
            pitch: mapSettings.pitch,
            bearing: mapSettings.bearing
        });
    }

    /**
     * Applies fog to the map
     * @private
     */
    _applyFog(fogConfig) {
        if (!fogConfig) return;
          
        this.map.setFog(fogConfig);
    }

    /**
     * Adds resize handler
     * @private
     */
    _addResizeHandler(mapEl) {
        if (!mapEl) return;
        
        const resizeObserver = new ResizeObserver(() => {
            if (this.map) {
                this.map.resize();
            }
        });
        
        resizeObserver.observe(mapEl);
        
        // Store for cleanup
        this._resizeObserver = resizeObserver;
    }
}
