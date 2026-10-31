import { test as baseTest, expect as baseExpect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const test = baseTest.extend({
  page: async ({ page }, use, testInfo) => {
    const consoleErrors = [];
    const pageErrors = [];
    const unexpectedResponses = [];
    const allowedErrorStatuses = new Set();

    page.allowErrorStatus = (...statuses) => {
      statuses.forEach((s) => allowedErrorStatuses.add(s));
    };

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        const statusMatch = text.match(/the server responded with a status of (\d+)/);
        if (statusMatch && allowedErrorStatuses.has(Number(statusMatch[1]))) {
          return;
        }
        if (!text.includes('Download the React DevTools')) {
          consoleErrors.push(text);
        }
      }
    });

    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    page.on('response', (response) => {
      const status = response.status();
      const url = response.url();
      if (status >= 400 && !allowedErrorStatuses.has(status)) {
        // Exclude intentional negative test requests
        unexpectedResponses.push(`${status} ${response.request().method()} ${url}`);
      }
    });

    page.checkCleanDom = async () => {
      const text = await page.locator('body').innerText();
      const badPatterns = [
        { label: 'undefined', regex: /\bundefined\b/ },
        { label: 'null', regex: /\bnull\b/ },
        { label: 'NaN', regex: /\bNaN\b/ },
        { label: '[object Object]', regex: /\[object Object\]/ },
      ];
      for (const { label, regex } of badPatterns) {
        if (regex.test(text)) {
          throw new Error(`Visible bad text found on page: "${label}" in text snippet: ${text.slice(0, 300)}`);
        }
      }
    };

    page.capture = async (name) => {
      const dir = path.join(process.cwd(), 'screenshots', testInfo.project.name);
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, `${name}.png`);
      await page.screenshot({ path: filePath, fullPage: false });
      return filePath;
    };

    await use(page);

    if (pageErrors.length > 0) {
      throw new Error(`Uncaught page error(s):\n${pageErrors.join('\n')}`);
    }
    if (consoleErrors.length > 0) {
      throw new Error(`Browser console error(s):\n${consoleErrors.join('\n')}`);
    }
    if (unexpectedResponses.length > 0) {
      throw new Error(`Unexpected HTTP >= 400 error(s):\n${unexpectedResponses.join('\n')}`);
    }
  },
});

export const expect = baseExpect;
