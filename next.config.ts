import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

// Set NEXT_BASE_PATH at build time when deploying to a GitHub Pages
// *project* site (served from https://<user>.github.io/<repo>/), e.g.
//   NEXT_BASE_PATH=/tn-local-administration-explorer npm run build
// Leave unset for local dev and for a user/org root site.
const basePath = process.env.NEXT_BASE_PATH || "";

// public/data/tndb2021.db has a stable filename, but its *content*
// changes across deploys (new tables, fixed data, etc.) while GitHub
// Pages only caches it for 10 minutes -- a browser that loaded the page
// just before a deploy can keep serving the old file's bytes against the
// new JS bundle that expects the new schema, throwing on every query.
// Fingerprinting the fetch URL with the file's own content hash forces a
// fresh fetch whenever the content actually changes, independent of any
// HTTP cache lifetime.
function shortHashOf(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 10);
}
const dbVersion = shortHashOf(join(__dirname, "public", "data", "tndb2021.db"));

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_DB_VERSION: dbVersion,
  },
};

export default nextConfig;
