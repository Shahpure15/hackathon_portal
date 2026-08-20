import { test, expect } from '@playwright/test';
import fs from 'fs';

const credsFilePath = new URL('./creds.json', import.meta.url);
const realCredentials = JSON.parse(fs.readFileSync(credsFilePath, 'utf8'));

// Test ALL 123 real team leader accounts in batches of 25 parallel browser tabs
const BATCH_SIZE = 25;

test.describe('All 123 Teams Synchronized Browser Login Suite', () => {

  test('Simulate 123 Real Team Leaders logging in across parallel browser tabs', async ({ browser }) => {
    console.log(`🚀 Starting full browser simulation for ALL ${realCredentials.length} real team leaders (Batch Size: ${BATCH_SIZE})...\n`);

    let totalSuccesses = 0;
    let totalFailures = 0;
    const allResults = [];
    const overallStartTime = Date.now();

    for (let i = 0; i < realCredentials.length; i += BATCH_SIZE) {
      const batch = realCredentials.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(realCredentials.length / BATCH_SIZE);

      console.log(`--- [Batch ${batchNum}/${totalBatches}] Pre-filling ${batch.length} isolated browser tabs ---`);

      // 1. Pre-fill credentials across batch browser contexts
      const pages = await Promise.all(
        batch.map(async (user, idx) => {
          const context = await browser.newContext();
          const page = await context.newPage();
          try {
            await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.locator('#username').fill(user.username);
            await page.locator('#password').fill(user.password);
            return { user, context, page, idx: i + idx + 1, ready: true };
          } catch (err) {
            return { user, context, page, idx: i + idx + 1, ready: false, error: err.message };
          }
        })
      );

      const readyPages = pages.filter(p => p.ready);

      // 2. Trigger synchronized login click across batch at exact same millisecond
      const batchResults = await Promise.all(
        readyPages.map(async ({ user, page, idx }) => {
          const submitStart = Date.now();
          try {
            await page.click('button[type="submit"]');
            await page.waitForTimeout(3000);

            const mainContent = page.locator('.main-content');
            const isDashboardVisible = await mainContent.isVisible();
            const latency = Date.now() - submitStart;

            if (isDashboardVisible) {
              console.log(`[User ${idx}/${realCredentials.length}] ✅ ${user.username} (${user.teamName}) -> Logged in in ${latency}ms`);
              return { user: user.username, success: true, latency };
            } else {
              console.log(`[User ${idx}/${realCredentials.length}] ❌ ${user.username} -> Dashboard did not render (${latency}ms)`);
              return { user: user.username, success: false, latency };
            }
          } catch (err) {
            const latency = Date.now() - submitStart;
            return { user: user.username, success: false, latency, error: err.message };
          }
        })
      );

      // Cleanup batch contexts
      await Promise.all(pages.map(({ context }) => context.close()));

      const batchSuccesses = batchResults.filter(r => r.success).length;
      totalSuccesses += batchSuccesses;
      totalFailures += (batch.length - batchSuccesses);
      allResults.push(...batchResults);
    }

    const overallDuration = (Date.now() - overallStartTime) / 1000;
    const avgLatency = Math.round(allResults.filter(r => r.success).reduce((acc, r) => acc + r.latency, 0) / (totalSuccesses || 1));

    console.log('\n' + '='.repeat(65));
    console.log('ALL 123 TEAMS FULL BROWSER SIMULATION REPORT');
    console.log('='.repeat(65));
    console.log(`Total Teams Tested       : ${realCredentials.length}`);
    console.log(`Successful Logins (200) : ${totalSuccesses}/${realCredentials.length} (${(totalSuccesses / realCredentials.length * 100).toFixed(1)}%)`);
    console.log(`Failed Logins           : ${totalFailures}`);
    console.log(`Total Execution Time    : ${overallDuration.toFixed(2)} seconds`);
    console.log(`Average Latency per Tab  : ${avgLatency} ms`);
    console.log('='.repeat(65));

    expect(totalSuccesses).toBeGreaterThanOrEqual(115);
  });

});
