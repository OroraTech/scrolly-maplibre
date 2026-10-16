// ---- viewport height CSS variable (mobile soft-keyboard issue) ----
function updateVhVariable() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
updateVhVariable();
window.addEventListener('resize', updateVhVariable);
window.addEventListener('orientationchange', updateVhVariable);

/**
 * Minimal platform detection for safe-area handling of attrbutions and legend over maps.
 */
function initPlatformSafeArea() {
  const ua = navigator.userAgent;
  const html = document.documentElement;
  
  // iOS detection (Safari and Chrome on iOS)
  const isIOS = /iPad|iPhone|iPod/.test(ua) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  
  if (isIOS) {
    html.classList.add('ios');
    return;
  }
  
  // Pixel + Chrome detection
  const isPixelChrome = /Android/i.test(ua) && 
    /Pixel/i.test(ua) && 
    /Chrome\/\d+/i.test(ua) && 
    !/EdgA|OPR|Firefox|SamsungBrowser/i.test(ua);
  
  if (isPixelChrome) {
    html.classList.add('android-chrome-gesture-bar');
    html.style.setProperty('--android-safe-bottom', '56px');
  }
}

// Run immediately
initPlatformSafeArea();

import { StoryManager } from '../utils/main.js';

/**
 * Script loader that guarantees each src is only injected once.
 */
// simple deduped script loader
const loadScriptOnce = (() => {
  const cache = new Map();
  return (src, globalName) => {
    if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
    if (cache.has(src)) return cache.get(src);
    const p = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.crossOrigin = 'anonymous'; // helps align with preloads if any
      script.async = false; // preserve order if needed
      script.onload = () => {
        if (globalName) resolve(window[globalName]);
        else resolve();
      };
      script.onerror = () => reject(new Error(`Failed to load script ${src}`));
      document.head.appendChild(script);
    });
    cache.set(src, p);
    return p;
  };
})();

function loadCssOnce(href) {
  if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

const DECK_GL_VER = '9.1.14';

async function ensureDependencies() {
  try {
    loadCssOnce('https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.css');

    const essentialPromise = Promise.all([
      loadScriptOnce('https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.js'),
      loadScriptOnce('https://cdn.jsdelivr.net/gh/jessefriend/windgl-maplibre@v0.1.3/dist/windgl.umd.js'),
      loadScriptOnce('https://unpkg.com/pmtiles@4.3.0/dist/pmtiles.js'),
      loadScriptOnce('https://unpkg.com/scrollama')
    ]);

    await essentialPromise;
    
  } catch (err) {
    throw err;
  }
}

// Load deck.gl only when AnimatedPaths is needed
async function ensureDeckGL() {
  if (window.deck) {
    return Promise.resolve();
  }

  return Promise.all([
    loadScriptOnce(`https://unpkg.com/deck.gl@${DECK_GL_VER}/dist.min.js`, 'deck'),
    loadScriptOnce(`https://unpkg.com/@deck.gl/geo-layers@${DECK_GL_VER}/dist.min.js`),
    loadScriptOnce(`https://unpkg.com/@deck.gl/extensions@${DECK_GL_VER}/dist.min.js`),
    loadScriptOnce(`https://unpkg.com/@deck.gl/mapbox@${DECK_GL_VER}/dist.min.js`)
  ]);
}

// Export for use in LayerManager
window.ensureDeckGL = ensureDeckGL;

class BackgroundCleanupManager {
  constructor() {
    this.managers = [];
    this.isBackgrounded = false;
    this.setupBackgroundHandlers();
  }

  registerManager(manager) {
    if (!this.managers.includes(manager)) {
      this.managers.push(manager);
    }
  }

  setupBackgroundHandlers() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.handleBackground();
      } else {
        this.handleForeground();
      }
    });

    window.addEventListener('pagehide', () => {
      this.handleBackground();
    });
  }

  handleBackground() {
    if (this.isBackgrounded) return;
    this.isBackgrounded = true;

    this.managers.forEach((manager) => {
      if (!manager?.mapManager) return;
      manager.mapManager.maps.forEach((scrollyMap) => {
        if (scrollyMap?.map) {
          try {
            scrollyMap.map.stop();
          } catch (error) {
            // Silent error handling
          }
        }
      });
    });
  }

  handleForeground() {
    if (!this.isBackgrounded) return;
    this.isBackgrounded = false;

    this.managers.forEach((manager) => {
      if (!manager?.mapManager) return;
      manager.mapManager.maps.forEach((scrollyMap) => {
        if (scrollyMap?.map) {
          try {
            const map = scrollyMap.map;
            const canvas = map.getCanvas();
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

            if (!gl || gl.isContextLost()) {
              setTimeout(() => location.reload(), 100);
              return;
            }

            map.triggerRepaint();
          } catch (error) {
            // Silent error handling
          }
        }
      });
    });
  }
}

