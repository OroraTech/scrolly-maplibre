/**
 * Manages map legends and their updates
 */
export class LegendManager {
    constructor(mapElement, mapId) {
        this.mapElement = mapElement;
        this.mapId = mapId;
        this.legendElement = null;
        this.legendConfig = [];
    }

    /**
     * Creates and adds legend to the map
     * @param {Object} config - Map configuration
     */
    initialize(config) {
        const legend = document.createElement('div');
        legend.className = 'map-legend';
        legend.id = `map-legend-${this.mapId}`;
        legend.style.display = 'none';

        this.mapElement.appendChild(legend);

        this.legendElement = legend;
        this.legendConfig = config.layers?.filter(layer => layer.legend) || [];
    }

    /**
     * Updates legend based on visible layers
     * @param {Array} visibleLayerIds - Array of visible layer IDs
     */
    update(visibleLayerIds) {
        if (!this.legendElement || !this.legendConfig) return;

        const visibleLegendLayers = this.legendConfig.filter(layer =>
            visibleLayerIds.includes(layer.id)
        );

        this.legendElement.innerHTML = '';

        if (visibleLegendLayers.length === 0) {
            this.legendElement.style.display = 'none';
            return;
        }

        this.legendElement.style.display = 'block';

        visibleLegendLayers.forEach(layer => {
            const legendSection = this._createLegendSection(layer);
            this.legendElement.appendChild(legendSection);
        });
    }

    /**
     * Creates a legend section for a layer
     * @param {Object} layer - Layer configuration
     * @returns {HTMLElement} Legend section element
     */
    _createLegendSection(layer) {
        const legendSection = document.createElement('div');
        legendSection.className = 'legend-section';

        const title = document.createElement('div');
        title.textContent = layer.legend.title;
        title.className = 'legend-title';
        legendSection.appendChild(title);

        layer.legend.items.forEach(item => {
            const legendItem = this._createLegendItem(item);
            legendSection.appendChild(legendItem);
        });

        return legendSection;
    }

    /**
     * Creates a legend item
     * @param {Object} item - Legend item configuration
     * @returns {HTMLElement} Legend item element
     */
    _createLegendItem(item) {
        const legendItem = document.createElement('div');
        legendItem.className = 'legend-item';

        const representation = this._createLegendRepresentation(item);
        const label = document.createElement('span');
        label.className = 'legend-label';
        label.textContent = item.label;

        legendItem.appendChild(representation);
        legendItem.appendChild(label);

        return legendItem;
    }

    /**
     * Creates visual representation for legend item
     * @param {Object} item - Legend item configuration
     * @returns {HTMLElement} Legend representation element
     */
    _createLegendRepresentation(item) {
        const wrapper = document.createElement('div');
        wrapper.className = 'legend-representation';

        const shape = document.createElement('div');
        const type = item.type || 'color';

        switch (type) {
            case 'point':
            case 'circle':
                this._stylePointLegend(shape, item);
                break;

            case 'line':
                this._styleLineLegend(shape, item);
                break;

            case 'polygon':
            case 'color':
            default:
                this._stylePolygonLegend(shape, item);
                break;
        }

        wrapper.appendChild(shape);
        return wrapper;
    }

    /**
     * Styles point/circle legend representation
     * @param {HTMLElement} shape - Shape element
     * @param {Object} item - Legend item configuration
     */
    _stylePointLegend(shape, item) {
        shape.className = 'legend-point';
        shape.style.backgroundColor = item.color;
        const size = item.size || '12px';
        shape.style.width = size;
        shape.style.height = size;
        shape.style.borderRadius = '50%';
        if (item.strokeColor) {
            shape.style.border = `${item.strokeWidth || 1}px solid ${item.strokeColor}`;
        }
    }

    /**
     * Styles line legend representation
     * @param {HTMLElement} shape - Shape element
     * @param {Object} item - Legend item configuration
     */
    _styleLineLegend(shape, item) {
        shape.className = 'legend-line';
        shape.style.backgroundColor = item.color;
        shape.style.width = item.width || '20px';
        shape.style.height = item.thickness || '3px';
        shape.style.borderRadius = '1px';
    }

    /**
     * Styles polygon/color legend representation
     * @param {HTMLElement} shape - Shape element
     * @param {Object} item - Legend item configuration
     */
    _stylePolygonLegend(shape, item) {
        shape.className = 'legend-polygon';
        shape.style.backgroundColor = item.color;
        shape.style.width = '1em';
        shape.style.height = '1em';
        shape.style.borderRadius = '0.1875em';
        shape.style.border = '1px solid rgba(0, 0, 0, 0.2)';
    }
}
