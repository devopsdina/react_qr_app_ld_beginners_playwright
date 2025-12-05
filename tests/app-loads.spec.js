const { blockLaunchDarkly, connectedLaunchDarkly, expect } = require('./fixtures');

/**
 * Shared tests that run against BOTH scenarios:
 * - LaunchDarkly blocked (unreachable)
 * - LaunchDarkly connected (working)
 * 
 * This ensures the app works regardless of LaunchDarkly availability.
 */

const scenarios = [
  { testFn: blockLaunchDarkly, name: 'LD blocked' },
  { testFn: connectedLaunchDarkly, name: 'LD connected' },
];

// Run the same test for each scenario
for (const { testFn, name } of scenarios) {
  testFn(`app returns 200 (${name})`, async ({ page }) => {
    const response = await page.goto('/');
    expect(response.status()).toBe(200);
  });
}

