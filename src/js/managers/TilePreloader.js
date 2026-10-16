/**
 * Handles map tile preloading for smooth scrollytelling experiences
 */
export class TilePreloader {
    constructor(map) {
        this.map = map;
    }

    /**
     * Preloads map tiles for all story positions
     * @param {Array} steps - Story steps with map positions
     * @param {Object} config - Configuration object
     * @param {Function} progressCallback - Progress callback (0-1)
     */
    async preloadTiles(steps, config, progressCallback) {
        if (steps.length === 0 || !this.map) return;

        try {
            const positions = steps.map(step => ({
                center: step.map.center,
                zoom: step.map.zoom,
                bearing: step.map.bearing,
                pitch: step.map.pitch
            }));

            // Add initial position if available
            if (config.initParameters?.map) {
                positions.unshift({
                    center: config.initParameters.map.center,
                    zoom: config.initParameters.map.zoom,
                    bearing: config.initParameters.map.bearing,
                    pitch: config.initParameters.map.pitch
                });
            }

            // Filter positions to only preload significantly different views
            const filteredPositions = this._filterPositions(positions);

            if (filteredPositions.length <= 1) {
                if (progressCallback) progressCallback(1.0);
                return;
            }

            await this._preloadPositions(filteredPositions, progressCallback);

            // Return to initial position
            const initialPosition = {
                center: config.initParameters.map.center,
                zoom: config.initParameters.map.zoom,
                bearing: config.initParameters.map.bearing,
                pitch: config.initParameters.map.pitch
            };
            this.map.jumpTo(initialPosition);
            await this._waitForIdleAndSettle(25, 800);
            
        } catch (error) {
            console.warn('Error preloading map tiles:', error);
        }
    }

    /**
     * Filters positions to only include significantly different views
     * @param {Array} positions - Array of map positions
     * @returns {Array} Filtered positions
     */
    _filterPositions(positions) {
        const filteredPositions = [positions[0]];
        
        for (let i = 1; i < positions.length; i++) {
            const prev = positions[i-1];
            const curr = positions[i];
            
            const centerDiff = Math.abs(prev.center[0] - curr.center[0]) + 
                              Math.abs(prev.center[1] - curr.center[1]);
            const zoomDiff = Math.abs(prev.zoom - curr.zoom);
            const bearingDiff = Math.abs((prev.bearing || 0) - (curr.bearing || 0));
            const pitchDiff = Math.abs((prev.pitch || 0) - (curr.pitch || 0));
            
            // Only include if change is significant enough
            if (centerDiff > 0.005 || zoomDiff > 1.0 || bearingDiff > 15 || pitchDiff > 10) {
                filteredPositions.push(curr);
            }
        }
        
        return filteredPositions;
    }

    /**
     * Preloads tiles for each position
     * @param {Array} positions - Filtered positions to preload
     * @param {Function} progressCallback - Progress callback
     */
    async _preloadPositions(positions, progressCallback) {
        for (let i = 0; i < positions.length; i++) {
            const position = positions[i];
            
            // Determine if this is a significant change requiring longer wait
            const isSignificantChange = i === 0 || 
                Math.abs(positions[i-1].zoom - position.zoom) > 2 ||
                (Math.abs(positions[i-1].center[0] - position.center[0]) + 
                 Math.abs(positions[i-1].center[1] - position.center[1])) > 0.01;
            
            // Jump to position and wait for tiles to load
            this.map.jumpTo(position);
            
            if (isSignificantChange) {
                await this._waitForIdleAndSettle(25, 800);
            } else {
                await this._waitForIdleAndSettle(15, 400);
            }
            
            // Small delay between positions
            await new Promise(resolve => setTimeout(resolve, 5));
            
            if (progressCallback) {
                const stepProgress = (i + 1) / positions.length;
                progressCallback(stepProgress);
            }
        }
    }

    /**
     * Waits for map to be idle and settled
     * @param {number} quietMs - Quiet period in milliseconds
     * @param {number} maxWaitMs - Maximum wait time
     */
    async _waitForIdleAndSettle(quietMs = 100, maxWaitMs = 2000) {
        if (!this.map) return;

        return new Promise((resolve) => {
            let settledTimer = null;
            const overallTimer = setTimeout(() => {
                cleanup();
                resolve();
            }, maxWaitMs);

            const cleanup = () => {
                clearTimeout(overallTimer);
                if (settledTimer) clearTimeout(settledTimer);
                this.map.off('data', onData);
                this.map.off('idle', onIdle);
            };

            const scheduleSettle = () => {
                if (settledTimer) clearTimeout(settledTimer);
                settledTimer = setTimeout(() => {
                    cleanup();
                    resolve();
                }, quietMs);
            };

            const onData = () => scheduleSettle();
            const onIdle = () => scheduleSettle();

            this.map.on('data', onData);
            this.map.on('idle', onIdle);

            if (this.map.loaded()) {
                scheduleSettle();
            }
        });
    }
}
