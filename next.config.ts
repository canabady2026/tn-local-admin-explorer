import type { NextConfig } from "next";

// Set NEXT_BASE_PATH at build time when deploying to a GitHub Pages
// *project* site (served from https://<user>.github.io/<repo>/), e.g.
//   NEXT_BASE_PATH=/tn-local-administration-explorer npm run build
// Leave unset for local dev and for a user/org root site.
const basePath = process.env.NEXT_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
