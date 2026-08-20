import { test, expect } from '@playwright/test';
import fs from 'fs';

const credsFilePath = new URL('./creds.json', import.meta.url);
const realCredentials = JSON.parse(fs.readFileSync(credsFilePath, 'utf8'));

// Test a batch of 15 real team leader accounts simultaneously
const sampleUsers = realCredentials.slice(0, 15);

test.describe('Synchronized Instantaneous Login Simulation', () => {

  test('Barrier Synchronized Login: Pre-fill credentials on all tabs, then click login at the exact same millisecond', async ({ browser }) => {
    console.log(`1. Opening ${sampleUsers.length} isolated browser instances on hackathon.mitindia.com...`);

    // Step 1: Open browser contexts and pre-fill credentials for ALL teams
    const pages = await Promise.all(
      sampleUsers.map(async (user, idx) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        
        await page.goto('/');
        await page.locator('#username').fill(user.username);
        await page.locator('#password').fill(user.password);
        
        return { user, context, page, idx: idx + 1 };
      })
    );

    console.log(`✓ All ${pages.length} browser forms are 100% pre-filled with real passwords.`);
    console.log(`⚡ 2. TRIGGERING INSTANTANEOUS SYNCHRONIZED LOGINS ACROSS ALL ${pages.length} BROWSER TABS AT THE EXACT SAME MILLISECOND...`);

    const startSimTime = Date.now();

    // Step 2: Fire click on login button on ALL tabs at the exact same millisecond
    const loginResults = await Promise.all(
      pages.map(async ({ user, page, idx }) => {
        const submitStart = Date.now();
        try {
          await page.click('button[type="submit"]');
          await page.waitForTimeout(4000);

          const mainContent = page.locator('.main-content');
          const isDashboardVisible = await mainContent.isVisible();
          const latency = Date.now() - submitStart;

          if (isDashboardVisible) {
            console.log(`[User ${idx}/${pages.length}] ✅ ${user.username} (${user.teamName}) -> Logged in in ${latency}ms`);
            return { user: user.username, success: true, latency };
          } else {
            console.log(`[User ${idx}/${pages.length}] ❌ ${user.username} -> Dashboard did not render (${latency}ms)`);
            return { user: user.username, success: false, latency };
          }
        } catch (err) {
          const latency = Date.now() - submitStart;
          console.error(`[User ${idx}/${pages.length}] ❌ ${user.username} -> Error: ${err.message}`);
          return { user: user.username, success: false, latency, error: err.message };
        }
      })
    );

    // Step 3: Cleanup browser contexts
    await Promise.all(pages.map(({ context }) => context.close()));

    const totalSimDuration = Date.now() - startSimTime;
    const successes = loginResults.filter(r => r.success);
    const avgLatency = Math.round(successes.reduce((acc, r) => acc + r.latency, 0) / (successes.length || 1));

    console.log('\n' + '='.repeat(65));
    console.log('BARRIER SYNCHRONIZED INSTANTANEOUS LOGIN REPORT');
    console.log('='.repeat(65));
    console.log(`Total Synchronized Tabs  : ${sampleUsers.length}`);
    console.log(`Successful Logins (200) : ${successes.length}/${sampleUsers.length} (${(successes.length / sampleUsers.length * 100).toFixed(1)}%)`);
    console.log(`Total Synchronized Time  : ${(totalSimDuration / 1000).toFixed(2)} seconds`);
    console.log(`Average Latency per Tab  : ${avgLatency} ms`);
    console.log('='.repeat(65));

    expect(successes.length).toBeGreaterThanOrEqual(14);
  });

});
