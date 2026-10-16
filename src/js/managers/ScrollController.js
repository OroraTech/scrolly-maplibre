import { Logger } from '../utils/logger.js';

const logger = new Logger('ScrollController');

/**
 * Handles scrolling interactions and step navigation
 */
export class ScrollController {
    constructor(scrollyMap) {
        this.scrollyMap = scrollyMap;
        this.scroller = null;
        this.scrollOffset = 0.5;
        this.isNavigating = false;
        this.currentStep = null;
        
        // Bind methods
        this.handleKeyboard = this.handleKeyboard.bind(this);
        this.handleOrientationChange = this.handleOrientationChange.bind(this);
    }

    /**
     * Sets up Scrollama for step detection
     * @param {Array} steps - Story steps
     */
    setupScrollama(steps) {
        this._setupStepProgress(steps);

        // iOS optimization: Use IntersectionObserver instead of scroll events when supported
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        
        if (isIOS && 'IntersectionObserver' in window) {
            this._setupIOSObserver(steps);
            return;
        }
        
        // Standard Scrollama setup for other devices
        this.scroller = scrollama();

        // Calculate responsive scroll offset
        const scrollOffset = this._calculateScrollOffset();
        this.scrollOffset = scrollOffset;

        this.scroller
            .setup({
                step: `#${this.scrollyMap.options.scrollContainer} .scroll-step`,
                offset: scrollOffset,
                debug: false
            })
            .onStepEnter(response => this._handleStepEnter(response, steps));

        // Set up responsive resize handling
        window.removeEventListener('resize', this.scroller.resize);
        window.addEventListener('resize', () => this._handleResize(steps));
    }

