import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Standalone output so the Docker image ships only the compiled server,
  // not node_modules — see frontend/Dockerfile.
  output: "standalone",
  // A stray lockfile above the repo makes Next guess the workspace root;
  // pinning it silences the warning and keeps file tracing correct.
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;
