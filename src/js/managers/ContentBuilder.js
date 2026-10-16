import { richParagraphs } from '../utils/richText.js';
import { createFigcaption } from '../components/Sections.js';

/**
 * Handles content creation and UI updates for the scrollytelling interface
 */
export class ContentBuilder {
    constructor(scrollyMap) {
        this.scrollyMap = scrollyMap;
    }

    /**
     * Sets up scroll content with story steps
     * @param {Array} steps - Story steps
     */
    setupScrollContent(steps) {
        const scrollContent = document.getElementById(this.scrollyMap.options.scrollContainer);
        if (!scrollContent) {
            throw new Error(`Scroll container '${this.scrollyMap.options.scrollContainer}' not found`);
        }

        scrollContent.innerHTML = '';
        const mapContainer = document.getElementById(this.scrollyMap.options.mapContainer).parentElement;
        mapContainer.style.setProperty('--step-count', steps.length);

        steps.forEach((step, index) => {
            const section = this._createStepSection(step, index);
            scrollContent.appendChild(section);
        });
    }

    /**
     * Creates a step section element
     * @param {Object} step - Step configuration
     * @param {number} index - Step index
     * @returns {HTMLElement} Step section element
     */
    _createStepSection(step, index) {
        const section = document.createElement('section');
        section.classList.add('scroll-step');
        section.dataset.step = step.id;

        const box = document.createElement('div');
        box.className = 'content-box';
        box.dataset.position = step.position || 'center';
        if (step.className) box.classList.add(...String(step.className).split(/s+/).filter(Boolean));

        // Optional small label above the title, such as a chapter name
        if (step.kicker) {
            const kicker = document.createElement('p');
            kicker.className = 'content-kicker';
            kicker.textContent = step.kicker;
            box.appendChild(kicker);
        }

        // Add title if present
        if (step.title) {
            const title = this._createTitle(step.title, index);
            box.appendChild(title);
        }

        // Add media if present
        if (step.media) {
            const media = this._createMedia(step.media);
            box.appendChild(media);
        }

        // Add description if present
        if (step.description) {
            const description = this._createDescription(step.description);
            box.appendChild(description);
        }

        section.appendChild(box);
        return section;
    }

    /**
     * Creates a title element
     * @param {string} titleText - Title text
     * @param {number} index - Step index
     * @returns {HTMLElement} Title element
     */
    _createTitle(titleText, index) {
        const title = document.createElement('div');
        title.className = 'content-title';
        title.textContent = titleText;
        title.id = `step-title-${this.scrollyMap.options.mapId}-${index}`;
        return title;
    }

    /**
     * Creates a media element
     * @param {Object} mediaConfig - Media configuration
     * @returns {HTMLElement} Media container element
     */
    _createMedia(mediaConfig) {
        const media = document.createElement('figure');
        media.className = 'media-container';

        if (mediaConfig.type === 'image') {
            const img = this._createImageElement(mediaConfig);
            media.appendChild(img);
        } else if (mediaConfig.type === 'video') {
            const video = this._createVideoElement(mediaConfig);
            media.appendChild(video);
        }

        // Add caption and credit if present
        const caption = createFigcaption(mediaConfig.caption, mediaConfig.credit);
        if (caption) media.appendChild(caption);

        return media;
    }

    /**
     * Creates an image element
     * @param {Object} mediaConfig - Media configuration
     * @returns {HTMLElement} Image element
     */
    _createImageElement(mediaConfig) {
        const img = document.createElement('img');
        img.src = mediaConfig.url;
        img.alt = mediaConfig.alt ?? '';
        img.loading = 'lazy';
        return img;
    }

    /**
     * Creates a video element
     * @param {Object} mediaConfig - Media configuration
     * @returns {HTMLElement} Video element
     */
    _createVideoElement(mediaConfig) {
        const video = document.createElement('video');
        video.src = mediaConfig.url;
        video.controls = true;
        video.muted = true;
        video.playsInline = true;
        return video;
    }

    /**
     * Creates the description, with one paragraph per array item
     * @param {string|string[]} descriptionText - Description text
     * @returns {HTMLElement} Description element
     */
    _createDescription(descriptionText) {
        const wrapper = document.createElement('div');
        wrapper.className = 'content-description';
        richParagraphs(descriptionText).forEach(p => wrapper.appendChild(p));
        return wrapper;
    }

