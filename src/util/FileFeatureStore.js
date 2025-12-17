/**
 * FileFeatureStore - A custom LaunchDarkly feature store that persists flag data to a local file.
 * 
 * This implements the LDFeatureStore interface, allowing the SDK to:
 * - Read flag data from a local cache file on startup
 * - Write flag updates to the cache file as streaming delivers them
 * - Continue evaluating flags even when LaunchDarkly is unreachable
 * 
 * Based on: https://github.com/launchdarkly-labs/launchdarkly-file-cache-datastore
 * 
 * Usage:
 *   const featureStore = new FileFeatureStore({
 *     path: './flag-cache.json',
 *     readOnly: false
 *   });
 *   await featureStore.loadFromFile();
 *   const client = ld.init(sdkKey, { featureStore });
 */

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

/**
 * @typedef {Object} FileFeatureStoreOptions
 * @property {string} path - Path to the cache file
 * @property {boolean} readOnly - If true, never writes to disk; if false, persists updates
 */

/**
 * @typedef {Object} PersistedStoreFile
 * @property {number} version - File format version
 * @property {boolean} initialized - Whether the store was initialized
 * @property {Object} initMetadata - Initialization metadata
 * @property {Object} data - The flag and segment data
 */

class FileFeatureStore {
  /**
   * @param {FileFeatureStoreOptions} options
   */
  constructor(options) {
    this.options = options;
    this.warnPrefix = `[FileFeatureStore:${this.options.path}]`;
    this.dataByNamespace = new Map();
    this.isInitialized = false;
    this.initMetadata = undefined;
  }

  /**
   * Log a warning (never throws)
   * @private
   */
  warn(message, err = null) {
    if (err) {
      console.warn(this.warnPrefix, message, err);
    } else {
      console.warn(this.warnPrefix, message);
    }
  }

  /**
   * Get namespace string from DataKind
   * @private
   */
  getNamespace(kind) {
    const ns = kind?.namespace;
    return typeof ns === 'string' ? ns : String(ns ?? 'unknown');
  }

  /**
   * Ensure a namespace map exists
   * @private
   */
  ensureNamespaceMap(namespace) {
    let m = this.dataByNamespace.get(namespace);
    if (!m) {
      m = new Map();
      this.dataByNamespace.set(namespace, m);
    }
    return m;
  }

  /**
   * Deep clone a value via JSON
   * @private
   */
  static cloneJson(value) {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
  }

  /**
   * Sanitize data loaded from file or before persisting.
   * Removes internal SDK fields that don't deserialize properly from JSON.
   * @private
   */
  static sanitizeData(data) {
    if (!data || typeof data !== 'object') return data;

    // Sanitize segments - remove attributeReference from rule clauses
    if (data.segments) {
      for (const segment of Object.values(data.segments)) {
        if (segment && segment.rules && Array.isArray(segment.rules)) {
          for (const rule of segment.rules) {
            if (rule && rule.clauses && Array.isArray(rule.clauses)) {
              for (const clause of rule.clauses) {
                if (clause && clause.attributeReference) {
                  delete clause.attributeReference;
                }
              }
            }
          }
        }
      }
    }

    // Sanitize flags - remove attributeReference from rule clauses
    if (data.features) {
      for (const flag of Object.values(data.features)) {
        if (flag && flag.rules && Array.isArray(flag.rules)) {
          for (const rule of flag.rules) {
            if (rule && rule.clauses && Array.isArray(rule.clauses)) {
              for (const clause of rule.clauses) {
                if (clause && clause.attributeReference) {
                  delete clause.attributeReference;
                }
              }
            }
          }
        }
      }
    }

    return data;
  }

  /**
   * Load cache state from disk into memory.
   * Throws if file cannot be read or parsed.
   * @returns {Promise<void>}
   */
  async loadFromFile() {
    const filePath = this.options.path;
    const raw = await fsp.readFile(filePath, 'utf8');
    
    if (!raw.trim()) {
      throw new Error(`Cache file is empty: ${filePath}`);
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`Cache file did not contain a JSON object: ${filePath}`);
    }

