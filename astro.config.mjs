import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://babu88official.com',
  integrations: [sitemap()],
  output: 'static',
});
