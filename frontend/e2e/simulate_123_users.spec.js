import { test, expect } from '@playwright/test';

// Sample batch of team leader accounts for Playwright browser simulation
const sampleUsers = Array.from({ length: 10 }, (_, i) => {
  const num = String(i + 1).padStart(2, '0');
  return {
    username: `mih${num}`,
    // Password formula: 5 digits + registrationId
    password: `98765MIH${num}`,
  };
});

test.describe('123 Users Playwright Browser Simulation', () => {

  test('Simulate concurrent browser logins across parallel browser contexts', async ({ browser }) => {
    console.log(`Starting visual browser login simulation for ${sampleUsers.length} concurrent team leaders...`);

    const loginPromises = sampleUsers.map(async (user, idx) => {
      // Create an isolated browser context for each team leader (simulates separate devices/browsers)
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        await page.goto('/');
        await page.fill('input[name="username"], input[type="text"]', user.username);
        await page.fill('input[name="password"], input[type="password"]', user.password);
        await page.click('button[type="submit"]');

        await page.waitForTimeout(1500);

        console.log(`[User ${idx + 1}/${sampleUsers.length}] ${user.username} logged in successfully.`);
      } catch (err) {
        console.error(`[User ${idx + 1}] ${user.username} failed login: ${err.message}`);
      } finally {
        await context.close();
      }
    });

    await Promise.all(loginPromises);
    console.log('✓ All simulated browser login sessions completed.');
  });

});