    /**
     * Sets up step indicators
     * @param {Array} steps - Story steps
     */
    setupStepIndicators(steps) {
        const mapEl = document.getElementById(this.scrollyMap.options.mapContainer);
        
        // Remove existing indicators
        const existingIndicators = mapEl.querySelector('.step-indicators');
        if (existingIndicators) {
            existingIndicators.remove();
        }

        const indicatorsContainer = document.createElement('div');
        indicatorsContainer.className = 'step-indicators';
        indicatorsContainer.id = `step-indicators-${this.scrollyMap.options.mapId}`;

        steps.forEach((step, index) => {
            const indicator = this._createStepIndicator(step, index);
            indicatorsContainer.appendChild(indicator);
        });

        mapEl.appendChild(indicatorsContainer);
    }

    /**
     * Creates a step indicator element
     * @param {Object} step - Step configuration
     * @param {number} index - Step index
     * @returns {HTMLElement} Step indicator element
     */
    _createStepIndicator(step, index) {
        const indicator = document.createElement('div');
        indicator.className = 'step-indicator';
        indicator.dataset.stepIndex = index;
        indicator.dataset.stepId = step.id;
        indicator.dataset.mapId = this.scrollyMap.options.mapId;
        indicator.setAttribute('aria-label', `Go to step ${index + 1}: ${step.title}`);
        indicator.setAttribute('role', 'button');
        indicator.setAttribute('tabindex', '0');

        // Add click handler
        indicator.addEventListener('click', () => {
            this.scrollyMap.scrollController.navigateToStep(index);
        });

        // Add keyboard handler
        indicator.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.scrollyMap.scrollController.navigateToStep(index);
            }
        });

        return indicator;
    }

    /**
     * Updates step indicators to show current state
     * @param {number} currentIndex - Current step index
     */
    updateStepIndicators(currentIndex) {
        const mapEl = document.getElementById(this.scrollyMap.options.mapContainer);
        const indicators = mapEl.querySelectorAll('.step-indicator');

        indicators.forEach((indicator, index) => {
            indicator.classList.remove('active', 'completed');

            if (index === currentIndex) {
                indicator.classList.add('active');
            } else if (index < currentIndex) {
                indicator.classList.add('completed');
            }
        });
    }

    /**
     * Creates or gets live region for screen reader announcements
     * @returns {HTMLElement} Live region element
     */
    createLiveRegion() {
        const existing = document.getElementById(`story-announcer-${this.scrollyMap.options.mapId}`);
        if (existing) return existing;

        const liveRegion = document.createElement('div');
        liveRegion.setAttribute('aria-live', 'polite');
        liveRegion.setAttribute('aria-atomic', 'true');
        liveRegion.className = 'sr-only';
        liveRegion.id = `story-announcer-${this.scrollyMap.options.mapId}`;

        // Always append to story container (fallback logic handled in _getStoryContainerElement)
        const storyRoot = this._getStoryContainerElement();
        storyRoot.appendChild(liveRegion);

        return liveRegion;
    }

    /**
     * Gets the story container element
     * @returns {HTMLElement} Story container element (always returns a valid element)
     */
    _getStoryContainerElement() {
        // Try explicit storyContainerId first
        if (this.scrollyMap.options.storyContainerId) {
            const container = document.getElementById(this.scrollyMap.options.storyContainerId);
            if (container) return container;
        }
        
        // Fallback: find closest .story-container from map element
        const mapEl = document.getElementById(this.scrollyMap.options.mapContainer);
        if (mapEl) {
            const storyContainer = mapEl.closest('.story-container');
            if (storyContainer) return storyContainer;
            
            // Fallback: use map's parent container
            if (mapEl.parentElement) return mapEl.parentElement;
        }
        
        // Last resort: use the scroll container's parent
        const scrollEl = document.getElementById(this.scrollyMap.options.scrollContainer);
        if (scrollEl?.parentElement) return scrollEl.parentElement;
        
        // Should never reach here, but return body as absolute fallback
        return document.body;
    }
}
