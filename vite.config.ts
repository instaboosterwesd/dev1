// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Vercel builds use Nitro's Vercel preset, Render builds use Nitro's Node server preset;
// every other build (Cloudflare Workers) uses Cloudflare's Vite plugin.
const isVercel = Boolean(process.env["VERCEL"]);
const isRender = Boolean(process.env["RENDER"]);

export default defineConfig({
  nitro: isVercel ? { preset: "vercel" } : isRender ? { preset: "node-server" } : false,
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    server: { entry: "server" },
  },
  vite: {
    plugins: isVercel || isRender ? [] : [cloudflare({ viteEnvironment: { name: "ssr" } })],
  },
});
