export class AnimatedPaths {
  constructor(map, options = {}) {
    this.map = map;
    this.overlay = null;
    this.pathData = [];
    this.animationTime = 0;
    this.animationId = null;
    this.frameCount = 0;
    this.options = {
        sourceId: options.sourceId,
        sourceLayer: options.sourceLayer,
        speedProperty: options.speedProperty,
        elevationData: options.elevationData || `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`,
        texture: options.texture || null,
        elevationScale: options.elevationScale || 2,
        fixedElevation: options.fixedElevation || null,
        animationSpeed: options.animationSpeed || 0.02,
        frameSkip: options.frameSkip || 1,
        trailLength: options.trailLength || 500,
        beforeId: options.beforeId || null,
        interleaved: options.interleaved || false,
        pathColor: options.pathColor || [255, 255, 255, 255],
        // GeoJSON URL or object to read whole lines from, instead of the loaded map tiles
        data: options.data || null,
        // Stretch every path to the longest duration so they all start and end together
        normalizeDuration: options.normalizeDuration ?? true,
        // Drape the paths over a deck.gl terrain layer
        terrain: options.terrain ?? true,
        // Restart the animation when it ends; when false, it plays once and holds the last frame
        loop: options.loop ?? true,
        // Feature property that sets line width, multiplied by widthScale; defaults to the speed steps
        widthProperty: options.widthProperty || null,
        widthScale: options.widthScale ?? 1,
        layerId: options.layerId || `${options.sourceId}-trails`,
        ...options
    };
    this._maxTimestamp = 0;
  }

  async _waitForSource() {
    if (this.map.isSourceLoaded && this.map.isSourceLoaded(this.options.sourceId)) return;
    return new Promise(resolve => {
      const check = () => {
        if (this.map.getSource(this.options.sourceId) && this.map.isSourceLoaded(this.options.sourceId)) {
          resolve();
        } else {
          setTimeout(check, 200);
        }
      };
      check();
    });
  }

  async _loadFeatures() {
    if (this.options.data) {
        const data = typeof this.options.data === 'string'
            ? await (await fetch(this.options.data)).json()
            : this.options.data;
        return data.type === 'FeatureCollection' ? data.features : [data];
    }

    const source = this.map.getSource(this.options.sourceId);

    if (!source) {
        console.error(`Source '${this.options.sourceId}' not found!`);
        this.trackError('source_not_found', new Error(`Source '${this.options.sourceId}' not found`));
        return;
    }

    await this._waitForSource();

    this.map.triggerRepaint();
    await new Promise(resolve => setTimeout(resolve, 500));

    return this.map.querySourceFeatures(this.options.sourceId, {
        sourceLayer: this.options.sourceLayer,
        validate: false
    });
  }

  async loadPathData() {
    const features = await this._loadFeatures();
    if (!features) return;

    try {
        // First pass: process all paths and collect their durations
        const processedPaths = features
            .filter(f => f.geometry && f.geometry.type === 'LineString')
            .map((f, i) => {
                const coords = f.geometry.coordinates;
                const props = f.properties || {};

                let timestamps = Array.isArray(props.timestamps) ? props.timestamps : JSON.parse(props.timestamps || '[]');
                if (!timestamps.length) {
                    const speed = props[this.options.speedProperty] || props.speed || 20;
                    timestamps = coords.map((_, idx) => idx * (50 / speed));
                }

                return {
                    path: coords,
                    originalTimestamps: timestamps,
                    speed: props[this.options.speedProperty] || props.speed || 20,
                    properties: props
                };
            });

        // Find the maximum duration across all paths
        const maxDuration = Math.max(...processedPaths.map(p =>
            Math.max(...p.originalTimestamps) - Math.min(...p.originalTimestamps)
        ));
        // Without normalizing, paths keep their own timestamps on one shared clock
        const maxTimestamp = Math.max(...processedPaths.map(p => Math.max(...p.originalTimestamps)));

        // Second pass: normalize all timestamps to use the same duration
        this.pathData = processedPaths.map(pathObj => {
            const originalTimestamps = pathObj.originalTimestamps;
            const minTime = Math.min(...originalTimestamps);
            const maxTime = Math.max(...originalTimestamps);
            const originalDuration = maxTime - minTime;

            // Normalize timestamps to start at 0 and end at maxDuration
            const normalizedTimestamps = this.options.normalizeDuration
                ? originalTimestamps.map(t => ((t - minTime) / originalDuration) * maxDuration)
                : originalTimestamps;

            const path = pathObj.path.map(coord => {
                if (this.options.fixedElevation !== null) {
                    return [coord[0], coord[1], this.options.fixedElevation];
                }
                return coord.length === 3 ? coord : [coord[0], coord[1], 0];
            });

            return {
                path: path,
                timestamps: normalizedTimestamps,
                speed: pathObj.speed,
                properties: pathObj.properties
            };
        });

        this._maxTimestamp = this.options.normalizeDuration ? maxDuration : maxTimestamp;

    } catch (error) {
        console.error('Error processing path data:', error);
        this.trackError('path_data_processing', error);
    }
}

