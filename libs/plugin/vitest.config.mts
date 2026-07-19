import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@dxdz/plugin-broadcom-ad-tdm',
    environment: 'node',
    globals: false,
    passWithNoTests: true,
    include: ['src/**/*.{test,spec}.ts'],
  },
});
