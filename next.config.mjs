/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "photos.zillowstatic.com"
      },
      {
        protocol: "https",
        hostname: "ap.rdcpix.com"
      }
    ]
  }
};

export default nextConfig;
