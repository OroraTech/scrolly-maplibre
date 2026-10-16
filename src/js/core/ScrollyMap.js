import { MapConfig } from '../schema/MapConfig.js';
import { AnimatedPaths } from '../components/AnimatedPaths.js';
import { MapManager } from '../managers/MapManager.js';
import { LayerManager } from '../managers/LayerManager.js';
import { LegendManager } from '../managers/LegendManager.js';
import { ScrollController } from '../managers/ScrollController.js';
import { ContentBuilder } from '../managers/ContentBuilder.js';
import { TilePreloader } from '../managers/TilePreloader.js';

export class ScrollyMap {
    constructor(options = {}) {
        this.options = {
            mapContainer: 'map',
            scrollContainer: 'scroll-content',
            mapId: null,
            config: null,
            storyContainer: null,
            ...options
        };

        // Initialize managers
        this.mapManager = new MapManager(this.options.mapContainer, this.options.mapId);
        this.layerManager = null; // Will be initialized after map is created
        this.legendManager = null; // Will be initialized with map element
        this.scrollController = new ScrollController(this);
        this.contentBuilder = new ContentBuilder(this);
        this.tilePreloader = null; // Will be initialized after map is created

        // Legacy properties for compatibility
        this.map = null; // Will reference mapManager.map
        this.scroller = null; // Will reference scrollController.scroller
        this.currentStep = null; // Will reference scrollController.currentStep
        this.useScrollama = this.options.config?.initParameters?.useScrollama ?? true;
        this.isNavigating = false; // Will reference scrollController.isNavigating
        this.loadedLayers = new Set(); // Will reference layerManager.loadedLayers
        this.loadingLayers = new Set(); // Will reference layerManager.loadingLayers
        this.customLayers = new Map(); // Will reference layerManager.customLayers
        this._readyCallbacks = [];
        this._isReady = false;

        this._resizeDebounce = null;
        this._resizeHandler = null;

        if ('scrollRestoration' in history) {
            const original = history.scrollRestoration;
            history.scrollRestoration = 'manual';
            window.addEventListener('pagehide', () => {
                history.scrollRestoration = original;
            });
        }


        // Bind orientation change handler
        this.handleOrientationChange = this.scrollController.handleOrientationChange.bind(this.scrollController);
    }

    async init() {
        const globalTracker = window.__scrollymap_global_tracker;
        let mapKey = null;
        if (globalTracker) {
            for (const mapInfo of globalTracker.allMaps) {
                if (mapInfo.map === this) {
                    mapKey = mapInfo.key;
                    break;
                }
            }
        }
        
        const reportProgress = (progress) => {
            if (globalTracker && mapKey) {
                globalTracker.updateMapProgress(mapKey, progress);
            }
        };
        
        try {
            const isInteractive = this.options.config?.initParameters?.isInteractive ?? false;
            reportProgress(5);

            // Initialize map through MapManager
            this.map = await this.mapManager.initialize(this.options.config);
            reportProgress(20);

            // Add resize handler after map is ready
            this._resizeHandler = () => {
                clearTimeout(this._resizeDebounce);
                this._resizeDebounce = setTimeout(() => {
                    if (this.map) {
                        this.map.resize();
                    }
                }, 250);
            };
            
            window.addEventListener('resize', this._resizeHandler, { passive: true });

            // Initialize other managers now that map exists
            this.layerManager = new LayerManager(this.map);
            this.tilePreloader = new TilePreloader(this.map);
            
            const mapEl = document.getElementById(this.options.mapContainer);
            this.legendManager = new LegendManager(mapEl, this.options.mapId);

            // Setup legend if needed
            if (this.options.config.layers?.some(layer => layer.legend)) {
                this.legendManager.initialize(this.options.config);
            }

            // Wait for terrain if it exists
            const terrain = this.map.getTerrain();
            if (terrain) {
                await this.mapManager.waitForTerrainReady();
            }
            reportProgress(30);

            if (this.useScrollama) {
                this.contentBuilder.setupScrollContent(this.options.config.steps);
                this.contentBuilder.setupStepIndicators(this.options.config.steps);
                this.scrollController.setupScrollama(this.options.config.steps);
                this.scrollController.setupAccessibility();
                reportProgress(40);
            }

            if (isInteractive) {
                await this.layerManager.loadAllLayers(this.options.config.layers || []);
                const defaultVisible = this.layerManager.getDefaultVisibleLayers(this.options.config.layers || []);
                if (defaultVisible.length > 0) {
                    this.legendManager.update(defaultVisible);
                }
                reportProgress(90);
            } else {
                // Not awaited: animated data loads alongside the tiles
                this.layerManager.preloadAnimatedLayers(this.options.config.layers || []);
                await this.tilePreloader.preloadTiles(
                    this.options.config.steps,
                    this.options.config,
                    (stepProgress) => {
                        const progressValue = 40 + (stepProgress * 0.4);
                        reportProgress(progressValue);
                    }
                );
                reportProgress(80);
                
                await new Promise((r) => setTimeout(r, 50));
                reportProgress(90);
            }

            await new Promise((r) => setTimeout(r, 25));
            reportProgress(95);

            // Analytics tracking
            if (window.gtag) {
                window.gtag('event', 'story_initialized', {
                    story_id: document.title,
                    map_id: this.options.mapId,
                    total_steps: this.options.config.steps?.length || 0,
                    scrollama_enabled: this.useScrollama,
                    interactive: isInteractive
                });
            }

            // Set up legacy property references for backward compatibility
            this._setupLegacyReferences();

            this._isReady = true;
            this._readyCallbacks.forEach(cb => cb());
            this._readyCallbacks = [];
            reportProgress(100);

        } catch (error) {
            console.error('Error initializing ScrollyMap:', error);
            throw error;
        }
    }

