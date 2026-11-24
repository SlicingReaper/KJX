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
        { src: `${cesiumSource}/ThirdParty`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Workers`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Assets`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Widgets`, dest: cesiumBaseUrl },
      ],
    }),
  ],
  resolve: { alias: [{ find: /^cesium$/, replacement: fileURLToPath(new URL('./node_modules/cesium/Build/Cesium/index.js', import.meta.url)) }] },
  optimizeDeps: { exclude: ['cesium'] },
  server: { port: 5199 },
  build: { chunkSizeWarningLimit: 6000, target: 'esnext' },
});
