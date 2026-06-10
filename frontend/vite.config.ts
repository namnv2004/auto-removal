import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"

const backendProxyTarget = process.env.VITE_BACKEND_PROXY_TARGET

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: backendProxyTarget
    ? {
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
