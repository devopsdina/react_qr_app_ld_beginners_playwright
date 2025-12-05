const { blockLaunchDarkly, expect } = require('./fixtures');

/**
 * Test that the app renders with default flags when LaunchDarkly cannot connect
 * How it works:
 * - The blockedTest fixture automatically blocks all requests to *.launchdarkly.com
 * - The React app loads and tries to initialize LaunchDarkly SDK
 * - The SDK attempts to connect but requests are aborted by Playwright
 * - The SDK times out and falls back to default flag values
 */

blockLaunchDarkly('app renders with default flags when LaunchDarkly cannot connect', async ({ page }) => {
  await page.goto('/');

  const appContainer = page.locator('#root > .red-app-header');
  await expect(appContainer).toBeVisible();
  await expect(appContainer).toHaveCSS('background-color', 'rgb(132, 0, 0)');
});
