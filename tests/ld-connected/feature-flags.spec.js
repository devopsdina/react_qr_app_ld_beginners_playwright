const { connectedLaunchDarkly, expect } = require('../fixtures');

/**
 * Tests for app behavior when LaunchDarkly is connected.
 * These tests verify that feature flags are properly applied.
 * 
 * NOTE: These tests require:
 * - A valid LaunchDarkly client key configured in the app
 * - The config-background-color flag set to "blue" in your LD environment
 * 
 * When LD is connected:
 * - The SDK connects to LaunchDarkly and fetches flag values
 * - Flag evaluations return the configured values (e.g., config-background-color = "blue")
 */

connectedLaunchDarkly('background is BLUE when LaunchDarkly returns blue flag', async ({ page }) => {
  await page.goto('/');

  // Since LD is connected and flag is set to "blue", expect blue background
  // This results in the CSS class "blue-app-header" with background #405BFF
  const appContainer = page.locator('#root > .blue-app-header');
  await expect(appContainer).toBeVisible();
  await expect(appContainer).toHaveCSS('background-color', 'rgb(64, 91, 255)'); // #405BFF
});