    const data = parsed.data;
    if (!data || typeof data !== 'object') {
      throw new Error(`Cache file missing "data" object: ${filePath}`);
    }

    // Sanitize the data before loading
    const sanitizedData = FileFeatureStore.sanitizeData(data);
    
    this.replaceAllDataInMemory(sanitizedData);
    this.isInitialized = parsed.initialized === true;
    this.initMetadata = parsed.initMetadata;
    
    // Count flags for logging
    const flagCount = Object.keys(data.features || {}).length;
    console.log(`${this.warnPrefix} Loaded ${flagCount} flags from cache`);
  }

  /**
   * Replace all in-memory data
   * @private
   */
  replaceAllDataInMemory(allData) {
    this.dataByNamespace.clear();
    for (const [namespace, items] of Object.entries(allData ?? {})) {
      const m = this.ensureNamespaceMap(namespace);
      if (!items || typeof items !== 'object') continue;
      for (const [key, item] of Object.entries(items)) {
        if (!item || typeof item !== 'object') continue;
        m.set(key, FileFeatureStore.cloneJson(item));
      }
    }
  }

  /**
   * Persist current state to disk (if not read-only)
   * @private
   */
  async persistToDiskIfEnabled() {
    if (this.options.readOnly) return;

    const filePath = this.options.path;
    const dir = path.dirname(filePath);
    const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);

    const data = {};
    for (const [namespace, m] of this.dataByNamespace.entries()) {
      data[namespace] = {};
      for (const [key, item] of m.entries()) {
        // Persist tombstones too (deleted: true) for version semantics
        data[namespace][key] = FileFeatureStore.cloneJson(item);
      }
    }

    // Sanitize before persisting
    const sanitizedData = FileFeatureStore.sanitizeData(data);

    const payload = {
      version: 1,
      initialized: this.isInitialized,
      initMetadata: this.initMetadata,
      data: sanitizedData,
      _metadata: {
        updatedAt: new Date().toISOString(),
        source: 'sdk-streaming'
      }
    };

    try {
      // Ensure directory exists
      await fsp.mkdir(dir, { recursive: true }).catch(() => {});
      
      // Atomic write: write to temp file, fsync, then rename
      const fh = await fsp.open(tmpPath, 'w', 0o600);
      try {
        await fh.writeFile(JSON.stringify(payload, null, 2), { encoding: 'utf8' });
        await fh.sync();
      } finally {
        await fh.close().catch(() => {});
      }

      await fsp.rename(tmpPath, filePath);

      // Best-effort directory fsync
      try {
        const dh = await fsp.open(dir, 'r');
        try {
          await dh.sync();
        } finally {
          await dh.close().catch(() => {});
        }
      } catch (e) {
        // Directory fsync not always supported
      }
    } catch (e) {
      this.warn('Failed to persist cache file update', e);
      await fsp.unlink(tmpPath).catch(() => {});
    }
  }

  /**
   * Initialize the store with all data (called by SDK on streaming connect)
   * @param {Object} allData - All flag and segment data
   * @param {Function} callback - Callback when complete
   * @param {Object} initMetadata - Optional metadata
   */
  init(allData, callback, initMetadata) {
    try {
      const sanitizedData = FileFeatureStore.sanitizeData(allData ?? {});
      this.replaceAllDataInMemory(sanitizedData);
      this.isInitialized = true;
      this.initMetadata = initMetadata;
      
      const flagCount = Object.keys(allData?.features || {}).length;
      console.log(`${this.warnPrefix} SDK initialized store with ${flagCount} flags`);
      
      this.persistToDiskIfEnabled().finally(() => callback());
    } catch (e) {
      this.warn('init() failed', e);
      callback();
    }
  }

  /**
   * Get a single item from the store
   * @param {Object} kind - The data kind (features or segments)
   * @param {string} key - The item key
   * @param {Function} callback - Callback with result
   */
  get(kind, key, callback) {
    try {
      const namespace = this.getNamespace(kind);
      const m = this.dataByNamespace.get(namespace);
      const item = m?.get(key);
      if (!item || item.deleted) return callback(null);
      callback(FileFeatureStore.cloneJson(item));
    } catch (e) {
      this.warn(`get(${this.getNamespace(kind)}, ${key}) failed`, e);
      callback(null);
    }
  }

  /**
   * Get all items of a kind from the store
   * @param {Object} kind - The data kind
   * @param {Function} callback - Callback with results
   */
  all(kind, callback) {
    try {
      const namespace = this.getNamespace(kind);
      const m = this.dataByNamespace.get(namespace);
      const out = {};
      if (m) {
        for (const [key, item] of m.entries()) {
          if (item?.deleted) continue;
          out[key] = FileFeatureStore.cloneJson(item);
        }
      }
      callback(out);
    } catch (e) {
      this.warn(`all(${this.getNamespace(kind)}) failed`, e);
      callback({});
    }
  }

  /**
   * Delete an item (mark as tombstone)
   * @param {Object} kind - The data kind
   * @param {string} key - The item key
   * @param {number} version - The version number
   * @param {Function} callback - Callback when complete
   */
  delete(kind, key, version, callback) {
    try {
      const namespace = this.getNamespace(kind);
      const m = this.ensureNamespaceMap(namespace);
      const existing = m.get(key);
      const existingVersion = typeof existing?.version === 'number' ? existing.version : -1;
      
      // Only delete if incoming version is higher
      if (version <= existingVersion) return callback();

      m.set(key, { key, version, deleted: true });
      this.isInitialized = true;
      this.persistToDiskIfEnabled().finally(() => callback());
    } catch (e) {
      this.warn(`delete(${this.getNamespace(kind)}, ${key}) failed`, e);
      callback();
    }
  }

  /**
   * Insert or update an item
   * @param {Object} kind - The data kind
   * @param {Object} data - The item data
   * @param {Function} callback - Callback when complete
   */
  upsert(kind, data, callback) {
    try {
      const namespace = this.getNamespace(kind);
      const m = this.ensureNamespaceMap(namespace);
      const key = data?.key;
      
      if (typeof key !== 'string' || key.length === 0) {
        this.warn(`upsert(${namespace}) called with invalid key; ignoring`);
        return callback();
      }
      
      const incomingVersion = typeof data?.version === 'number' ? data.version : -1;
      if (incomingVersion < 0) {
        this.warn(`upsert(${namespace}, ${key}) called with invalid version; ignoring`);
        return callback();
      }

      const existing = m.get(key);
      const existingVersion = typeof existing?.version === 'number' ? existing.version : -1;
      
      // Only update if incoming version is higher
      if (incomingVersion <= existingVersion) return callback();

      m.set(key, FileFeatureStore.cloneJson(data));
      this.isInitialized = true;
      this.persistToDiskIfEnabled().finally(() => callback());
    } catch (e) {
      this.warn(`upsert(${this.getNamespace(kind)}) failed`, e);
      callback();
    }
  }

  /**
   * Check if the store is initialized
   * @param {Function} callback - Callback with boolean result
   */
  initialized(callback) {
    try {
      callback(this.isInitialized);
    } catch (e) {
      this.warn('initialized() failed', e);
      callback(false);
    }
  }

  /**
   * Close the store (no-op for file store)
   */
  close() {
    // No resources to release
  }

  /**
   * Get a description of this store
   * @returns {string}
   */
  getDescription() {
    return `FileFeatureStore(${this.options.path})`;
  }

  /**
   * Get initialization metadata
   * @returns {Object|undefined}
   */
  getInitMetaData() {
    return this.initMetadata;
  }
}

module.exports = { FileFeatureStore };

