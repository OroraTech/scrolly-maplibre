export class ConfigValidator {
    static async loadConfig(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load configuration (HTTP ${response.status})`);
            }
            const data = await response.json();
            
            if (data.redirect) {
                return this.loadConfig(data.redirect);
            }

            this.validate(data);
            return data;
        } catch (error) {
            console.error('Configuration error:', error);
            throw error;
        }
    }

    static validate(config) {
        // Validate preMapContent if present
        if (config.preMapContent) {
            this.validateContentSection(config.preMapContent, 'preMapContent');
        }

        // Validate maps array (required)
        if (!Array.isArray(config.maps)) {
            throw new Error('Missing or invalid maps array in configuration');
        }

        // Validate each map configuration
        config.maps.forEach((mapConfig, index) => {
            this.validateMapConfig(mapConfig, index);
        });

        // Validate intermediateContent if present
        if (config.intermediateContent) {
            this.validateContentSection(config.intermediateContent, 'intermediateContent');
        }

        // Validate postMapContent if present
        if (config.postMapContent) {
            this.validateContentSection(config.postMapContent, 'postMapContent');
        }

        return true;
    }

    static validateContentSection(section, sectionName) {
        if (!Array.isArray(section.sections)) {
            throw new Error(`Missing or invalid sections array in ${sectionName}`);
        }

        section.sections.forEach((content, index) => {
            if (!content.type) {
                throw new Error(`Missing type in ${sectionName} section ${index + 1}`);
            }

            if (content.type === 'text') {
                if (!content.content) {
                    throw new Error(`Missing content in ${sectionName} text section ${index + 1}`);
                }
                if (!['paragraph', 'heading'].includes(content.style)) {
                    throw new Error(`Invalid style in ${sectionName} text section ${index + 1}`);
                }
            } else if (content.type === 'media') {
                this.validateMediaContent(content, `${sectionName} section ${index + 1}`);
            }
        });
    }

    static validateMediaContent(media, location) {
        // Handle both step media and section media structures
        if (media.type === 'media') {
            // Section media validation
            if (!media.mediaType) {
                throw new Error(`Missing mediaType in ${location}`);
            }
            if (!['image', 'video'].includes(media.mediaType)) {
                throw new Error(`Invalid mediaType in ${location}`);
            }
        } else {
            // Step media validation
            if (!media.type) {
                throw new Error(`Missing type in ${location}`);
            }
            if (!['image', 'video'].includes(media.type)) {
                throw new Error(`Invalid type in ${location}`);
            }
        }

        if (!media.url) {
            throw new Error(`Missing url in ${location}`);
        }

        // For images, require alt text
        const mediaType = media.mediaType || media.type;
        if (mediaType === 'image' && !media.alt) {
            throw new Error(`Missing alt text for image in ${location}`);
        }

        if (!['full-width', 'left', 'right'].includes(media.position)) {
            throw new Error(`Invalid position in ${location}`);
        }
    }

    static validateMapConfig(mapConfig, index) {
        // Validate map ID
        if (!mapConfig.id) {
            throw new Error(`Missing id for map ${index + 1}`);
        }

        // Check for required top-level parameters
        if (!mapConfig.initParameters) {
            throw new Error(`Missing initParameters in configuration for map ${mapConfig.id}`);
        }

        if (!mapConfig.initParameters.map) {
            throw new Error(`Missing map configuration for map ${mapConfig.id}`);
        }

        // Validate map settings
        const requiredMapParams = ['zoom', 'center', 'pitch', 'bearing'];
        requiredMapParams.forEach(param => {
            if (!(param in mapConfig.initParameters.map)) {
                throw new Error(`Missing ${param} in map configuration for map ${mapConfig.id}`);
            }
        });

        // Add specific validations for map coordinates
        const center = mapConfig.initParameters.map.center;
        if (!Array.isArray(center) || center.length !== 2) {
            throw new Error(`Invalid center coordinates in map ${mapConfig.id}`);
        }
        
        const lon = center[0], lat = center[1];
        if (typeof lon !== 'number' || lon < -180 || lon > 180) {
            throw new Error(`Invalid longitude value (${lon}) in map ${mapConfig.id}`);
        }
        if (typeof lat !== 'number' || lat < -90 || lat > 90) {
            throw new Error(`Invalid latitude value (${lat}) in map ${mapConfig.id}`);
        }
        
        const zoom = mapConfig.initParameters.map.zoom;
        if (typeof zoom !== 'number' || zoom < 0 || zoom > 22) {
            throw new Error(`Invalid zoom value (${zoom}) in map ${mapConfig.id}`);
        }

        // Validate layers if present
        if (mapConfig.layers) {
            this.validateLayers(mapConfig.layers, mapConfig.id);
        }

        // Only validate steps if scrollama is enabled
        const useScrollama = mapConfig.initParameters.useScrollama ?? true;
        if (useScrollama) {
            this.validateSteps(mapConfig);
        }

        // Validate optional parameters
        this.validateOptionalMapParams(mapConfig);

        // Validate interactive constraints if present
        if (mapConfig.initParameters.interactiveConstraints) {
            this.validateInteractiveConstraints(mapConfig.initParameters.interactiveConstraints, mapConfig.id);
        }
    }

    static validateLayers(layers, mapId) {
        if (!Array.isArray(layers)) {
            throw new Error(`Invalid layers array for map ${mapId}`);
        }

        layers.forEach((layer, index) => {
            if (!layer.id) {
                throw new Error(`Missing layer id in map ${mapId}`);
            }
            if (!layer.type) {
                throw new Error(`Missing layer type in map ${mapId}`);
            }

            // WindGL layers have different validation requirements
            if (layer.type === 'windgl') {
                if (!layer.url) {
                    throw new Error(`Missing url in windgl layer ${layer.id} for map ${mapId}`);
                }
                // Validate windOptions if present
                if (layer.windOptions) {
                    this.validateWindGLOptions(layer.windOptions, layer.id, mapId);
                }
            } else {
                // Standard layer validation for non-WindGL layers
                if (!layer.url && layer.type !== 'geojson') {
                    throw new Error(`Missing url in layer ${layer.id} for map ${mapId}`);
                }
                if (layer.type === 'pmtiles' && !layer.sourceLayer) {
                    throw new Error(`Missing sourceLayer in pmtiles layer ${layer.id} for map ${mapId}`);
                }
                if (!layer.style || !layer.style.type) {
                    throw new Error(`Missing or invalid style in layer ${layer.id} for map ${mapId}`);
                }
            }

            // Add legend validation (applies to all layer types)
            if (layer.legend) {
                this.validateLegend(layer.legend, layer.id, mapId);
            }
        });
    }

    static validateLegend(legend, layerId, mapId) {
        if (!legend.title || typeof legend.title !== 'string') {
            throw new Error(`Invalid or missing legend title for layer ${layerId} in map ${mapId}`);
        }

        if (!legend.type || !['point', 'line', 'polygon', 'continuous', 'mixed'].includes(legend.type)) {
            throw new Error(`Invalid legend type for layer ${layerId} in map ${mapId}. Must be 'point', 'line', 'polygon', 'continuous', or 'mixed'`);
        }
        
        if (!Array.isArray(legend.items) || legend.items.length === 0) {
            throw new Error(`Invalid or missing legend items for layer ${layerId} in map ${mapId}`);
        }
        
        legend.items.forEach((item, index) => {
            if (!item.label || typeof item.label !== 'string') {
                throw new Error(`Invalid label in legend item ${index + 1} for layer ${layerId} in map ${mapId}`);
            }
            if (!item.color || typeof item.color !== 'string') {
                throw new Error(`Invalid color in legend item ${index + 1} for layer ${layerId} in map ${mapId}`);
            }
        });
    }

    static validateSteps(mapConfig) {
        if (!Array.isArray(mapConfig.steps)) {
            throw new Error(`Invalid or missing steps array for map ${mapConfig.id}`);
        }

        mapConfig.steps.forEach((step, stepIndex) => {
            this.validateStep(step, stepIndex, mapConfig.id);
        });
    }

    static validateStep(step, stepIndex, mapId) {
        if (!step.id) {
            throw new Error(`Missing id in step ${stepIndex + 1} for map ${mapId}`);
        }

        if (!step.map) {
            throw new Error(`Missing map configuration in step ${step.id} for map ${mapId}`);
        }

        const requiredMapParams = ['zoom', 'center', 'pitch', 'bearing'];
        requiredMapParams.forEach(param => {
            if (!(param in step.map)) {
                throw new Error(`Missing ${param} in map configuration for step ${step.id} in map ${mapId}`);
            }
        });

        // Add duration validation for individual steps
        if ('duration' in step.map) {
            if (typeof step.map.duration !== 'number' || step.map.duration < 0) {
                throw new Error(`Invalid duration parameter (${step.map.duration}) in step ${step.id} for map ${mapId}. Must be a positive number.`);
            }
        }

        if (step.media) {
            this.validateMediaContent(step.media, `step ${step.id} in map ${mapId}`);
        }

        if (step.visibleLayers && !Array.isArray(step.visibleLayers)) {
            throw new Error(`Invalid visibleLayers in step ${step.id} for map ${mapId}`);
        }
    }

    static validateOptionalMapParams(mapConfig) {
        if ('useScrollama' in mapConfig.initParameters && 
            typeof mapConfig.initParameters.useScrollama !== 'boolean') {
            throw new Error(`Invalid useScrollama parameter in map ${mapConfig.id}`);
        }

        if ('isInteractive' in mapConfig.initParameters && 
            typeof mapConfig.initParameters.isInteractive !== 'boolean') {
            throw new Error(`Invalid isInteractive parameter in map ${mapConfig.id}`);
        }

        if (mapConfig.initParameters.customStyle) {
            if (!mapConfig.initParameters.customStyle.version || 
                !mapConfig.initParameters.customStyle.sources || 
                !mapConfig.initParameters.customStyle.layers) {
                throw new Error(`Invalid customStyle format in map ${mapConfig.id}`);
            }
        }
    }

    static validateInteractiveConstraints(constraints, mapId) {
        if (typeof constraints !== 'object' || constraints === null) {
            throw new Error(`Invalid interactiveConstraints format in map ${mapId}`);
        }

        // Validate maxBounds if present
        if (constraints.maxBounds) {
            if (!Array.isArray(constraints.maxBounds) || constraints.maxBounds.length !== 2) {
                throw new Error(`Invalid maxBounds format in map ${mapId}. Expected [[sw_lng, sw_lat], [ne_lng, ne_lat]]`);
            }

            const [southwest, northeast] = constraints.maxBounds;
            
            if (!Array.isArray(southwest) || southwest.length !== 2 ||
                !Array.isArray(northeast) || northeast.length !== 2) {
                throw new Error(`Invalid maxBounds coordinates in map ${mapId}. Expected [[sw_lng, sw_lat], [ne_lng, ne_lat]]`);
            }

            const [swLng, swLat] = southwest;
            const [neLng, neLat] = northeast;

            // Validate coordinate ranges
            if (typeof swLng !== 'number' || swLng < -180 || swLng > 180 ||
                typeof neLng !== 'number' || neLng < -180 || neLng > 180) {
                throw new Error(`Invalid longitude values in maxBounds for map ${mapId}`);
            }

            if (typeof swLat !== 'number' || swLat < -90 || swLat > 90 ||
                typeof neLat !== 'number' || neLat < -90 || neLat > 90) {
                throw new Error(`Invalid latitude values in maxBounds for map ${mapId}`);
            }

            // Validate bounds logic (southwest should be southwest of northeast)
            if (swLng >= neLng || swLat >= neLat) {
                throw new Error(`Invalid maxBounds: southwest corner must be southwest of northeast corner in map ${mapId}`);
            }
        }

        // Validate minZoom if present
        if (constraints.minZoom !== undefined) {
            if (typeof constraints.minZoom !== 'number' || 
                constraints.minZoom < 0 || 
                constraints.minZoom > 22) {
                throw new Error(`Invalid minZoom value (${constraints.minZoom}) in map ${mapId}. Must be between 0 and 22`);
            }
        }

        // Validate maxZoom if present
        if (constraints.maxZoom !== undefined) {
            if (typeof constraints.maxZoom !== 'number' || 
                constraints.maxZoom < 0 || 
                constraints.maxZoom > 22) {
                throw new Error(`Invalid maxZoom value (${constraints.maxZoom}) in map ${mapId}. Must be between 0 and 22`);
            }
        }

        // Validate zoom range logic
        if (constraints.minZoom !== undefined && 
            constraints.maxZoom !== undefined && 
            constraints.minZoom >= constraints.maxZoom) {
            throw new Error(`Invalid zoom constraints: minZoom must be less than maxZoom in map ${mapId}`);
        }
    }

    static validateWindGLOptions(windOptions, layerId, mapId) {
        // Validate particle-color (optional)
        if (windOptions.particleColor !== undefined) {
            // Can be a string (color) or MapLibre expression array
            if (typeof windOptions.particleColor !== 'string' && !Array.isArray(windOptions.particleColor)) {
                throw new Error(`Invalid particleColor in windgl layer ${layerId} for map ${mapId}. Must be a color string or MapLibre expression array.`);
            }
        }

        // Validate particle-speed (optional)
        if (windOptions.particleSpeed !== undefined) {
            // Can be a number or MapLibre expression array
            if (typeof windOptions.particleSpeed !== 'number' && !Array.isArray(windOptions.particleSpeed)) {
                throw new Error(`Invalid particleSpeed in windgl layer ${layerId} for map ${mapId}. Must be a number or MapLibre expression array.`);
            }
            
            // If it's a number, must be >= 0
            if (typeof windOptions.particleSpeed === 'number' && windOptions.particleSpeed < 0) {
                throw new Error(`Invalid particleSpeed in windgl layer ${layerId} for map ${mapId}. Must be >= 0.`);
            }
        }

        // Validate particle-size (optional) - Add this block
        if (windOptions.particleSize !== undefined) {
            // Can be a number or MapLibre expression array
            if (typeof windOptions.particleSize !== 'number' && !Array.isArray(windOptions.particleSize)) {
                throw new Error(`Invalid particleSize in windgl layer ${layerId} for map ${mapId}. Must be a number or MapLibre expression array.`);
            }
            
            // If it's a number, must be > 0
            if (typeof windOptions.particleSize === 'number' && windOptions.particleSize <= 0) {
                throw new Error(`Invalid particleSize in windgl layer ${layerId} for map ${mapId}. Must be > 0.`);
            }
        }

        // Validate after (optional)
        if (windOptions.after !== undefined && windOptions.after !== null) {
            if (typeof windOptions.after !== 'string') {
                throw new Error(`Invalid after in windgl layer ${layerId} for map ${mapId}. Must be a string or null.`);
            }
        }
    }
}
