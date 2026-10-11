import type { NextConfig } from "next";

const config: NextConfig = {
  // Çekirdek motor ve veritabanı paketleri TypeScript kaynağı olarak gelir
  transpilePackages: ["@hfo/core", "@hfo/db"],
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  // pnpm monorepo'da Prisma'nın veritabanı motoru sunucu paketine kendiliğinden kopyalanmaz;
  // açıkça eklenir (aksi hâlde Vercel'de "Query Engine bulunamadı" hatası verir).
  outputFileTracingIncludes: {
    "/**": [
      "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/**/*",
      "../../node_modules/.pnpm/@prisma+client*/node_modules/@prisma/client/**/*",
    ],
  },
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "11mb" }, // PDF yükleme sınırı 10 MB
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default config;
