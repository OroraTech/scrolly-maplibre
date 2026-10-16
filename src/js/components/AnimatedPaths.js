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
        // Units for line width: 'meters' or 'pixels'
        widthUnits: options.widthUnits || 'meters',
        // Share of the run spent fading in, and fading out when looping
        fade: options.fade ?? 0.15,
        layerId: options.layerId || `${options.sourceId}-trails`,
        // Let scrolling set the time instead of a loop: steps call setProgressTime()
        scrollDriven: options.scrollDriven ?? false,
        // Draw every path behind the current time as a solid line, so the flow grows and shrinks
        reveal: options.reveal ?? false,
        // RGBA colour of a marker at the front of a revealed flow, or null for none
        headColor: options.headColor ?? null,
        // How quickly a scroll-driven flow catches up to its target, in milliseconds
        smoothing: options.smoothing ?? 220,
        ...options
    };
    this._maxTimestamp = 0;
    this._generation = 0;
    this._showing = false;
    this._loaded = false;
    this._targetTime = null;
    this._lastFrame = null;
  }

  /**
   * Sets the time a scroll-driven flow should move to. The animation eases toward it.
   * @param {number} time - In the same units as the path timestamps
   */
  setProgressTime(time) {
    if (!Number.isFinite(time)) return;
    this._targetTime = time;
    // Before the first frame, start at the target rather than easing in from zero
    if (!this.overlay) this.animationTime = time;
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
    if (this._loaded && this.pathData.length) return;
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
        this._loaded = Boolean(this.options.data);

    } catch (error) {
        console.error('Error processing path data:', error);
        this.trackError('path_data_processing', error);
    }
}

  async show() {
    // Steps can call show() again, or hide(), while the data is still loading
    if (this.overlay || this._showing) return;
    this._showing = true;
    const generation = this._generation;
    try {
      await this._show(generation);
    } finally {
      this._showing = false;
    }
  }

 async _show(generation) {
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

  // Tile-based paths need the tiles to settle before they can be read
  if (!this.options.data) await new Promise(resolve => setTimeout(resolve, 1000));
    await this.loadPathData();

    // hide() was called while loading
    if (generation !== this._generation) return;

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

        const now = performance.now();
        // Scale by elapsed time so the speed is the same at any frame rate (animationSpeed is per 60fps frame)
        const dt = this._lastFrame === null ? 16.67 : Math.min(100, now - this._lastFrame);
        this._lastFrame = now;
        const maxTs = this._maxTimestamp;

        if (this.options.scrollDriven) {
          const target = Math.max(0, Math.min(maxTs, this._targetTime ?? 0));
          this.animationTime += (target - this.animationTime) * (1 - Math.exp(-dt / this.options.smoothing));
          this._renderTrips(1);
          this._animate();
          return;
        }

        this.animationTime += this.options.animationSpeed * (dt / 16.67);

        // Calculate fade opacity based on position in cycle
        let fadeOpacity = 1.0;
        const fadeZone = maxTs * this.options.fade;

        if (fadeZone <= 0) {
          fadeOpacity = 1.0;
        } else if (this.animationTime < fadeZone) {
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
    return [this.tripsLayer, this.headLayer, this.terrainLayer].filter(Boolean);
  }

  /** Positions where each path is at the current time, for the head marker. */
  _headPositions() {
    const t = this.animationTime;
    const heads = [];
    for (const d of this.pathData) {
      const ts = d.timestamps;
      if (!ts.length || t < ts[0] || t > ts[ts.length - 1]) continue;
      for (let i = 1; i < ts.length; i++) {
        if (t <= ts[i]) {
          const f = ts[i] === ts[i - 1] ? 0 : (t - ts[i - 1]) / (ts[i] - ts[i - 1]);
          const a = d.path[i - 1];
          const b = d.path[i];
          heads.push({ position: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] });
          break;
        }
      }
    }
    return heads;
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
    const reveal = this.options.reveal;
    if (reveal) trailLength = Math.max(this.animationTime, 0) + 1;
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
      widthUnits: this.options.widthUnits,
      trailLength,
      opacity: fadeOpacity,
      widthMinPixels: 2,
      widthMaxPixels: 20,
      currentTime: this.animationTime,
      billboard: false,
      fadeTrail: !reveal,
      material: {
        alphaCutoff: 0.01
      }
    });

    this.headLayer = reveal && this.options.headColor && this.animationTime > 0.5 ? new deck.ScatterplotLayer({
      id: `${this.options.layerId}-head`,
      data: this._headPositions(),
      getPosition: d => d.position,
      getRadius: 6,
      radiusUnits: 'pixels',
      getFillColor: this.options.headColor,
      stroked: true,
      getLineColor: [255, 255, 255, 255],
      lineWidthUnits: 'pixels',
      getLineWidth: 2
    }) : null;

    this.overlay.setProps({
      layers: this._layers(),
    });
  }

  hide() {
    this._generation++;
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
    this.headLayer = null;
    this._lastFrame = null;
    // Keep data read from a file; tile data must be read again next time
    if (!this._loaded) this.pathData = [];
    if (!this.options.scrollDriven) this.animationTime = 0;
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
