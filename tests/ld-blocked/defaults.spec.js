const { blockLaunchDarkly, expect } = require('../fixtures');

/**
 * Tests for app behavior when LaunchDarkly is unreachable.
 * These tests verify that the app gracefully falls back to default values.
 * 
 * When LD is blocked:
 * - The SDK cannot connect to clientstream.launchdarkly.com or events.launchdarkly.com
 * - Flag evaluations return default values (e.g., config-background-color = "red")
 */

blockLaunchDarkly('background is RED when LaunchDarkly cannot connect', async ({ page }) => {
  await page.goto('/');

  // Since LD is blocked, the app uses the default value: "red"
  // This results in the CSS class "red-app-header" with background #840000
  const appContainer = page.locator('#root > .red-app-header');
  await expect(appContainer).toBeVisible();
  await expect(appContainer).toHaveCSS('background-color', 'rgb(132, 0, 0)'); // #840000
});

