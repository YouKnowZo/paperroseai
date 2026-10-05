import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import seoPlugin from "./src/lib/seoPlugin.js";
import extensionBuildPlugin from "./src/lib/extensionBuildPlugin.js";

export default defineConfig({
  plugins: [react(), seoPlugin(), extensionBuildPlugin()],
  server: {
    host: "localhost",
    port: 3001,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
    },
  },
});
