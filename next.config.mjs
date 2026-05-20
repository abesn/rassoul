/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  pageExtensions: ["ts", "tsx"],
  // DO App Platform health check needs the server to bind to 0.0.0.0:$PORT.
  // Next.js `next start` does this out of the box when PORT is set.
  experimental: {
    mdxRs: false,
  },
};

export default nextConfig;