    /**
     * Sets up legacy property references for backward compatibility
     */
    _setupLegacyReferences() {
        this.scroller = this.scrollController.scroller;
        this.currentStep = this.scrollController.currentStep;
        this.isNavigating = this.scrollController.isNavigating;
        this.loadedLayers = this.layerManager.loadedLayers;
        this.loadingLayers = this.layerManager.loadingLayers;
        this.customLayers = this.layerManager.customLayers;
    }

    onReady(callback) {
        if (this._isReady) {
            setTimeout(() => callback(), 0);
        } else {
            this._readyCallbacks.push(callback);
        }
    }

    // Delegate methods to appropriate managers

    /**
     * Updates layer visibility for a step
     * @param {Object} step - Step configuration
     */
    async updateLayerVisibility(step) {
        await this.layerManager.updateVisibility(step, this.options.config.layers || []);
        this.legendManager.update(step.visibleLayers || []);
    }

    /**
     * Gets responsive map settings
     * @param {Object} baseSettings - Base map settings
     * @returns {Object} Responsive map settings
     */
    getResponsiveMapSettings(baseSettings) {
        return this.mapManager.getResponsiveMapSettings(baseSettings);
    }

    /**
     * Navigates to a specific step
     * @param {number} index - Step index
     */
    navigateToStep(index) {
        this.scrollController.navigateToStep(index);
    }

    /**
     * Handles step enter events
     * @param {Object} response - Scrollama response
     * @param {Array} steps - Story steps
     */
    async handleStepEnter(response, steps) {
        return this.scrollController._handleStepEnter(response, steps);
    }

    /**
     * Handles keyboard navigation
     * @param {KeyboardEvent} evt - Keyboard event
     */
    handleKeyboard(evt) {
        this.scrollController.handleKeyboard(evt);
    }

    /**
     * Updates step indicators
     * @param {number} currentIndex - Current step index
     */
    updateStepIndicators(currentIndex) {
        this.contentBuilder.updateStepIndicators(currentIndex);
    }

    /**
     * Creates live region for announcements
     * @returns {HTMLElement} Live region element
     */
    createLiveRegion() {
        return this.contentBuilder.createLiveRegion();
    }

    /**
     * Destroys the ScrollyMap instance
     */
    destroy() {
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }
        if (this._resizeDebounce) {
            clearTimeout(this._resizeDebounce);
        }
        this.scrollController.destroy();
        this.layerManager.destroy();
        this.mapManager.destroy();
    }

    async preloadMapTiles(progressCallback) {
        return this.tilePreloader.preloadTiles(progressCallback);
    }

    async initMap(config) {
        return this.mapManager.initialize(config);
    }

    // Legacy helper methods for terrain waiting
    async _waitForTerrainReadyInternal() {
        return this.mapManager.waitForTerrainReady();
    }

    setInitialMapPosition(settings) {
        return this.mapManager.setInitialPosition(settings);
    }

    disableMapInteractions() {
        return this.mapManager.disableInteractions();
    }

    disableMapInteractionsforInteractivity() {
        return this.mapManager.disableInteractionsForInteractivity();
    }

    addInteractiveOverlay(mapEl) {
        return this.mapManager.addInteractiveOverlay(mapEl);
    }

    setupScrollContent(steps) {
        return this.contentBuilder.setupScrollContent(steps);
    }

    setupStepIndicators(steps) {
        return this.contentBuilder.setupStepIndicators(steps);
    }

    setupScrollama(steps) {
        return this.scrollController.setupScrollama(steps);
    }

    updateScrollamaOffset(newOffset, steps) {
        return this.scrollController.updateScrollamaOffset(newOffset, steps);
    }

    setupAccessibility() {
        return this.scrollController.setupAccessibility();
    }

    _getStoryContainerElement() {
        return this.contentBuilder._getStoryContainerElement();
    }

    handleKeyboard(evt) {
        return this.scrollController.handleKeyboard(evt);
    }

    navigateToStep(index) {
        return this.scrollController.navigateToStep(index);
    }

    // Legacy delegation methods (kept for existing functionality)
    async handleStepEnter(response, steps) {
        return this.scrollController._handleStepEnter(response, steps);
    }

    updateStepIndicators(currentIndex) {
        this.contentBuilder.updateStepIndicators(currentIndex);
    }

    getResponsiveMapSettings(baseSettings) {
        return this.mapManager.getResponsiveMapSettings(baseSettings);
    }

    async updateLayerVisibility(step) {
        return this.layerManager.updateVisibility(step);
    }

    async loadAnimatedPathsLayer(layerCfg, layerId) {
        return this.layerManager.loadAnimatedPathsLayer(layerCfg, layerId);
    }

    async loadGeoData(layerCfg, layerId) {
        return this.layerManager.loadLayer(layerCfg, layerId);
    }

    async loadAllLayersForInteractiveMap() {
        return this.layerManager.loadAllLayersForInteractiveMap();
    }

    createLiveRegion() {
        return this.contentBuilder.createLiveRegion();
    }

    trackError(type, error) {
        if (window.gtag) {
            window.gtag('event', 'error', {
                event_category: 'error',
                event_label: type,
                error_message: error.message
            });
        }
    }

    handleOrientationChange() {
        return this.scrollController.handleOrientationChange();
    }

    addLegend(mapEl, config) {
        return this.legendManager.initialize(mapEl, config);
    }

    updateLegend(visibleLayerIds) {
        return this.legendManager.update(visibleLayerIds);
    }

    createLegendRepresentation(item) {
        return this.legendManager._createLegendRepresentation(item);
    }

}
