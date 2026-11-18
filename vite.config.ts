import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin, type ResolvedConfig } from "vite";
import { serwist } from "@serwist/vite";

const env = loadEnv(process.env.NODE_ENV as string, process.cwd(), "VITE_");

/*
 * Serwist requires viteConfig.build.ssr to be false in order to generate sw.js
 * but this is lame because tanstack sets this to true even when generating the
 * client bundle, so this temporarily sets build.ssr to false for serwist.
 *
 * See https://github.com/serwist/serwist/blob/55f2ab0bc20d3286e0f40162fc577daed02624cc/packages/vite/src/plugins/build.ts
 */
function patchSerwistForTanstack(plugins: Plugin[]): Plugin[] {
  return plugins.map((plugin) => {
    // First, make sure build.ssr is true by default
    if (plugin.configResolved) {
      const ogConfigResolved = plugin.configResolved;
      plugin.configResolved = (viteConfig: ResolvedConfig) =>
        ogConfigResolved({
          ...viteConfig,
          build: {
            ...viteConfig.build,
            ssr: false,
          },
        });
    }

    // Second, only run closeBundle if generating client bundle
    if (plugin.closeBundle) {
      const ogCloseBundle = plugin.closeBundle;
      const ogHandler =
        typeof ogCloseBundle === "function"
          ? ogCloseBundle
          : ogCloseBundle.handler;
      const handler = function (this: any, ...args: any[]) {
        if (this.environment.name === "client") return ogHandler(this, args);
      };

      plugin.closeBundle =
        typeof ogCloseBundle === "function"
          ? handler
          : { ...ogCloseBundle, handler };
    }

    return plugin;
  });
}

export default defineConfig({
  base: env.VITE_PRERENDER ? "/Web-Osu-Mania/" : "/",
  server: {
    port: 3000,
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart({
      prerender: {
        enabled: env.VITE_PRERENDER === "true",
        crawlLinks: false,
      },
    }),
    viteReact(),
    tailwindcss(),
    patchSerwistForTanstack(
      serwist({
        swSrc: "src/sw.ts",
        swDest: "../client/sw.js", // see https://github.com/serwist/serwist/blob/main/examples/tanstack-start-basic/vite.config.ts
        globDirectory: "dist/client",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,mp3}"],
        injectionPoint: "self.__SW_MANIFEST",
        rollupFormat: "iife",
        maximumFileSizeToCacheInBytes: 5000000,
      }),
    ),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
