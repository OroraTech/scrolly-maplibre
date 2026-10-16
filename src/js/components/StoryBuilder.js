import { Logger } from '../utils/logger.js';

const logger = new Logger('StoryBuilder');

export class StoryBuilder {
    static createStoryStructure(containerId, config) {
        if (!containerId || typeof containerId !== 'string') {
            throw new Error('containerId must be a non-empty string');
        }
        
        if (!config || typeof config !== 'object') {
            throw new Error('config must be a valid object');
        }
        
        if (!Array.isArray(config.maps) || config.maps.length === 0) {
            throw new Error('config.maps must be a non-empty array');
        }

        let container = document.getElementById(containerId);
        if (!container) {
            container = document.querySelector(`.${containerId}`);
        }
        if (!container) {
            throw new Error(`Container ${containerId} not found`);
        }

        container.innerHTML = '';

        // Use containerId as namespace (sanitize if needed)
        const namespace = containerId.replace(/[^\w-]/g, '');

        if (config.preMapContent) {
            container.appendChild(this.createTextSection('pre-map', config.preMapContent));
        }

        config.maps.forEach((mapConfig, index) => {
            container.appendChild(this.createMapSection(mapConfig, index + 1, namespace));
        });

        if (config.postMapContent) {
            container.appendChild(this.createTextSection('post-map', config.postMapContent));
        }
    }

    static createMapSection(mapConfig, index, namespace) {
        const container = document.createElement('div');
        container.className = 'map-section-container';

        const mapSection = document.createElement('section');
        mapSection.id = `${namespace}-map-container-${index}`;
        mapSection.className = 'map-container';

        const mapId = `${namespace}-map${index}`;
        const scrollyId = `${namespace}-scrolly${index}`;
        const scrollContentId = `${namespace}-scroll-content${index}`;

        mapSection.innerHTML = `
            <div id="${mapId}" class="map"></div>
            <div id="${scrollyId}" class="scrolly">
                <div id="${scrollContentId}" class="scroll-content"></div>
            </div>
        `;

        container.appendChild(mapSection);

        if (mapConfig.intermediateContent) {
            const intermediate = this.createTextSection(
                `intermediate-${index}`,
                mapConfig.intermediateContent
            );
            container.appendChild(intermediate);
        }

        return container;
    }

    static createTextSection(type, content) {
        const section = document.createElement('section');
        section.id = `${type}-section`;
        section.className = type.includes('intermediate') ? 'intermediate-section' : '';

        const textContent = document.createElement('div');
        textContent.className = 'text-content';

        if (content.sections && Array.isArray(content.sections)) {
            if (content.sections.length > 0) {
                content.sections.forEach(section => {
                    const element = this.createContentElement(section);
                    textContent.appendChild(element);
                });
            } else {
                const placeholder = document.createElement('p');
                placeholder.textContent = 'No content available';
                textContent.appendChild(placeholder);
            }
        } else {
            const defaultContent = document.createElement('p');

            if (typeof content === 'string') {
                defaultContent.textContent = content;
            } else if (typeof content.content === 'string') {
                defaultContent.textContent = content.content;
            } else {
                defaultContent.textContent = 'Content section missing proper structure';
            }

            textContent.appendChild(defaultContent);
        }

        section.appendChild(textContent);
        return section;
    }

    static createContentElement(section) {
        switch (section.type) {
            case 'text':
                return this.createTextElement(section);
            case 'media':
                return this.createMediaElement(section);
            default:
                logger.warn(`Unknown section type: ${section.type}`);
                return document.createElement('div');
        }
    }

    static createTextElement(section) {
        if (!section?.content) {
            logger.warn('Text section missing content');
            return document.createElement('div');
        }

        const element = document.createElement(section.style === 'heading' ? 'div' : 'p');
        
        // Sanitize content - basic XSS prevention
        const sanitizedContent = section.content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        element.textContent = sanitizedContent; // Using textContent prevents HTML injection
        
        element.className = section.style === 'heading' ? 'story-heading' : (section.style || '');
        return element;
    }

