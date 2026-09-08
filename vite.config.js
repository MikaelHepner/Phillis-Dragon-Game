import { defineConfig } from 'vite';

// Multi-page setup: the original 2D game stays at /, the 3D rebuild lives at /index3d.html.
export default defineConfig({
  build: {
    // es2022 for top-level await, which main.js and gallery.js use to gate
    // startup on the dragon model loading. Supported since Chrome/Firefox 89
    // and Safari 15.
    target: 'es2022',
    rollupOptions: {
      input: {
        main: 'index.html',
        island3d: 'index3d.html',
        gallery3d: 'gallery3d.html',
      },
    },
  },
});