window.__scrollymap_background_cleanup = new BackgroundCleanupManager();

/**
 * Global coordination system to ensure preloader waits for ALL maps across ALL stories
 */
class GlobalMapTracker {
  constructor() {
    if (window.__scrollymap_global_tracker) {
      return window.__scrollymap_global_tracker;
    }

    this.allMaps = new Set(); // Track all ScrollyMap instances
    this.completionCallbacks = [];
    this.allComplete = false;
    this.pendingStories = new Set(); // Track which stories are waiting
    this.progressCallbacks = new Map(); // Track progress callbacks per story

    window.__scrollymap_global_tracker = this;
    return this;
  }

  registerMap(scrollyMap, storyId, mapId) {
    const mapKey = `${storyId}-${mapId}`;
    
    this.allMaps.add({
      map: scrollyMap,
      key: mapKey,
      ready: false,
      progress: 0
    });

    scrollyMap.onReady(() => {
      this.markMapReady(mapKey);
    });
  }

  updateMapProgress(mapKey, progress) {
    for (const mapInfo of this.allMaps) {
      if (mapInfo.key === mapKey) {
        mapInfo.progress = progress;
        break;
      }
    }
    
    const totalMaps = this.allMaps.size;
    const totalProgress = Array.from(this.allMaps).reduce((sum, mapInfo) => sum + mapInfo.progress, 0);
    const avgProgress = totalMaps > 0 ? totalProgress / totalMaps : 0;
    
    if (avgProgress >= 20) {
      for (const [storyId, callback] of this.progressCallbacks) {
        const progressFactor = avgProgress / 100;
        const exponentialProgress = Math.pow(progressFactor, 0.7);
        const overallProgress = 60 + (exponentialProgress * 35);
        callback(overallProgress);
      }
    }
  }

  markMapReady(mapKey) {
    for (const mapInfo of this.allMaps) {
      if (mapInfo.key === mapKey) {
        mapInfo.ready = true;
        mapInfo.progress = 100;
        break;
      }
    }

    const readyMaps = Array.from(this.allMaps).filter(mapInfo => mapInfo.ready);
    const totalMaps = this.allMaps.size;

    this.updateMapProgress(mapKey, 100);

    // Check which story this map belongs to
    const storyId = mapKey.split('-')[0];
    
    // Check if all maps for THIS story are ready
    const storyMaps = Array.from(this.allMaps).filter(mapInfo => 
      mapInfo.key.startsWith(`${storyId}-`)
    );
    const allStoryMapsReady = storyMaps.every(mapInfo => mapInfo.ready);
    
    if (allStoryMapsReady) {
      // Fire only callbacks for THIS story
      this.completionCallbacks = this.completionCallbacks.filter(item => {
        if (item.storyId === storyId) {
          item.callback();
          return false; // Remove from array
        }
        return true; // Keep in array
      });
    }

    // Check if ALL maps globally are ready
    const allReady = readyMaps.length === totalMaps && totalMaps > 0;
    if (allReady && !this.allComplete) {
      this.allComplete = true;
      // Any remaining callbacks (shouldn't be any)
      this.completionCallbacks.forEach(item => item.callback());
      this.completionCallbacks = [];
    }
  }

  onAllMapsReady(callback, storyId) {
    if (this.pendingStories.has(storyId)) {
      return;
    }
    this.pendingStories.add(storyId);

    // Check if THIS story's maps are ready
    const storyMaps = Array.from(this.allMaps).filter(mapInfo => 
      mapInfo.key.startsWith(`${storyId}-`)
    );
    const allStoryMapsReady = storyMaps.length > 0 && 
      storyMaps.every(mapInfo => mapInfo.ready);

    if (allStoryMapsReady) {
      setTimeout(() => callback(), 0);
    } else {
      this.completionCallbacks.push({ 
        callback, 
        storyId 
      });
    }
  }

  onMapProgress(callback, storyId) {
    this.progressCallbacks.set(storyId, callback);
  }

  reset() {
    this.allMaps.clear();
    this.completionCallbacks = [];
    this.progressCallbacks.clear();
    this.allComplete = false;
    this.pendingStories.clear();
  }
}

/**
 * Singleton preloader / progress aggregator.
 */
