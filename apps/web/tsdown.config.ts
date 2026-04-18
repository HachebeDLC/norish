import { defineConfig } from "tsdown";

const commonConfig = {
  format: ["esm"],
  outDir: "../../dist-server",
  tsconfig: "./tsconfig.server.json",
  clean: false, // Don't clean between sub-builds
  treeshake: true,
  minify: false,
  platform: "node",
  noExternal: [/^@norish\//],
  inlineOnly: false,
  external: [
    "pg", "pg-pool", "pg-types", "sharp", "heic-convert", "libheif-js",
    "yt-dlp-wrap", "ffmpeg-static", "playwright-core", "bullmq", "ioredis",
    "next", "next-intl", "react", "react-dom", "server-only", "hono",
    "@hono/node-server", "drizzle-orm", "drizzle-zod", "kysely",
    "better-auth", "@better-auth/api-key", "@better-auth/core",
    "@better-auth/utils", "@better-auth/expo", "better-call", "jose",
    "cookie", "openai", "ai", "@ai-sdk/openai", "@ai-sdk/anthropic",
    "@ai-sdk/azure", "@ai-sdk/deepseek", "@ai-sdk/google", "@ai-sdk/groq",
    "@ai-sdk/mistral", "@ai-sdk/openai-compatible", "@ai-sdk/perplexity",
    "@ai-sdk/provider", "@ai-sdk/provider-utils", "ollama-ai-provider-v2",
    "pino", "pino-pretty", "zod", "date-fns", "superjson", "dotenv",
    "fuse.js", "cheerio", "tsdav", "ws", "mime", "nanostores",
    "ua-parser-js", "uuid", "jszip", "numeric-quantity",
    "parse-ingredient", "html-entities", "jsonrepair",
  ],
};

export default defineConfig([
  {
    ...commonConfig,
    entry: { index: "server/index.ts" },
    clean: true, // Clean only on the first build
  },
  {
    ...commonConfig,
    entry: { cli: "server/cli.ts" },
  },
  {
    ...commonConfig,
    entry: { worker: "server/worker.ts" },
  },
]);
