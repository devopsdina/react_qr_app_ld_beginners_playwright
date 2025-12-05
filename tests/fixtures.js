const { test: base } = require('@playwright/test');

/**
 * Test fixture that BLOCKS LaunchDarkly connections.
 * Use this for testing fallback/default behavior when LD is unreachable.
 * 
 * Usage:
 *   const { blockedTest, expect } = require('../fixtures');
 *   blockedTest('my test', async ({ page }) => { ... });
 */
const blockLaunchDarkly = base.extend({
  page: async ({ page }, use) => {
    // Block all requests to LaunchDarkly before the test runs
    await page.route('**/*launchdarkly.com/**', route => route.abort());
    await use(page);
  },
});

/**
 * Regular test fixture - LaunchDarkly works normally.
 * Use this for testing feature flag behavior when LD is connected.
 * 
 * Usage:
 *   const { connectedTest, expect } = require('../fixtures');
 *   connectedTest('my test', async ({ page }) => { ... });
 */
const connectedLaunchDarkly = base;

module.exports = {
  blockLaunchDarkly,
  connectedLaunchDarkly,
  expect: base.expect,
};

