/**
 * Test script to validate the LaunchDarkly client with FileFeatureStore caching.
 * 
 * This script tests:
 * 1. Loading flags from the cache file (flag-cache.json)
 * 2. Connecting to LaunchDarkly streaming
 * 3. Evaluating flags against a test context
 * 4. Verifying cache is updated when streaming connects
 * 
 * Usage: npm run test-ld
 */

require('dotenv').config();
const fs = require('fs');
const { 
  initializeLDClient, 
  getClient, 
  wasCacheLoadedFromFile, 
  isConnectedToStreaming,
  getStatus, 
  close,
  FLAG_CACHE_FILE 
} = require('../src/util/ldClient');

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('    LaunchDarkly FileFeatureStore Test Suite');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Test 1: Check environment
  console.log('TEST 1: Environment Check');
  console.log('─────────────────────────────────────────────────────────────────');
  
  const sdkKey = process.env.LD_SDK_KEY;
  if (!sdkKey) {
    console.log('❌ LD_SDK_KEY not set in environment');
    console.log('   Create a .env file with your SDK key');
    console.log('');
  } else {
    console.log('✅ LD_SDK_KEY is set');
    console.log(`   Key prefix: ${sdkKey.substring(0, 10)}...`);
    console.log('');
  }

  // Test 2: Check cache file
  console.log('TEST 2: Cache File Check');
  console.log('─────────────────────────────────────────────────────────────────');
  
  if (fs.existsSync(FLAG_CACHE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(FLAG_CACHE_FILE, 'utf8'));
      const flagCount = Object.keys(data.data?.features || {}).length;
      const segmentCount = Object.keys(data.data?.segments || {}).length;
      
      console.log('✅ Cache file exists:', FLAG_CACHE_FILE);
      console.log(`   Format version: ${data.version}`);
      console.log(`   Initialized: ${data.initialized}`);
      console.log(`   Flags: ${flagCount}`);
      console.log(`   Segments: ${segmentCount}`);
      
      if (data._metadata?.exportedAt) {
        console.log(`   Last updated: ${data._metadata.exportedAt}`);
        console.log(`   Source: ${data._metadata.source || 'unknown'}`);
      }
      
      // Show first few flag keys
      const flagKeys = Object.keys(data.data?.features || {});
      if (flagKeys.length > 0) {
        console.log('   Flag keys:', flagKeys.slice(0, 5).join(', '));
        if (flagKeys.length > 5) {
          console.log(`   ... and ${flagKeys.length - 5} more`);
        }
      }
    } catch (err) {
      console.log('⚠️  Cache file exists but could not be parsed:', err.message);
    }
  } else {
    console.log('⚠️  No cache file found');
    console.log('   Run "npm run export-flags" to create one');
  }
  console.log('');

  // Test 3: Initialize client
  console.log('TEST 3: Client Initialization');
  console.log('─────────────────────────────────────────────────────────────────');
  
  if (!sdkKey) {
    console.log('⏭️  Skipping - no SDK key configured');
    console.log('');
    return;
  }

  try {
    await initializeLDClient();
    console.log('');
    console.log('✅ Client initialized successfully');
    
    const status = getStatus();
    console.log(`   Cache loaded from file: ${status.cacheLoadedFromFile}`);
    console.log(`   Connected to streaming: ${status.connectedToStreaming}`);
    console.log('');
  } catch (err) {
    console.log('❌ Client initialization failed:', err.message);
    console.log('');
    return;
  }

  // Test 4: Evaluate flags
  console.log('TEST 4: Flag Evaluation');
  console.log('─────────────────────────────────────────────────────────────────');
  
  try {
    const client = await getClient();
    
    // Test context
    const testContext = {
      kind: 'user',
      key: 'test-user-123',
      email: 'test@example.com',
      name: 'Test User'
    };

    console.log('Test context:', JSON.stringify(testContext, null, 2));
    console.log('');

    // Get all flags for this context
    const allFlags = await client.allFlagsState(testContext);
    
    if (allFlags.valid) {
      const values = allFlags.allValues();
      const flagKeys = Object.keys(values);
      
      console.log(`✅ Evaluated ${flagKeys.length} flags:`);
      console.log('');
      
      // Show up to 10 flags
      flagKeys.slice(0, 10).forEach(key => {
        const value = values[key];
        const displayValue = typeof value === 'object' 
          ? JSON.stringify(value) 
          : String(value);
        console.log(`   ${key}: ${displayValue}`);
      });
      
      if (flagKeys.length > 10) {
        console.log(`   ... and ${flagKeys.length - 10} more flags`);
      }
    } else {
      console.log('⚠️  allFlagsState returned invalid state');
      console.log('   This may happen if no cache and no streaming connection');
    }
    console.log('');

  } catch (err) {
    console.log('❌ Flag evaluation failed:', err.message);
    console.log('');
  }

  // Test 5: Verify cache was updated (if streaming connected)
  console.log('TEST 5: Cache Update Check');
  console.log('─────────────────────────────────────────────────────────────────');
  
  const status = getStatus();
  
  if (status.connectedToStreaming) {
    console.log('✅ Connected to LaunchDarkly streaming');
    
    // Check if cache file was updated
    if (fs.existsSync(FLAG_CACHE_FILE)) {
      const stats = fs.statSync(FLAG_CACHE_FILE);
      const data = JSON.parse(fs.readFileSync(FLAG_CACHE_FILE, 'utf8'));
      
      console.log('📁 Cache file status:');
      console.log(`   Path: ${FLAG_CACHE_FILE}`);
      console.log(`   Last modified: ${stats.mtime.toISOString()}`);
      console.log(`   Source: ${data._metadata?.source || 'unknown'}`);
      
      if (data._metadata?.source === 'sdk-streaming') {
        console.log('✅ Cache was updated by SDK streaming');
      }
    }
  } else if (status.cacheLoadedFromFile) {
    console.log('📁 Using cached flag values (streaming not connected)');
    console.log('   Flags were evaluated from the cache file');
    console.log('   Full targeting rules are preserved');
  } else {
    console.log('⚠️  Neither streaming nor cache available');
  }
  console.log('');

  // Summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('    Test Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`   SDK Key configured:  ${sdkKey ? '✅' : '❌'}`);
  console.log(`   Cache file exists:   ${status.cacheFileExists ? '✅' : '❌'}`);
  console.log(`   Cache loaded:        ${status.cacheLoadedFromFile ? '✅' : '❌'}`);
  console.log(`   Streaming connected: ${status.connectedToStreaming ? '✅' : '❌'}`);
  console.log('');
  
  if (status.cacheLoadedFromFile && !status.connectedToStreaming) {
    console.log('📝 Note: App is running with cached flags (offline mode)');
    console.log('   All targeting rules work from the cache!');
  } else if (status.connectedToStreaming) {
    console.log('📝 Note: App is connected to LaunchDarkly streaming');
    console.log('   Cache will be kept up-to-date automatically');
  }
  console.log('');

  // Cleanup
  await close();
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