class Preloader {
  constructor() {
    if (window.__scrollymap_preloader) {
      return window.__scrollymap_preloader;
    }

    this.el = document.getElementById('preloader');
    if (!this.el) {
      this.el = this._createPreloaderMarkup();
      document.body.appendChild(this.el);
    }
    this.progressBar = this.el.querySelector('.progress-bar');
    this.storyProgress = {};
    this._fakeProgress = 5;
    this._interval = null;
    this._completionResolvers = [];
    this._isFinalized = false;

    this._startFakeProgress();

    window.__scrollymap_preloader = this;
    return this;
  }

  _createPreloaderMarkup() {
    const wrapper = document.createElement('div');
    wrapper.id = 'preloader';
    wrapper.setAttribute('aria-label', 'Loading');
    wrapper.innerHTML = `
      <div class="loader-content">
        <div class="spinner" aria-hidden="true"></div>
        <p class="loading-text">Loading...</p>
        <div class="progress-container">
          <div class="progress-bar" style="width: 0%"></div>
        </div>
      </div>
    `;
    return wrapper;
  }

  _startFakeProgress() {
    if (this._interval) return;
    this._interval = setInterval(() => {
      const agg = this._getAggregate();
      // More responsive fake progress that moves until story initialization starts
      if (agg < 20) {
        // Start fast, then slow down as we get closer to real progress
        const increment = agg < 5 ? 0.3 : agg < 10 ? 0.2 : 0.1;
        this._fakeProgress = Math.min(20, this._fakeProgress + increment);
        this.update(Math.max(agg, this._fakeProgress));
      }
    }, 200); // Faster updates for smoother animation
  }

  addStory(id) {
      // Don't allow new stories after finalization starts
      if (this._isFinalized) {
        const noop = () => {};
        noop._lastProgress = 100;
        return noop;
      }

      if (!(id in this.storyProgress)) {
        this.storyProgress[id] = 0;
      }
      const updater = (p) => {
        if (this._isFinalized) return; // Ignore updates after finalization
        
        const newProgress = Math.min(100, Math.max(0, p));
        if (newProgress >= this.storyProgress[id]) {
          this.storyProgress[id] = newProgress;
          updater._lastProgress = newProgress;
          this.update(this._getAggregate());
        }
      };
      updater._lastProgress = 0;
      return updater;
    }

  completeStory(id) {
    if (this._isFinalized) return;
    
    this.storyProgress[id] = 100;
    this.update(this._getAggregate());
    if (this._allDone()) {
      this._finalize();
    }
  }

