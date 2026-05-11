/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // The /api/eval route reads files from eval/{fixtures,golden} at runtime.
  // Next.js standalone bundling won't include those paths unless we declare
  // them here. Without this, /eval works locally but returns "no fixtures"
  // on Vercel.
  outputFileTracingIncludes: {
    "/api/eval": ["./eval/fixtures/**/*", "./eval/golden/**/*"],
  },
};

export default nextConfig;
