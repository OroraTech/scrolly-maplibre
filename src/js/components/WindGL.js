/**
 * WindGL component for adding wind particle layers to MapLibre GL maps
 */
export class WindGL {
    constructor(map) {
        this.map = map;
        this.activeLayers = new Map();
    }

    /**
     * Add a windGL layer to the map
     * @param {string} layerId - Unique identifier for the layer
     * @param {Object} config - WindGL layer configuration
     */
    addLayer(layerId, config) {
        if (!window.windGL) {
            console.error('WindGL library not loaded');
            return;
        }

        const { source, particles } = window.windGL;
        const windSource = source(config.url);

        const windLayer = particles({
            id: layerId,
            source: windSource,
            'particle-color': config.windOptions?.particleColor || "white",
            'particle-speed': config.windOptions?.particleSpeed || 0.75,
            'particle-size': config.windOptions?.particleSize || 2,
            after: config.windOptions?.after || null
        });

        this.map.addLayer(windLayer);
        this.activeLayers.set(layerId, windLayer);

        // Force first frame render
        function forceFirstFrame(map) {
            requestAnimationFrame(() => {
                map.resize();                               
                map.setCenter(map.getCenter());             
                map.triggerRepaint?.();                     
            });
        }
        
    }

    /**
     * Remove a windGL layer from the map
     * @param {string} layerId - Layer identifier
     */
    removeLayer(layerId) {
        if (this.map.getLayer(layerId)) {
            this.map.removeLayer(layerId);
            this.activeLayers.delete(layerId);
        }
    }

    /**
     * Show/hide a windGL layer
     * @param {string} layerId - Layer identifier
     * @param {boolean} visible - Whether layer should be visible
     */
    setVisibility(layerId, visible) {
        if (this.map.getLayer(layerId)) {
            this.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
        }
    }

    /**
     * Update layer properties
     * @param {string} layerId - Layer identifier
     * @param {Object} properties - Properties to update
     */
    updateLayer(layerId, properties) {
        if (!this.map.getLayer(layerId)) return;

        Object.entries(properties).forEach(([key, value]) => {
            this.map.setPaintProperty(layerId, key, value);
        });
    }

    /**
     * Clean up all windGL layers
     */
    destroy() {
        this.activeLayers.forEach((layer, layerId) => {
            this.removeLayer(layerId);
        });
        this.activeLayers.clear();
    }
}