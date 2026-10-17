import { StoryBuilder } from '../components/StoryBuilder.js';
import { ScrollyMap } from '../core/ScrollyMap.js';
import { ConfigValidator } from '../schema/ConfigValidator.js';
import { Logger } from './logger.js';

const logger = new Logger('StoryManager');

export class StoryManager {
  constructor(containerId, config, maps) {
    this.containerId = containerId;
    this.config = config;
    this.maps = maps;
    this._mapsLoadedCallbacks = [];
    this._mapsFullyLoaded = false;
    this._waitingForMaps = false;
  }

  /**
   * Initializes one story instance.
   * @param {string} containerId - e.g. "story-container-960"
   * @param {string} configPath - path or endpoint to fetch JSON config from
   * @param {function(number):void} progressCallback - optional progress updater (0..100)
   * @returns {Promise<StoryManager>}
   */
  static async initialize(containerId, configPath, progressCallback) {
    try {
      logger.debug(`Starting initialization for ${containerId}`);
      
      const config = await this.loadConfig(configPath);
      logger.debug(`Config loaded successfully`);
      
      if (progressCallback) progressCallback(15);

      logger.debug(`Loading map resources...`);
      if (config.maps?.length) await this.loadMapResources();
      logger.debug(`Map resources loaded`);
      
      if (progressCallback) progressCallback(25);

      logger.debug(`Creating story structure...`);
      StoryBuilder.createStoryStructure(containerId, config);
      logger.debug(`Story structure created`);
      
      if (progressCallback) progressCallback(35);

      logger.debug(`Preloading assets...`);
      await StoryBuilder.preloadAssets(config, (assetProgress) => {
        const scaledProgress = 35 + (assetProgress * 0.15);
        if (progressCallback) progressCallback(scaledProgress);
      });
      logger.debug(`Assets preloaded`);
      
      if (progressCallback) progressCallback(50);

      logger.debug(`Initializing ${config.maps?.length || 0} maps...`);
      const maps = await this.initializeMaps(config.maps, containerId);
      logger.debug(`Maps initialized (${maps.length} successful)`);
      
      if (progressCallback) progressCallback(60);

      const manager = new StoryManager(containerId, config, maps);
      logger.debug(`Initialization complete for ${containerId}`);

      return manager;
    } catch (error) {
      console.error(`StoryManager: Critical initialization error for ${containerId}:`, error);
      this.handleError(error);
      throw error;
    }
  }

  async waitForMapReady() {
    if (this.maps.length === 0) {
      this.isLoaded = true;
      this.triggerLoadedCallbacks();
      return;
    }

    const readyPromises = this.maps.map((map, index) => {
      return new Promise((resolve) => {
        if (map.onReady && typeof map.onReady === 'function') {
          map.onReady(() => {
            resolve();
          });
        } else {
          resolve();
        }
      });
    });

    await Promise.all(readyPromises);
    
    this.isLoaded = true;
    this.triggerLoadedCallbacks();
  }

  /**
   * Sets up callback to fire when all maps are fully ready.
   * @param {function():void} cb
   */
  onMapsLoaded(cb) {
    if (this._mapsFullyLoaded) {
      // Already loaded, call immediately
      setTimeout(() => cb(), 0);
    } else {
      // Add to callbacks and start waiting if not already waiting
      this._mapsLoadedCallbacks.push(cb);
      if (this._mapsLoadedCallbacks.length === 1) {
        // First callback added, start the waiting process
        this._waitForMapsToBeReady();
      }
    }
  }

  static async loadConfig(configPath) {
    try {
      const response = await fetch(configPath);
      if (!response.ok) {
        throw new Error(`Failed to load config from ${configPath}: ${response.statusText}`);
      }

      const config = await response.json();

      const isValid = await ConfigValidator.validate(config);
      if (!isValid) {
        throw new Error('Configuration validation failed');
      }

      return config;
    } catch (error) {
      const errorMessage =
        error.name === 'SyntaxError'
          ? 'Invalid JSON format in config file'
          : error.message;

      console.error('Config loading failed:', errorMessage);
      throw new Error(`Failed to load configuration: ${errorMessage}`);
    }
  }

  /**
   * Initializes all maps declared in the config for a given story container.
   * Applies the same namespace that StoryBuilder used so IDs align.
   * @param {Array} mapsConfig
   * @param {string} containerId
   * @returns {Promise<Array<ScrollyMap>>}
   */
  static async initializeMaps(mapsConfig = [], containerId) {
    if (!Array.isArray(mapsConfig) || mapsConfig.length === 0) {
      logger.debug(`StoryManager: No maps to initialize`);
      return [];
    }

    // Sanitize namespace same way StoryBuilder does internally
    const namespace = containerId.replace(/[^\w-]/g, '');

    // Get the global tracker to register maps as they're created
    const globalTracker = window.__scrollymap_global_tracker;

    logger.debug(`StoryManager: Creating ${mapsConfig.length} map instances...`);
    
    // Create all maps first, then initialize them in parallel
    const mapInstances = [];
    for (let i = 0; i < mapsConfig.length; i++) {
      const mapIndex = i + 1;
      const mapId = mapsConfig[i].id;
      
      logger.debug(`StoryManager: Creating map ${mapIndex} (ID: ${mapId})`);
      
      const map = new ScrollyMap({
        mapContainer: `${namespace}-map${mapIndex}`,
        scrollContainer: `${namespace}-scroll-content${mapIndex}`,
        mapId: mapId,
        config: mapsConfig[i],
      });

      // Register with global tracker BEFORE initialization
      if (globalTracker) {
        const storyId = containerId.replace('story-container-', '');
        globalTracker.registerMap(map, storyId, mapId);
        logger.debug(`StoryManager: Registered map ${mapId} with global tracker`);
      }

      mapInstances.push({ map, mapIndex, mapId });
    }

    logger.debug(`StoryManager: Initializing ${mapInstances.length} maps in parallel...`);

    const initResults = await Promise.allSettled(
      mapInstances.map(async ({ map, mapIndex, mapId }) => {
        try {
          logger.debug(`StoryManager: Starting init for map ${mapIndex} (${mapId})`);
          await map.init();
          logger.debug(`StoryManager: Map ${mapIndex} (${mapId}) initialized successfully`);
          return { map, success: true, mapId };
        } catch (err) {
          console.error(`StoryManager: Error initializing map ${mapIndex} (${mapId}):`, err);
          return { map: null, success: false, error: err, mapId };
        }
      })
    );

    const maps = [];
    initResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.success) {
        maps.push(result.value.map);
        logger.debug(`StoryManager: Map ${index + 1} (${result.value.mapId}) added to collection`);
      } else {
        const errorMsg = result.reason || result.value?.error;
        const mapId = result.value?.mapId || 'unknown';
        console.error(`StoryManager: Failed to initialize map ${index + 1} (${mapId}):`, errorMsg);
      }
    });

    logger.debug(`StoryManager: Map initialization complete. ${maps.length}/${mapsConfig.length} successful`);

    return maps;
  }

  static async loadMapResources() {
    return;
  }

  static handleError(error) {
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';

    const message = document.createElement('p');
    message.textContent = `An error occurred: ${error.message}`;

    const reloadButton = document.createElement('button');
    reloadButton.textContent = 'Reload Page';
    reloadButton.addEventListener('click', () => {
      location.reload();
    });

    errorElement.appendChild(message);
    errorElement.appendChild(reloadButton);

    // Try to append to story container first, fallback to body
    const storyContainer = document.getElementById('story-container') || document.body;
    storyContainer.appendChild(errorElement);
  }
}
