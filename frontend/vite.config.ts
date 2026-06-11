import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"

const backendProxyTarget = process.env.VITE_BACKEND_PROXY_TARGET
const basePath = process.env.VITE_BASE_PATH || "/"

// https://vitejs.dev/config/
export default defineConfig({
  base: basePath,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: backendProxyTarget
    ? {
        allowedHosts: true,
        proxy: {
          "/api": {
            target: backendProxyTarget,
            changeOrigin: true,
          },
        },
      }
    : undefined,
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
})
