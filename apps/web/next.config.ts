import type { NextConfig } from "next";

const apiBase =
  process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // Workspace packages + native pg driver
  transpilePackages: ["@app/core", "@app/db"],
  serverExternalPackages: ["pg"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // unsafe-eval required for React Refresh in development
              `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data:",
              `connect-src 'self' ${apiBase}`,
            ].join("; "),
          },
        ],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_API_BASE_URL: apiBase,
  },
};

export default nextConfig;
