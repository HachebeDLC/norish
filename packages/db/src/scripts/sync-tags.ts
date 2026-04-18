import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resetDbConnection } from "../drizzle";
import { getOrCreateManyTags } from "../repositories/tags";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  // Find the workspace root relative to this script:
  // src/scripts/sync-tags.ts -> src/scripts -> src -> packages/db -> norish-repo -> workspace-root
  const projectRoot = path.resolve(__dirname, "../../../../../");
  const tagsFilePath = path.resolve(projectRoot, "tags.json");

  if (!fs.existsSync(tagsFilePath)) {
    console.error(`File not found: ${tagsFilePath}`);
    process.exit(1);
  }

  console.log(`Reading tags from ${tagsFilePath}...`);

  const rawData = fs.readFileSync(tagsFilePath, "utf8");
  const tags: string[] = JSON.parse(rawData);

  if (!Array.isArray(tags)) {
    console.error("Invalid tags.json format. Expected an array of strings.");
    process.exit(1);
  }

  console.log(`Syncing ${tags.length} tags...`);

  try {
    const results = await getOrCreateManyTags(tags);
    console.log(`Successfully synced ${results.length} tags.`);
  } catch (error) {
    console.error("Error syncing tags:", error);
    process.exit(1);
  } finally {
    await resetDbConnection();
    // Give it a moment to close connections
    setTimeout(() => process.exit(0), 500);
  }
}

main();
