/**
 * Script to export LaunchDarkly flag configurations to a local cache file.
 * This file can be used by the FileFeatureStore when the SDK can't connect to LaunchDarkly.
 * 
 * The output format matches the native SDK feature store format, allowing full
 * flag evaluation (including targeting rules, segments, etc.) from the cache.
 * 
 * Required environment variables in .env:
 *   LD_API_KEY      - LaunchDarkly API access token (not SDK key)
 *   LD_PROJECT_KEY  - Your LaunchDarkly project key
 *   LD_ENVIRONMENT  - Environment key (e.g., "production", "test")
 * 
 * Usage: npm run export-flags
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.LD_API_KEY;
const PROJECT_KEY = process.env.LD_PROJECT_KEY;
const ENVIRONMENT = process.env.LD_ENVIRONMENT || 'production';
const OUTPUT_FILE = path.join(__dirname, '..', 'flag-cache.json');

async function exportFlags() {
  if (!API_KEY || !PROJECT_KEY) {
    console.error('❌ Missing required environment variables:');
    console.error('   LD_API_KEY      - Your LaunchDarkly API access token');
    console.error('   LD_PROJECT_KEY  - Your LaunchDarkly project key');
    console.error('');
    console.error('   Add these to your .env file');
    process.exit(1);
  }

  console.log(`📥 Fetching flags for project "${PROJECT_KEY}", environment "${ENVIRONMENT}"...`);

  try {
    // Fetch all flags
    const flagsResponse = await fetch(
      `https://app.launchdarkly.com/api/v2/flags/${PROJECT_KEY}?env=${ENVIRONMENT}`,
      {
        headers: {
          'Authorization': API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!flagsResponse.ok) {
      const error = await flagsResponse.text();
      throw new Error(`Flags API request failed (${flagsResponse.status}): ${error}`);
    }

    const flagsData = await flagsResponse.json();
    
    // Fetch all segments
    console.log('📥 Fetching segments...');
    const segmentsResponse = await fetch(
      `https://app.launchdarkly.com/api/v2/segments/${PROJECT_KEY}/${ENVIRONMENT}`,
      {
        headers: {
          'Authorization': API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    let segmentsData = { items: [] };
    if (segmentsResponse.ok) {
      segmentsData = await segmentsResponse.json();
    } else {
      console.warn('⚠️  Could not fetch segments (continuing without them)');
    }
    
    // Transform to native SDK format
    const cacheData = transformToNativeSDKFormat(flagsData.items, segmentsData.items, ENVIRONMENT);
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cacheData, null, 2));
    
    const flagCount = Object.keys(cacheData.data.features).length;
    const segmentCount = Object.keys(cacheData.data.segments).length;
    
    console.log(`✅ Exported to ${OUTPUT_FILE}`);
    console.log(`   ${flagCount} flags`);
    console.log(`   ${segmentCount} segments`);
    console.log('');
    console.log('   This file will be used by the SDK when streaming is unavailable.');
    console.log('   Full targeting rules and segments are preserved for evaluation.');
    
  } catch (error) {
    console.error('❌ Failed to export flags:', error.message);
    process.exit(1);
  }
}

/**
 * Transform LaunchDarkly API response to native SDK feature store format.
 * 
 * The SDK's FileFeatureStore expects this format:
 * {
 *   "version": 1,
 *   "initialized": true,
 *   "data": {
 *     "features": { ... },
 *     "segments": { ... }
 *   }
 * }
 */
function transformToNativeSDKFormat(flags, segments, environment) {
  const features = {};
  const segmentsData = {};

  // Transform flags
  for (const flag of flags) {
    const envConfig = flag.environments[environment];
    if (!envConfig) {
      console.warn(`   ⚠️  Flag "${flag.key}" has no config for environment "${environment}", skipping`);
      continue;
    }

    // Build the flag in native SDK format
    features[flag.key] = {
      key: flag.key,
      version: envConfig.version || 1,
      on: envConfig.on,
      prerequisites: envConfig.prerequisites || [],
      targets: envConfig.targets || [],
      contextTargets: envConfig.contextTargets || [],
      rules: envConfig.rules || [],
      fallthrough: envConfig.fallthrough || { variation: 0 },
      offVariation: envConfig.offVariation !== undefined ? envConfig.offVariation : (flag.variations.length > 1 ? flag.variations.length - 1 : 0),
      variations: flag.variations.map(v => v.value),
      salt: envConfig.salt || flag.key,
      trackEvents: envConfig.trackEvents || false,
      trackEventsFallthrough: envConfig.trackEventsFallthrough || false,
      debugEventsUntilDate: envConfig.debugEventsUntilDate || null,
      clientSideAvailability: flag.clientSideAvailability || { usingEnvironmentId: false, usingMobileKey: false }
    };
  }

  // Transform segments
  for (const segment of segments) {
    segmentsData[segment.key] = {
      key: segment.key,
      version: segment.version || 1,
      included: segment.included || [],
      excluded: segment.excluded || [],
      includedContexts: segment.includedContexts || [],
      excludedContexts: segment.excludedContexts || [],
      rules: segment.rules || [],
      salt: segment.salt || segment.key,
      unbounded: segment.unbounded || false,
      unboundedContextKind: segment.unboundedContextKind || null,
      generation: segment.generation || null
    };
  }

  return {
    version: 1,
    initialized: true,
    initMetadata: {},
    data: {
      features: features,
      segments: segmentsData
    },
    _metadata: {
      projectKey: PROJECT_KEY,
      environment: ENVIRONMENT,
      exportedAt: new Date().toISOString(),
      flagCount: Object.keys(features).length,
      segmentCount: Object.keys(segmentsData).length,
      source: 'export-flags-script'
    }
  };
}

exportFlags();

