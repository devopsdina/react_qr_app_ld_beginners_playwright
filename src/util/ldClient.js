/**
 * LaunchDarkly SDK client with file-based caching via FileFeatureStore.
 * 
 * This implementation:
 * 1. Loads cached flag data from flag-cache.json on startup (instant availability)
 * 2. Connects to LaunchDarkly streaming for live updates
 * 3. Automatically persists streaming updates to the cache file
 * 4. Continues to evaluate flags from cache even if streaming fails
 * 
 * Required environment variables:
 *   LD_SDK_KEY - LaunchDarkly SDK key for your environment
 * 
 * Usage:
 *   const { initializeLDClient, getClient } = require('./util/ldClient');
 *   await initializeLDClient();
 *   const client = await getClient();
 *   const flagValue = await client.variation('my-flag', context, defaultValue);
 */

const ld = require('@launchdarkly/node-server-sdk');
const fs = require('fs');
const path = require('path');
const { FileFeatureStore } = require('./FileFeatureStore');

// Path to the flag cache file
const FLAG_CACHE_FILE = path.join(__dirname, '../../flag-cache.json');

// Timeout for waiting on SDK initialization (seconds)
const INIT_TIMEOUT = 5;

let ldClient = null;
let featureStore = null;
let initializationPromise = null;
let cacheLoadedFromFile = false;

/**
 * Initialize the LaunchDarkly client with file-based caching.
 * Safe to call multiple times - will return existing client if already initialized.
 * 
 * @returns {Promise<LDClient>} The initialized LaunchDarkly client
 */
async function initializeLDClient() {
  // Return existing client if already initialized
  if (ldClient) {
    return ldClient;
  }

  // Return existing initialization promise if in progress
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = doInitialize();
  return initializationPromise;
}

/**
 * Perform the actual initialization
 * @private
 */
async function doInitialize() {
  const sdkKey = process.env.LD_SDK_KEY;
  
  if (!sdkKey) {
    throw new Error('LD_SDK_KEY environment variable is required');
  }

  // Create the FileFeatureStore
  featureStore = new FileFeatureStore({
    path: FLAG_CACHE_FILE,
    readOnly: false  // Allow SDK to persist updates
  });

  // Try to load existing cache
  const hasCacheFile = fs.existsSync(FLAG_CACHE_FILE);
  
  if (hasCacheFile) {
    console.log('📁 Found flag cache file:', FLAG_CACHE_FILE);
    try {
      await featureStore.loadFromFile();
      cacheLoadedFromFile = true;
      console.log('✅ Flag cache loaded - flags available immediately');
    } catch (err) {
      console.warn('⚠️  Could not load cache file:', err.message);
      console.warn('   Will create new cache when streaming connects');
    }
  } else {
    console.log('📁 No cache file found at', FLAG_CACHE_FILE);
    console.log('   Run "npm run export-flags" to create one, or');
    console.log('   cache will be created when streaming connects');
  }

  // Initialize the SDK with our custom feature store
  console.log('🔄 Initializing LaunchDarkly SDK...');
  
  ldClient = ld.init(sdkKey, {
    featureStore: featureStore
  });

  // Set up event listeners
  ldClient.on('ready', () => {
    console.log('✅ LaunchDarkly SDK is ready');
  });

  ldClient.on('update', (update) => {
    console.log('🔄 Flag update received:', update.key);
  });

  ldClient.on('error', (err) => {
    console.error('❌ LaunchDarkly SDK error:', err.message);
  });

  // Set up graceful shutdown handlers
  const shutdownHandler = async (signal) => {
    console.log(`\n🔌 Received ${signal}, shutting down LaunchDarkly client...`);
    await close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdownHandler('SIGINT'));
  process.on('SIGTERM', () => shutdownHandler('SIGTERM'));

  // Wait for initialization (streaming connection)
  try {
    await ldClient.waitForInitialization({ timeout: INIT_TIMEOUT });
    console.log('✅ Connected to LaunchDarkly streaming');
    console.log('📁 Flag cache will be updated automatically');
  } catch (err) {
    if (cacheLoadedFromFile) {
      console.warn('⚠️  Could not connect to LaunchDarkly streaming:', err.message);
      console.warn('   Using cached flag values (full evaluation supported)');
    } else {
      console.error('❌ Could not connect to LaunchDarkly and no cache available');
      console.error('   Run "npm run export-flags" to create a cache file');
      throw new Error(`LaunchDarkly initialization failed: ${err.message}`);
    }
  }

  return ldClient;
}

/**
 * Get the LaunchDarkly client instance.
 * Throws if client has not been initialized via initializeLDClient().
 * 
 * @returns {LDClient}
 */
function getLDClient() {
  if (!ldClient) {
    throw new Error('LaunchDarkly client not initialized. Call initializeLDClient() first.');
    // Alternatively, auto-initialize:
    // return initializeLDClient();
  }
  return ldClient;
}

/**
 * Set the LaunchDarkly client instance (for testing or custom initialization).
 * 
 * @param {LDClient} client
 */
function setLDClient(client) {
  ldClient = client;
}

/**
 * Get the LaunchDarkly client instance, initializing if needed.
 * 
 * @returns {Promise<LDClient>}
 */
async function getClient() {
  if (!ldClient) {
    await initializeLDClient();
  }
  return ldClient;
}

/**
 * Check if flags were loaded from cache file.
 * 
 * @returns {boolean}
 */
function wasCacheLoadedFromFile() {
  return cacheLoadedFromFile;
}

/**
 * Check if the SDK is connected to LaunchDarkly streaming.
 * 
 * @returns {boolean}
 */
function isConnectedToStreaming() {
  return ldClient?.initialized() ?? false;
}

/**
 * Get status information about the current LD client.
 * 
 * @returns {Object}
 */
function getStatus() {
  return {
    initialized: ldClient !== null,
    connectedToStreaming: ldClient?.initialized() ?? false,
    cacheLoadedFromFile: cacheLoadedFromFile,
    cacheFileExists: fs.existsSync(FLAG_CACHE_FILE),
    cacheFilePath: FLAG_CACHE_FILE
  };
}

/**
 * Gracefully close the LaunchDarkly client.
 * Flushes pending events before closing.
 */
async function close() {
  if (ldClient) {
    console.log('🔌 Closing LaunchDarkly client...');
    try {
      await ldClient.flush();
    } catch (e) {
      console.warn('⚠️  Error flushing events:', e.message);
    }
    await ldClient.close();
    ldClient = null;
    featureStore = null;
    initializationPromise = null;
    cacheLoadedFromFile = false;
    console.log('✅ LaunchDarkly client closed');
  }
}

module.exports = {
  initializeLDClient,
  getLDClient,
  setLDClient,
  getClient,
  wasCacheLoadedFromFile,
  isConnectedToStreaming,
  getStatus,
  close,
  FLAG_CACHE_FILE
};

