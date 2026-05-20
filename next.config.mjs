/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  pageExtensions: ["ts", "tsx"],
  experimental: {
    mdxRs: false,
  },
};

export default nextConfig;
