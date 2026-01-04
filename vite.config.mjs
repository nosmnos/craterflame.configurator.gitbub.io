import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  build: {
    outDir: 'public'
  },
  plugins: [
    viteStaticCopy({
      targets: [
         {
          src: 'models/*',
          dest: 'models'
        }
      ]
    })
  ]
});