    /**
     * Reports how far the reader is through each step that sets animate, on every device.
     * Progress runs from 0 when the step's top reaches the middle of the screen
     * to 1 when its bottom does.
     * @param {Array} steps - Story steps
     */
    _setupStepProgress(steps) {
        if (!steps.some(step => step.animate)) return;
        let queued = false;

        const update = () => {
            queued = false;
            const elements = document.querySelectorAll(`#${this.scrollyMap.options.scrollContainer} .scroll-step`);
            const middle = window.innerHeight / 2;
            let current = null;
            elements.forEach((el, index) => {
                if (!steps[index]?.animate) return;
                const rect = el.getBoundingClientRect();
                // The last step whose top has passed the middle of the screen
                if (rect.top <= middle) current = { index, rect };
            });
            if (!current) {
                const first = steps.findIndex(step => step.animate);
                if (first >= 0) this.scrollyMap.layerManager.setStepProgress(steps[first], 0);
                return;
            }
            const progress = Math.max(0, Math.min(1, (middle - current.rect.top) / current.rect.height));
            this.scrollyMap.layerManager.setStepProgress(steps[current.index], progress);
        };

        this._progressHandler = () => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(update);
        };
        window.addEventListener('scroll', this._progressHandler, { passive: true });
        window.addEventListener('resize', this._progressHandler, { passive: true });
        update();
    }

    /**
     * Sets up IntersectionObserver for iOS devices (passive scroll alternative)
     * @param {Array} steps - Story steps
     */
    _setupIOSObserver(steps) {
        logger.debug('Using IntersectionObserver for iOS scroll optimization');

        // Clean up existing observer if any
        if (this._iosObserver) {
            this._iosObserver.disconnect();
        }
        if (this._progressHandler) {
            window.removeEventListener('scroll', this._progressHandler);
            window.removeEventListener('resize', this._progressHandler);
        }
        
        const scrollOffset = this._calculateScrollOffset();
        this.scrollOffset = scrollOffset;
        
        // Convert offset to rootMargin (e.g., 0.5 = '-50% 0px')
        const marginPercent = Math.round((1 - scrollOffset) * 100);
        const rootMargin = `-${marginPercent}% 0px`;
        
        this._iosObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting && !this.isNavigating) {
                        const stepEl = entry.target;
                        const allSteps = Array.from(
                            document.querySelectorAll(`#${this.scrollyMap.options.scrollContainer} .scroll-step`)
                        );
                        const index = allSteps.indexOf(stepEl);
                        
                        if (index !== -1 && index !== this.currentStep) {
                            this._handleStepEnter(
                                { 
                                    element: stepEl, 
                                    index: index, 
                                    direction: index > (this.currentStep || 0) ? 'down' : 'up' 
                                }, 
                                steps
                            );
                        }
                    }
                });
            },
            { 
                threshold: [0, 0.25, 0.5, 0.75, 1.0],
                rootMargin: rootMargin
            }
        );
        
        // Observe all step elements
        const stepElements = document.querySelectorAll(`#${this.scrollyMap.options.scrollContainer} .scroll-step`);
        stepElements.forEach(el => this._iosObserver.observe(el));
        
        // Set up resize handling for iOS observer
        window.addEventListener('resize', () => this._handleIOSResize(steps), { passive: true });
    }

    /**
     * Handles resize events for iOS IntersectionObserver
     * @param {Array} steps - Story steps
     */
    _handleIOSResize(steps) {
        clearTimeout(this._iosResizeTimeout);
        this._iosResizeTimeout = setTimeout(() => {
            const newOffset = this._calculateScrollOffset();
            if (newOffset !== this.scrollOffset) {
                this._setupIOSObserver(steps);
            }
        }, 250);
    }

    /**
     * Calculates responsive scroll offset based on device
     * @returns {number} Scroll offset (0-1)
     */
    _calculateScrollOffset() {
        const isMobile = window.innerWidth <= 768;
        const isLandscape = window.innerHeight < window.innerWidth;

        if (isMobile && isLandscape) {
            return 0.3;
        } else if (isMobile) {
            return 0.5;
        } else {
            return 0.5;
        }
    }

    /**
     * Handles window resize events
     * @param {Array} steps - Story steps
     */
    _handleResize(steps) {
        const newOffset = this._calculateScrollOffset();
        this.updateScrollamaOffset(newOffset, steps);
    }

    /**
     * Updates Scrollama offset configuration
     * @param {number} newOffset - New scroll offset
     * @param {Array} steps - Story steps
     */
    updateScrollamaOffset(newOffset, steps) {
        this.scrollOffset = newOffset;
        const currentStepIndex = this.currentStep;

        if (this.scroller) {
            this.scroller.destroy();
        }

        this.scroller = scrollama()
            .setup({
                step: `#${this.scrollyMap.options.scrollContainer} .scroll-step`,
                offset: newOffset,
                debug: false
            })
            .onStepEnter(response => this._handleStepEnter(response, steps));

        if (currentStepIndex !== null) {
            this.scroller.resize();
        }
    }

    /**
     * Sets up accessibility features
     */
    setupAccessibility() {
        document.addEventListener('keydown', this.handleKeyboard);

        const mapEl = document.getElementById(this.scrollyMap.options.mapContainer);
        if (mapEl) {
            mapEl.setAttribute('role', 'region');
            mapEl.setAttribute('aria-label', `Interactive map ${this.scrollyMap.options.mapId}`);
        }

        // Add ARIA labels to content boxes
        const storyRoot = this._getStoryContainerElement() || document;
        storyRoot.querySelectorAll('.content-box').forEach((box, index) => {
            box.setAttribute('role', 'region');
            box.setAttribute('aria-labelledby', `step-title-${index}`);
        });

        // Add keyboard navigation info
        this._addKeyboardInfo();
    }

    /**
     * Adds keyboard navigation information for screen readers
     */
    _addKeyboardInfo() {
        const keyboardInfo = document.createElement('div');
        keyboardInfo.className = 'sr-only';
        keyboardInfo.id = `keyboard-info-${this.scrollyMap.options.mapId}`;
        keyboardInfo.textContent = 'Use arrow keys to navigate through the story';

        // Always append to story container (fallback logic handled in _getStoryContainerElement)
        const container = this._getStoryContainerElement();
        container.appendChild(keyboardInfo);
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

    /**
     * Handles keyboard navigation
     * @param {KeyboardEvent} evt - Keyboard event
     */
    handleKeyboard(evt) {
        if (this.currentStep === null) return;

        const sections = document.querySelectorAll(`#${this.scrollyMap.options.scrollContainer} .scroll-step`);
        const maxSteps = sections.length;

        switch (evt.key) {
            case 'ArrowDown':
            case 'PageDown':
                if (this.currentStep < maxSteps - 1) {
                    this.navigateToStep(this.currentStep + 1);
                }
                break;
            case 'ArrowUp':
            case 'PageUp':
                if (this.currentStep > 0) {
                    this.navigateToStep(this.currentStep - 1);
                }
                break;
        }
    }

    /**
     * Navigates programmatically to a specific step
     * @param {number} index - Step index
     */
    navigateToStep(index) {
        const sections = document.querySelectorAll(`#${this.scrollyMap.options.scrollContainer} .scroll-step`);
        if (index >= 0 && index < sections.length) {
            this.isNavigating = true;
            this.currentStep = index;
            
            const step = this.scrollyMap.options.config.steps[index];
            
            // Update map position
            if (step.map) {
                const mapSettings = this.scrollyMap.mapManager.getResponsiveMapSettings(step.map);
                const duration = step.map.duration ?? 2250;

                this.scrollyMap.mapManager.map.easeTo({
                    center: mapSettings.center,
                    zoom: mapSettings.zoom,
                    pitch: mapSettings.pitch,
                    bearing: mapSettings.bearing,
                    padding: mapSettings.padding,
                    duration: duration,
                    easing: t => t
                });
            }

            // Update layers
            this.scrollyMap.layerManager.updateVisibility(step, this.scrollyMap.options.config.layers || []);

            // Update UI
            this.scrollyMap.contentBuilder.updateStepIndicators(index);
            this._scrollToStep(index, sections);
            this._announceStepChange(step);
            this._updateActiveStep(sections, index);

            // Reset navigation flag
            const maxDuration = Math.max(1000, step.map?.duration ?? 2250);
            setTimeout(() => {
                this.isNavigating = false;
            }, maxDuration + 100);
        }
    }

    /**
     * Scrolls to a specific step
     * @param {number} index - Step index
     * @param {NodeList} sections - Section elements
     */
    _scrollToStep(index, sections) {
        const targetSection = sections[index];
        const windowHeight = window.innerHeight;

        const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
        const rect = targetSection.getBoundingClientRect();
        const absoluteSectionTop = rect.top + currentScrollY;
        const offsetFromBottom = windowHeight * this.scrollOffset;
        const additionalOffset = windowHeight * 0.15;
        const targetPosition = absoluteSectionTop - offsetFromBottom + additionalOffset;

        window.scrollTo({
            top: Math.max(0, targetPosition),
            behavior: 'smooth'
        });
    }

    /**
     * Announces step change to screen readers
     * @param {Object} step - Step configuration
     */
    _announceStepChange(step) {
        const live = document.getElementById(`story-announcer-${this.scrollyMap.options.mapId}`) || 
                     this.scrollyMap.contentBuilder.createLiveRegion();
        live.textContent = `Navigated to ${step.title}: ${step.description}`;
    }

    /**
     * Updates active step visual state
     * @param {NodeList} sections - Section elements
     * @param {number} activeIndex - Active step index
     */
    _updateActiveStep(sections, activeIndex) {
        sections.forEach((sec, index) => {
            sec.classList.remove('is-active');
            sec.setAttribute('aria-hidden', 'true');
            
            if (index === activeIndex) {
                sec.classList.add('is-active');
                sec.setAttribute('aria-hidden', 'false');
            }
        });
    }

    /**
     * Handles step enter events from Scrollama
     * @param {Object} response - Scrollama response
     * @param {Array} steps - Story steps
     */
    async _handleStepEnter(response, steps) {
        if (this.isNavigating) return;

        try {
            const step = steps[response.index];
            if (!step) {
                logger.error('Invalid step index:', response.index);
                return;
            }

            this.currentStep = response.index;

            // Update step indicators
            this.scrollyMap.contentBuilder.updateStepIndicators(response.index);

            // Track analytics
            if (window.gtag) {
                window.gtag('event', 'view_step', {
                    story_id: document.title,
                    map_id: this.scrollyMap.options.mapId,
                    step_id: step.id
                });
            }

            // Update map position
            if (step.map) {
                const mapSettings = this.scrollyMap.mapManager.getResponsiveMapSettings(step.map);
                const duration = step.map.duration ??
                    this.scrollyMap.options.config.initParameters?.cameraDuration ??
                    2250;

                this.scrollyMap.mapManager.map.easeTo({
                    center: mapSettings.center,
                    zoom: mapSettings.zoom,
                    pitch: mapSettings.pitch,
                    bearing: mapSettings.bearing,
                    padding: mapSettings.padding,
                    duration: duration,
                    easing: t => t
                });
            }

            // Update layer visibility
            await this.scrollyMap.layerManager.updateVisibility(step, this.scrollyMap.options.config.layers || []);

            // Update legend
            this.scrollyMap.legendManager.update(step.visibleLayers || []);

            // Announce to screen readers
            const live = document.getElementById(`story-announcer-${this.scrollyMap.options.mapId}`) || 
                         this.scrollyMap.contentBuilder.createLiveRegion();
            live.textContent = `Showing ${step.title}: ${step.description}`;

            // Update active step
            this._updateActiveStep(
                document.querySelectorAll(`#${this.scrollyMap.options.scrollContainer} section`),
                response.index
            );

        } catch (error) {
            logger.error('Error in handleStepEnter:', error);
            this._trackError('step_transition_error', error);
        }
    }

    /**
     * Handles orientation change events
     */
    handleOrientationChange() {
        clearTimeout(this.orientationTimeout);
        this.orientationTimeout = setTimeout(() => {
            setTimeout(() => {
                this.scrollyMap.mapManager.resize();

                if (this.scroller) {
                    this.scroller.resize();
                    const newOffset = this._calculateScrollOffset();
                    this.updateScrollamaOffset(newOffset, this.scrollyMap.options.config.steps);
                }

                // Restore current step position
                if (this.currentStep !== null) {
                    const step = this.scrollyMap.options.config.steps[this.currentStep];
                    if (step && step.map) {
                        const mapSettings = this.scrollyMap.mapManager.getResponsiveMapSettings(step.map);
                        this.scrollyMap.mapManager.map.jumpTo({
                            center: mapSettings.center,
                            zoom: mapSettings.zoom,
                            pitch: mapSettings.pitch,
                            bearing: mapSettings.bearing,
                        padding: mapSettings.padding
                        });
                    }
                }
            }, 300);
        }, 250);
    }

    /**
     * Tracks errors for analytics
     * @param {string} type - Error type
     * @param {Error} error - Error object
     */
    _trackError(type, error) {
        if (window.gtag) {
            window.gtag('event', 'error', {
                event_category: 'error',
                event_label: type,
                error_message: error.message
            });
        }
    }

    /**
     * Destroys the scroll controller
     */
    destroy() {
        if (this.scroller) {
            this.scroller.destroy();
        }
        if (this._iosObserver) {
            this._iosObserver.disconnect();
        }
        document.removeEventListener('keydown', this.handleKeyboard);
        window.removeEventListener('orientationchange', this.handleOrientationChange);
        
        if (this._iosResizeTimeout) {
            clearTimeout(this._iosResizeTimeout);
        }
    }
}
