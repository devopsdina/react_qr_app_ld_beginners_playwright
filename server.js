require('dotenv').config();
const express = require("express");
const path = require("path");
const fs = require("fs");

const PORT = process.env.PORT || 3030;
const app = express();

// LaunchDarkly client module (lazy-loaded)
let ldClientModule;

// Define middleware here
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve up static assets (usually on heroku)
if (process.env.NODE_ENV === "production") {
  app.use(express.static("build"));
}

// ═══════════════════════════════════════════════════════════════
// API ROUTES - Define before the catch-all
// ═══════════════════════════════════════════════════════════════

/**
 * Bootstrap endpoint - returns cached flags for client-side SDK initialization
 * 
 * GET /api/bootstrap
 * GET /api/bootstrap?userKey=user-123&email=user@example.com
 * 
 * Response: { bootstrap: {...}, status: {...} }
 */
app.get("/api/bootstrap", async (req, res) => {
  try {
    // Lazy-load the LD client module
    if (!ldClientModule) {
      ldClientModule = require('./src/util/ldClient');
    }

    const { getClient, getStatus, FLAG_CACHE_FILE } = ldClientModule;
    
    // Build context from query params (or use defaults)
    const context = {
      kind: 'user',
      key: req.query.userKey || 'anonymous-user',
      anonymous: !req.query.userKey,
      email: req.query.email || undefined,
      name: req.query.name || undefined
    };

    // Remove undefined values
    Object.keys(context).forEach(key => 
      context[key] === undefined && delete context[key]
    );

    const status = getStatus();
    
    // If we have a client, use allFlagsState for proper evaluation
    if (status.initialized) {
      const client = await getClient();
      const flagsState = await client.allFlagsState(context, {
        clientSideOnly: true,  // Only return flags marked for client-side
        withReasons: false,
        detailsOnlyForTrackedFlags: true
      });

      return res.json({
        bootstrap: flagsState.toJSON(),
        context: context,
        status: {
          valid: flagsState.valid,
          connectedToStreaming: status.connectedToStreaming,
          cacheLoadedFromFile: status.cacheLoadedFromFile,
          source: status.connectedToStreaming ? 'streaming' : 'cache'
        }
      });
    }
    
    // Fallback: Read raw cache file if client not initialized
    if (fs.existsSync(FLAG_CACHE_FILE)) {
      const cacheData = JSON.parse(fs.readFileSync(FLAG_CACHE_FILE, 'utf8'));
      
      return res.json({
        bootstrap: null,
        rawCache: cacheData,
        context: context,
        status: {
          valid: false,
          connectedToStreaming: false,
          cacheLoadedFromFile: false,
          source: 'raw-file',
          note: 'Client not initialized - showing raw cache file'
        }
      });
    }

    // No cache available
    return res.status(503).json({
      error: 'No flag data available',
      status: {
        valid: false,
        connectedToStreaming: false,
        cacheLoadedFromFile: false,
        cacheFileExists: false
      },
      hint: 'Run "npm run export-flags" to create flag-cache.json'
    });

  } catch (err) {
    console.error('Bootstrap endpoint error:', err);
    res.status(500).json({ 
      error: err.message,
      hint: 'Check server logs for details'
    });
  }
});

/**
 * Status endpoint - returns LD client status
 * 
 * GET /api/ld-status
 */
app.get("/api/ld-status", async (req, res) => {
  try {
    if (!ldClientModule) {
      ldClientModule = require('./src/util/ldClient');
    }
    
    const status = ldClientModule.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Raw cache file endpoint - returns the raw flag-cache.json contents
 * 
 * GET /api/flag-cache
 */
app.get("/api/flag-cache", (req, res) => {
  const cacheFile = path.join(__dirname, 'flag-cache.json');
  
  if (!fs.existsSync(cacheFile)) {
    return res.status(404).json({ 
      error: 'flag-cache.json not found',
      hint: 'Run "npm run export-flags" to create it'
    });
  }

  try {
    const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: `Failed to read cache: ${err.message}` });
  }
});

// ═══════════════════════════════════════════════════════════════
// CATCH-ALL - Send everything else to React app
// ═══════════════════════════════════════════════════════════════

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "./build/index.html"));
});

// ═══════════════════════════════════════════════════════════════
// SERVER STARTUP
// ═══════════════════════════════════════════════════════════════

async function startServer() {
  // Initialize LaunchDarkly client
  try {
    ldClientModule = require('./src/util/ldClient');
    await ldClientModule.initializeLDClient();
    console.log('✅ LaunchDarkly client ready');
  } catch (err) {
    console.warn('⚠️  LaunchDarkly initialization:', err.message);
    console.warn('   Server will start, but LD features may be limited');
  }

  app.listen(PORT, () => {
    console.log(`🌎 ==> API server now on port ${PORT}!`);
    console.log(`📡 Bootstrap endpoint: http://localhost:${PORT}/api/bootstrap`);
    console.log(`📊 Status endpoint:    http://localhost:${PORT}/api/ld-status`);
    console.log(`📁 Cache endpoint:     http://localhost:${PORT}/api/flag-cache`);
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔌 Shutting down gracefully...');
  if (ldClientModule) {
    await ldClientModule.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔌 Received SIGTERM, shutting down...');
  if (ldClientModule) {
    await ldClientModule.close();
  }
  process.exit(0);
});

startServer();
