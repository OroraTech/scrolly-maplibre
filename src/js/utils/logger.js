/**
 * Centralized logging utility
 * Set LOG_LEVEL in environment or at runtime
 */

// Log levels
export const LogLevel = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4
};

// Default log level - change this for production vs development
const DEFAULT_LOG_LEVEL = LogLevel.ERROR; // Production: only errors
// const DEFAULT_LOG_LEVEL = LogLevel.DEBUG; // Development: everything

// Allow runtime override via window object
let currentLogLevel = DEFAULT_LOG_LEVEL;

if (typeof window !== 'undefined') {
  // Allow setting via window.LOG_LEVEL for runtime debugging
  window.setLogLevel = (level) => {
    currentLogLevel = level;
  };
  
  // Read from window if set
  if (window.LOG_LEVEL !== undefined) {
    currentLogLevel = window.LOG_LEVEL;
  }
}

/**
 * Logger class for module-specific logging
 */
export class Logger {
  constructor(moduleName) {
    this.moduleName = moduleName;
  }

  debug(...args) {
    if (currentLogLevel >= LogLevel.DEBUG) {
      console.debug(`[${this.moduleName}]`, ...args);
    }
  }

  info(...args) {
    if (currentLogLevel >= LogLevel.INFO) {
      console.log(`[${this.moduleName}]`, ...args);
    }
  }

  warn(...args) {
    if (currentLogLevel >= LogLevel.WARN) {
      console.warn(`[${this.moduleName}]`, ...args);
    }
  }

  error(...args) {
    if (currentLogLevel >= LogLevel.ERROR) {
      console.error(`[${this.moduleName}]`, ...args);
    }
  }
}

// Export a default logger for quick use
export const logger = new Logger('App');