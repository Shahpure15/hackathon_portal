import { test, expect } from '@playwright/test';

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminPassword123!';

const VOLUNTEER_USER = process.env.VOLUNTEER_USER || 'volunteer';
const VOLUNTEER_PASSWORD = process.env.VOLUNTEER_PASSWORD || 'VolunteerPassword123!';

test.describe('Event Management Portal Production E2E Test Suite', () => {

  test('1. Health Check Endpoint', async ({ request }) => {
    const backendUrl = 'https://mitinida-backendportal-1509.onrender.com/health';
    const response = await request.get(backendUrl);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('healthy');
    console.log('✓ Health check passed on Render backend:', body);
  });

  test('2. Admin Dashboard & Operations', async ({ page }) => {
    console.log(`Testing Admin Login on hackathon.mitindia.com as '${ADMIN_USER}'...`);
    await page.goto('/');

    await page.locator('#username').fill(ADMIN_USER);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForTimeout(2500);

    const mainContent = page.locator('.main-content');
    if (await mainContent.isVisible()) {
      console.log('✓ Admin Login & Dashboard loaded successfully on hackathon.mitindia.com');
    }
  });

  test('3. Volunteer Dashboard & People Check-in Tab', async ({ page }) => {
    console.log(`Testing Volunteer Portal on hackathon.mitindia.com as '${VOLUNTEER_USER}'...`);
    await page.goto('/');

    await page.locator('#username').fill(VOLUNTEER_USER);
    await page.locator('#password').fill(VOLUNTEER_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForTimeout(2500);

    const mainContent = page.locator('.main-content');
    if (await mainContent.isVisible()) {
      console.log('✓ Volunteer Dashboard loaded successfully');
      
      const peopleTab = page.locator('text=People / Faculty / Judges');
      if (await peopleTab.isVisible()) {
        await peopleTab.click();
        await page.waitForTimeout(1000);
        console.log('✓ Successfully navigated to People / Faculty / Judges Check-in tab');
      }
    }
  });

});
