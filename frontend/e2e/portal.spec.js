import { test, expect } from '@playwright/test';

test.describe('Event Management Portal E2E Test Suite', () => {

  test('1. Health Check Endpoint', async ({ request }) => {
    const backendUrl = 'https://mitinida-backendportal-1509.onrender.com/health';
    const response = await request.get(backendUrl);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('healthy');
    console.log('✓ Health check passed:', body);
  });

  test('2. Admin Dashboard & Operations', async ({ page }) => {
    console.log('Testing Admin Login...');
    await page.goto('/');

    // Input selectors using exact IDs from Login.jsx
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill('AdminPassword123!');
    await page.click('button[type="submit"]');

    // Wait for Dashboard view to render after successful login
    await page.waitForTimeout(2000);
    
    // Check if main content container is visible
    const mainContent = page.locator('.main-content');
    await expect(mainContent.first()).toBeVisible({ timeout: 15000 });
    console.log('✓ Admin Login & Dashboard loaded successfully');

    // Check Teams table
    const table = page.locator('table');
    if (await table.isVisible()) {
      console.log('✓ Teams table is rendering properly in Admin view');
    }
  });

  test('3. Volunteer Dashboard & People Check-in Tab', async ({ page }) => {
    console.log('Testing Volunteer Portal...');
    await page.goto('/');

    // Login as volunteer
    await page.locator('#username').fill('volunteer');
    await page.locator('#password').fill('VolunteerPassword123!');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(2000);

    // Verify Volunteer Dashboard and tabs
    const mainContent = page.locator('.main-content');
    await expect(mainContent.first()).toBeVisible({ timeout: 15000 });
    console.log('✓ Volunteer Dashboard loaded successfully');

    // Verify Tab Switching: People / Faculty / Judges Tab
    const peopleTab = page.locator('text=People / Faculty / Judges');
    if (await peopleTab.isVisible()) {
      await peopleTab.click();
      await page.waitForTimeout(1000);
      console.log('✓ Successfully navigated to People / Faculty / Judges Check-in tab');
    }
  });

});
