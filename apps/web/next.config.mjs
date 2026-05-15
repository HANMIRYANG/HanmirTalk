/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@hanmir/shared"],
  experimental: {
    typedRoutes: false
  }
};

export default nextConfig;
