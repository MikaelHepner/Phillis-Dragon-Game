import { defineConfig } from 'vite';

// Multi-page setup: the original 2D game stays at /, the 3D rebuild lives at /index3d.html.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        island3d: 'index3d.html',
        gallery3d: 'gallery3d.html',
      },
    },
  },
});
