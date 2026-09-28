import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  // pdf-parse bundles pdfjs-dist, which loads its worker as a separate file at
  // runtime — bundling it normally breaks that lookup, so it must run unbundled.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
