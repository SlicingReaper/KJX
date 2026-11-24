import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const cesiumSource = 'node_modules/cesium/Build/Cesium';
const cesiumBaseUrl = 'cesium';

export default defineConfig({
  base: './',
  define: { CESIUM_BASE_URL: JSON.stringify(cesiumBaseUrl) },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/ThirdParty`, dest: cesiumBaseUrl, rename: { stripBase: 4 } },
        { src: `${cesiumSource}/Workers`, dest: cesiumBaseUrl, rename: { stripBase: 4 } },
        { src: `${cesiumSource}/Assets`, dest: cesiumBaseUrl, rename: { stripBase: 4 } },
        { src: `${cesiumSource}/Widgets`, dest: cesiumBaseUrl, rename: { stripBase: 4 } },
      ],
    }),
  ],
  resolve: { alias: [{ find: /^cesium$/, replacement: fileURLToPath(new URL('./node_modules/cesium/Build/Cesium/index.js', import.meta.url)) }] },
  optimizeDeps: { exclude: ['cesium'] },
  server: { port: 5199 },
  build: { chunkSizeWarningLimit: 6000, target: 'esnext' },
});