 async show() {
  if (this.overlay) return;

  if (typeof deck === 'undefined') {
    console.error('Deck.gl not loaded - animated paths require deck.gl library');
    this.trackError('dependency_missing', new Error('Deck.gl not loaded'));

    // Try to load deck.gl on-demand
    if (typeof window.ensureDeckGL === 'function') {
      await window.ensureDeckGL();
      if (typeof deck === 'undefined') {
        console.error('deck.gl still not available after on-demand load');
        return;
      }
    } else {
      return;
    }
  }

  await new Promise(resolve => setTimeout(resolve, 1000));
    await this.loadPathData();

    if (this.pathData.length === 0) {
      console.error('No path data loaded, cannot show animation');
      this.trackError('no_path_data', new Error('No path data loaded'));
      return;
    }

    this.terrainLayer = this.options.terrain ? new deck.TerrainLayer({
      id: `${this.options.layerId}-terrain`,
      elevationData: this.options.elevationData,
      elevationDecoder: this.options.fixedElevation !== null ? {
        rScaler: 0,
        gScaler: 0,
        bScaler: 0,
        offset: 0
      } : {
        rScaler: 256 * this.options.elevationScale,
        gScaler: 1 * this.options.elevationScale,
        bScaler: (1 / 256) * this.options.elevationScale,
        offset: -32768 * this.options.elevationScale
      },
      texture: null,
      meshMaxError: 8,
      wireframe: false,
      visible: true,
      operation: 'terrain',
      refinementStrategy: 'best-available',
      throttleRequests: true,
      maxRequests: 6
    }) : null;

    this.overlay = new deck.MapboxOverlay({
      interleaved: !!this.options.interleaved,
      layers: this._layers(),
      beforeId: this.options.beforeId
    });
    this.map.addControl(this.overlay);

    this._animate();
  }
  _animate() {
    if (!this.overlay) return;

    this.animationId = requestAnimationFrame(() => {
      try {
        this.frameCount++;
        if (this.frameCount % this.options.frameSkip !== 0) {
          this._animate();
          return;
        }

        this.animationTime += this.options.animationSpeed;
        const maxTs = this._maxTimestamp;

        // Calculate fade opacity based on position in cycle
        let fadeOpacity = 1.0;
        const fadeZone = maxTs * 0.15;

        if (this.animationTime < fadeZone) {
          const progress = this.animationTime / fadeZone;
          fadeOpacity = progress * progress * progress;
        } else if (this.options.loop && this.animationTime > maxTs - fadeZone) {
          const progress = (maxTs - this.animationTime) / fadeZone;
          fadeOpacity = progress * progress * progress;
        }

        if (this.animationTime > maxTs) {
          if (!this.options.loop) {
            // Hold the last frame with the whole route drawn
            this.animationTime = maxTs;
            this._renderTrips(fadeOpacity, maxTs);
            return;
          }
          this.animationTime = 0;
        }

        this._renderTrips(fadeOpacity);
        
        this._animate();
      } catch (error) {
        console.error('Animation error:', error);
        this.trackError('animation_error', error);

        // Stop infinite error loop
        if (this.errorCount && this.errorCount > 5) {
          console.error('Too many animation errors, stopping animation');
          this.trackError('animation_error_limit', new Error('Too many animation errors'));
          this.hide();
          return;
        }
        this.errorCount = (this.errorCount || 0) + 1;
        this._animate();
      }
    });
  }

  _layers() {
    return [this.tripsLayer, this.terrainLayer].filter(Boolean);
  }

  _width(d) {
    if (this.options.widthProperty) {
      return (Number(d.properties?.[this.options.widthProperty]) || 1) * this.options.widthScale;
    }
    const s = d.speed || 20;
    if (s <= 15) return 4;
    else if (s <= 25) return 6;
    else if (s <= 35) return 8;
    else if (s <= 45) return 10;
    else if (s <= 55) return 12;
    else return 14;
  }

  _renderTrips(fadeOpacity, trailLength = this.options.trailLength) {
    // Only recreate the TripsLayer, keep terrainLayer cached
    this.tripsLayer = new deck.TripsLayer({
      id: this.options.layerId,
      data: this.pathData,
      extensions: this.options.terrain ? [new deck._TerrainExtension()] : [],
      getPath: d => {
        const path = d.path.map(coord => {
            if (Array.isArray(coord[0])) {
                return [coord[0][0], coord[0][1]];
            }
            return coord;
        });
        return path;
      },
      getTimestamps: d => d.timestamps,
      getColor: d => this.options.pathColor,
      getWidth: d => this._width(d),
      trailLength,
      opacity: fadeOpacity,
      widthMinPixels: 2,
      widthMaxPixels: 20,
      currentTime: this.animationTime,
      billboard: false,
      fadeTrail: true,
      material: {
        alphaCutoff: 0.01
      }
    });

    this.overlay.setProps({
      layers: this._layers(),
    });
  }

  hide() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.overlay) {
      this.map.removeControl(this.overlay);
      this.overlay = null;
    }

    this.terrainLayer = null;
    this.tripsLayer = null;
    this.pathData = [];
    this.animationTime = 0;
    this.frameCount = 0;
    this.errorCount = 0;
  }

  destroy() {
    this.hide();
  }

  trackError(type, error) {
    if (window.gtag) {
      window.gtag('event', 'error', {
        event_category: 'animated_paths_error',
        event_label: type,
        error_message: error.message
      });
    }
  }
}
