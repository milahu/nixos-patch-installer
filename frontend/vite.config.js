import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import backendConfig from "../backend/config.json";

const backendUrl = `${backendConfig.protocol}://${backendConfig.host}:${backendConfig.port}`;

export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    target: "esnext",
    polyfillDynamicImport: false,
  },
  server: {
  	open: '/',
    proxy: { // https://vitejs.dev/config/#server-proxy
      '^/backend/.*': {
        target: backendUrl,
        //changeOrigin: true,
        //rewrite: path => path.replace(/^\/backend/, '')
      },
    }
  },
  resolve: {
    dedupe: ['browser', 'module', 'main', 'util'],
  },
});
