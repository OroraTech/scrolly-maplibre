import { SECTION_TYPES, TEXT_STYLES } from '../shared/sectionTypes.js';
import { MapValidator } from './MapValidator.js';

export class ConfigValidator extends MapValidator {
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
        if (!config || typeof config !== 'object') throw new Error('Story config must be an object.');
        config = { ...config, maps: config.maps ?? [] };
        // Validate preMapContent if present
        if (config.preMapContent) {
            this.validateContentSection(config.preMapContent, 'preMapContent');
        }

        // Validate maps array (required)
        if (!Array.isArray(config.maps)) {
            throw new Error('Missing or invalid maps array in configuration');
        }

        this.validateIds(config.maps, 'map');

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
            const where = `${sectionName} section ${index + 1}`;
            if (!content.type) {
                throw new Error(`Missing type in ${where}`);
            }
            if (!SECTION_TYPES.includes(content.type)) {
                throw new Error(`Unknown section type '${content.type}' in ${where}. Must be one of: ${SECTION_TYPES.join(', ')}`);
            }

            switch (content.type) {
                case 'text':
                    if (!content.content || (Array.isArray(content.content) && content.content.length === 0)) {
                        throw new Error(`Missing content in ${where}`);
                    }
                    if (content.style && !TEXT_STYLES.includes(content.style)) {
                        throw new Error(`Invalid style '${content.style}' in ${where}. Must be one of: ${TEXT_STYLES.join(', ')}`);
                    }
                    break;
                case 'media':
                    this.validateMediaContent(content, where);
                    break;
                case 'quote':
                    if (!content.content) throw new Error(`Missing content in ${where}`);
                    break;
                case 'stats':
                    if (!Array.isArray(content.items) || content.items.length === 0) {
                        throw new Error(`Missing items in ${where}`);
                    }
                    content.items.forEach((item, i) => {
                        if (item.value === undefined || !item.label) {
                            throw new Error(`Stat ${i + 1} in ${where} needs a value and a label`);
                        }
                    });
                    break;
                case 'embed':
                    if (!content.url) throw new Error(`Missing url in ${where}`);
                    if (!content.title) throw new Error(`Missing title in ${where}. Embeds need a title for screen readers`);
                    break;
                case 'hero':
                    if (!content.title) throw new Error(`Missing title in ${where}`);
                    if (content.image && !content.alt) throw new Error(`Missing alt text for the hero image in ${where}`);
                    break;
                case 'list':
                    if (!Array.isArray(content.items)) throw new Error(`Missing items in ${where}`);
                    break;
                case 'scrolly-embed':
                    if (!content.url) throw new Error(`Missing url in ${where}`);
                    if (!content.title) throw new Error(`Missing title in ${where}. Embeds need a title for screen readers`);
                    if (!Array.isArray(content.steps) || content.steps.length === 0) throw new Error(`Missing steps in ${where}`);
                    break;
                case 'compare':
                    ['before', 'after'].forEach(key => {
                        if (!content[key]?.url) throw new Error(`Missing ${key}.url in ${where}`);
                        if (!content[key].alt) throw new Error(`Missing ${key}.alt in ${where}`);
                    });
                    break;
            }
        });
    }

    static validateMapConfig(mapConfig, index) {
        super.validateMapConfig(mapConfig, index);
        if (mapConfig.intermediateContent) this.validateContentSection(mapConfig.intermediateContent, `intermediateContent of map ${mapConfig.id}`);
    }
}
