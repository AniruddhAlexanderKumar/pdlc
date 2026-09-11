import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Native Node addon (Argon2) — must be required at runtime by the server,
  // not bundled. It is never reachable from client or edge code.
  serverExternalPackages: ["@node-rs/argon2"],
};

export default nextConfig;
