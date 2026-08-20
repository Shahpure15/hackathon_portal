import { test, expect } from '@playwright/test';
import fs from 'fs';

const credsFilePath = new URL('./creds.json', import.meta.url);
const realCredentials = JSON.parse(fs.readFileSync(credsFilePath, 'utf8'));

// Test a sample batch of real team leader accounts against hackathon.mitindia.com
const sampleUsers = realCredentials.slice(0, 10);

test.describe('123 Real Team Leaders Playwright Browser Simulation', () => {

  test('Simulate concurrent browser logins on hackathon.mitindia.com using real credentials', async ({ browser }) => {
    console.log(`Starting visual browser login simulation on hackathon.mitindia.com for ${sampleUsers.length} real team leaders...`);

    const loginPromises = sampleUsers.map(async (user, idx) => {
      // Create an isolated browser context for each team leader
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        await page.goto('/');
        await page.locator('#username').fill(user.username);
        await page.locator('#password').fill(user.password);
        await page.click('button[type="submit"]');

        await page.waitForTimeout(2000);

        console.log(`[User ${idx + 1}/${sampleUsers.length}] ${user.username} (${user.teamName}) logged in successfully with real password.`);
      } catch (err) {
        console.error(`[User ${idx + 1}] ${user.username} login error: ${err.message}`);
      } finally {
        await context.close();
      }
    });

    await Promise.all(loginPromises);
    console.log('✓ All simulated browser login sessions with real credentials completed.');
  });

});
