// Adapter for the existing local browser smokes; no browser security bypasses.
import { chromium } from 'playwright-core';
export default {
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  executablePath: async () => process.env.BROWSER_EXECUTABLE || chromium.executablePath(),
};
