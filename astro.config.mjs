import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import clerk from '@clerk/astro';
import { clerkAppearance, clerkLocalization } from './src/lib/clerk';

export default defineConfig({
  integrations: [
    clerk({
      appearance: clerkAppearance,
      localization: clerkLocalization,
    }),
  ],

  adapter: node({ mode: 'standalone' }),
  output: 'server',
});