    static createMediaElement(mediaConfig) {
        if (!mediaConfig) return null;

        const mediaContainer = document.createElement('div');
        mediaContainer.className = 'media-container';

        const mediaType = mediaConfig.type === 'media' ? mediaConfig.mediaType : mediaConfig.type;

        if (mediaType === 'image') {
            const img = document.createElement('img');
            img.src = mediaConfig.url;
            img.alt = mediaConfig.alt || '';
            img.className = `media-item position-${mediaConfig.position}`;
            mediaContainer.appendChild(img);

            if (mediaConfig.caption) {
                const caption = document.createElement('p');
                caption.className = 'media-caption';
                caption.textContent = mediaConfig.caption;
                mediaContainer.appendChild(caption);
            }
        } else if (mediaType === 'video') {
            const video = document.createElement('video');
            video.src = mediaConfig.url;
            video.className = `media-item position-${mediaConfig.position}`;
            video.controls = true;
            mediaContainer.appendChild(video);
        }

        return mediaContainer;
    }

    static async preloadAssets(config, progressCallback) {
        // Quick optimization: skip asset preloading if no assets or if disabled
        if (config.initParameters?.skipAssetPreloading) {
            if (progressCallback) progressCallback(100);
            return;
        }

        const assets = [];
        const loadedAssets = [];        
        const processSections = (sections) => {
                if (!sections?.sections) return;
                sections.sections.forEach(section => {
                    if (section.type === 'media' && section.url) {
                        assets.push(section.url);
                    }
                });
            };

        const processSteps = (maps) => {
            if (!maps) return;
            maps.forEach(map => {
                if (map.steps) {
                    map.steps.forEach(step => {
                        if (step.media?.url) {
                            assets.push(step.media.url);
                        }
                    });
                }
            });
        };

        processSections(config.preMapContent);
        processSections(config.postMapContent);
        processSteps(config.maps);

        const loadPromises = assets.map(url => {
            return new Promise((resolve) => {
                try {
                    if (url.endsWith('.jpg') || url.endsWith('.png') || url.endsWith('.jpeg') || url.endsWith('.webp')) {
                        const img = new Image();
                        img.onload = () => {
                            loadedAssets.push(img);
                            if (progressCallback) {
                                progressCallback((loadedAssets.length / assets.length) * 100);
                            }
                            resolve();
                        };
                        img.onerror = () => {
                            logger.warn(`Failed to preload image: ${url}`);
                            loadedAssets.push(null);
                            if (progressCallback) {
                                progressCallback((loadedAssets.length / assets.length) * 100);
                            }
                            resolve(); // Don't reject to avoid breaking the entire load
                        };
                        img.src = url;
                    } else if (url.endsWith('.mp4') || url.endsWith('.webm')) {
                        const video = document.createElement('video');
                        video.preload = 'metadata';
                        video.onloadedmetadata = () => {
                            loadedAssets.push(video); 
                            if (progressCallback) {
                                progressCallback((loadedAssets.length / assets.length) * 100);
                            }
                            resolve();
                        };
                        video.onerror = () => {
                            logger.warn(`Failed to preload video: ${url}`);
                            loadedAssets.push(null);
                            if (progressCallback) {
                                progressCallback((loadedAssets.length / assets.length) * 100);
                            }
                            resolve();
                        };
                        video.src = url;
                    } else {
                        loadedAssets.push(null); 
                        resolve();
                    }
                } catch (error) {
                    logger.error(`Error preloading asset ${url}:`, error);
                    loadedAssets.push(null); 
                    resolve();
                }
            });
        });

        await Promise.all(loadPromises);

        // Return cleanup function
        return {
            cleanup: () => {
                loadedAssets.forEach(asset => {
                    if (asset.src) {
                        asset.src = '';
                    }
                });
                loadedAssets.length = 0;
            }
        };
    }
}
