import { readFile } from "node:fs/promises";
import path from "node:path";

export * from "./logger";
import { resolveExistingWorkspacePath } from "./lib/workspace-paths";

type PackageVersionManifest = {
  version: string;
};

export type AppVersions = {
  app: string;
  web: string;
  mobile: string;
};

async function readPackageVersion(relativePath: string, fallbackVersion?: string) {
  try {
    const packageJsonPath = resolveExistingWorkspacePath(relativePath);
    const packageJson = await readFile(packageJsonPath, "utf8");

    return (JSON.parse(packageJson) as PackageVersionManifest).version;
  } catch (error) {
    if (fallbackVersion !== undefined) {
      return fallbackVersion;
    }

    throw error;
  }
}

async function readRootVersion() {
  try {
    // Try to find the root package.json by looking for workspace markers
    const rootMarker = resolveExistingWorkspacePath("pnpm-workspace.yaml");
    const rootDir = path.dirname(rootMarker);
    const packageJsonPath = path.join(rootDir, "package.json");
    const packageJson = await readFile(packageJsonPath, "utf8");

    return (JSON.parse(packageJson) as PackageVersionManifest).version;
  } catch {
    // Fallback to searching for any package.json
    return readPackageVersion("package.json");
  }
}

let appVersionsPromise: Promise<AppVersions> | undefined;

export function getAppVersions() {
  appVersionsPromise ??= Promise.all([
    readRootVersion(),
    readPackageVersion("apps/web/package.json"),
    readPackageVersion("apps/mobile/package.json", "unavailable"),
  ]).then(([appVersion, webVersion, mobileVersion]) => {
    return {
      app: appVersion,
      web: webVersion,
      mobile: mobileVersion,
    } satisfies AppVersions;
  });

  return appVersionsPromise;
}