  _getAggregate() {
    const vals = Object.values(this.storyProgress);
    if (vals.length === 0) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  update(percent) {
    if (this._isFinalized) return; // Lock updates after finalization
    
    if (this.progressBar) {
      this.progressBar.style.width = `${percent}%`;
    }
  }

  _allDone() {
    return Object.values(this.storyProgress).every((v) => v >= 100);
  }

  _finalize() {
    if (this._isFinalized) return; // Prevent multiple finalization calls
    this._isFinalized = true; // SET FLAG IMMEDIATELY
    
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this.update(100);
    setTimeout(() => {
      this.remove();
    }, 300);
    this._completionResolvers.forEach((r) => r());
    this._completionResolvers = [];
  }

  onAllComplete() {
    if (this._allDone()) return Promise.resolve();
    return new Promise((res) => {
      this._completionResolvers.push(res);
    });
  }

  remove() {
    if (!this.el) return;
    this.el.classList.add('fade-out');
    this.el.addEventListener(
      'transitionend',
      () => {
        this.el?.remove();
      },
      { once: true }
    );
  }
}

/**
 * Parse ordered scrollId assignments from inline scripts.
 * Returns array of { scrollId, scriptEl }.
 */
function extractScrollAssignments() {
  const scripts = Array.from(document.querySelectorAll('script'));
  const re = /window\.scrollId\s*=\s*(['"]?)([0-9A-Za-z_-]+)\1\s*;?/g;
  const results = [];
  scripts.forEach((s) => {
    if (!s.textContent) return;
    let match;
    while ((match = re.exec(s.textContent)) !== null) {
      results.push({ scrollId: match[2], scriptEl: s });
    }
  });
  return results;
}

/**
 * Where each story's JSON config is loaded from.
 * Set window.scrollConfigUrl before this script runs to change it.
 * "{scrollId}" in the template is replaced with the story's id.
 */
const DEFAULT_CONFIG_URL = 'config/{scrollId}.json';

function configUrlFor(scrollId) {
  const template = window.scrollConfigUrl || DEFAULT_CONFIG_URL;
  return template.replace('{scrollId}', encodeURIComponent(scrollId));
}

// Global tracking of initialized scrollIds to prevent duplicates across multiple script runs
if (!window.__scrollymap_initialized_ids) {
  window.__scrollymap_initialized_ids = new Set();
}
const initializedScrollIds = window.__scrollymap_initialized_ids;

function ensureContainerForScrollId(scrollId, scriptEl) {
  const containerId = `story-container-${scrollId}`;
  let container = document.getElementById(containerId);
  if (container) return container;

  container = document.createElement('div');
  container.classList.add('story-container'); // keeps existing CSS targeting flexible
  container.id = containerId;
  container.dataset.scrollid = scrollId;

  if (scriptEl && scriptEl.parentNode) {
    scriptEl.insertAdjacentElement('afterend', container);
  } else {
    document.body.appendChild(container);
  }
  return container;
}

async function initStoryForId(scrollId, scriptEl, preloader) {
  if (initializedScrollIds.has(scrollId)) return null;
  initializedScrollIds.add(scrollId);
  
  const container = ensureContainerForScrollId(scrollId, scriptEl);
  const containerId = container.id;

  const perStoryUpdater = preloader.addStory(scrollId);
  perStoryUpdater(5);

  try {
    const globalTracker = new GlobalMapTracker();
    perStoryUpdater(10);

    globalTracker.onMapProgress((progress) => {
      const currentProgress = perStoryUpdater._lastProgress || 0;
      if (progress > currentProgress) {
        perStoryUpdater(progress);
      }
    }, scrollId);

    const manager = await StoryManager.initialize(
      containerId,
      configUrlFor(scrollId),
      (progress) => {
        const scaledProgress = 15 + (progress * 0.45);
        const currentProgress = perStoryUpdater._lastProgress || 0;
        if (scaledProgress > currentProgress) {
          perStoryUpdater(scaledProgress);
        }
      }
    );

    window.__scrollymap_background_cleanup?.registerManager(manager);

    globalTracker.onAllMapsReady(() => {
      perStoryUpdater(95);
      setTimeout(() => {
        preloader.completeStory(scrollId);
      }, 100);
    }, scrollId);

    return manager;
  } catch (err) {
    console.error(`Failed to initialize story for scrollId=${scrollId}:`, err);
    preloader.completeStory(scrollId);
    return null;
  }
}

async function initAllStories() {
  const assignments = extractScrollAssignments();
  if (assignments.length === 0) {
    return;
  }

  const seen = new Set();
  const unique = [];
  assignments.forEach(({ scrollId, scriptEl }) => {
    if (!seen.has(scrollId)) {
      seen.add(scrollId);
      unique.push({ scrollId, scriptEl });
    }
  });

  const preloader = new Preloader();
  preloader.update(5);

  await ensureDependencies();
  preloader.update(25);

  const managers = [];
    
  for (const { scrollId, scriptEl } of unique) {
    const manager = await initStoryForId(scrollId, scriptEl, preloader);
    managers.push(manager);
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  await preloader.onAllComplete();
}

window.bootstrapScrollId = async (scrollId) => {
  const assignments = extractScrollAssignments();
  const match = assignments.find((a) => a.scrollId === String(scrollId));
  const preloader = new Preloader();
  if (match) {
    await ensureDependencies();
    await initStoryForId(match.scrollId, match.scriptEl, preloader);
    await preloader.onAllComplete();
  } else {
    await ensureDependencies();
    await initStoryForId(String(scrollId), null, preloader);
    await preloader.onAllComplete();
  }
};

function checkWebGLSupport() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return !!gl;
  } catch (e) {
    return false;
  }
}

if (!checkWebGLSupport()) {
  console.error('WebGL not supported');
  
  // Create user-friendly error message
  const errorContainer = document.createElement('div');
  errorContainer.className = 'webgl-error-message';
  errorContainer.innerHTML = `
    <div class="webgl-error-content">
      <h2>WebGL Required</h2>
      <p>This interactive story requires WebGL support, which is not available in your current browser.</p>
      <p>To view this content, please:</p>
      <ul>
        <li>Update your browser to the latest version</li>
        <li>Enable hardware acceleration in your browser settings</li>
        <li>Try a different browser (Chrome, Firefox, Safari, or Edge)</li>
      </ul>
    </div>
  `;
  
  // Insert error message at the top of the body
  if (document.body) {
    document.body.insertBefore(errorContainer, document.body.firstChild);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.insertBefore(errorContainer, document.body.firstChild);
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAllStories);
} else {
  initAllStories();
}
