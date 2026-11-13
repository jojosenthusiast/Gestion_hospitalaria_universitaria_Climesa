// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { resolveConfig } from 'vite';

async function developmentConfig() {
  return resolveConfig({ configFile: 'vite.config.ts' }, 'serve', 'development');
}

describe('Vite development API proxy', () => {
  it('proxies local API requests to the deployed API without relaxing production CORS', async () => {
    const config = await developmentConfig();

    expect(config.server?.proxy?.['/api/v1']).toMatchObject({
      target: 'https://sghu-api.onrender.com',
      changeOrigin: true,
      secure: true,
    });
  });
});
