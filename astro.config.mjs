import { defineConfig } from 'astro/config'
import node from '@astrojs/node'
import clerk from '@clerk/astro'
import dark from '@clerk/themes';

export default defineConfig({
  integrations: [
      clerk({
        appearance: {
          baseTheme: dark, // Forzar modo oscuro globalmente
        },
      }),
    ],
  adapter: node({ mode: 'standalone' }),
  output: 'server',
})
