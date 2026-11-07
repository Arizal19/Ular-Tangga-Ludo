/** @type {import('next').NextConfig} */
const immutable = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];

const nextConfig = {
  reactStrictMode: true,
  // Intro clip and portraits never change under the same name: cache them for a year so
  // repeat visits (and the partner's phone) skip the download.
  async headers() {
    return [
      { source: "/intro/:path*", headers: immutable },
      { source: "/characters/:path*", headers: immutable },
    ];
  },
};

export default nextConfig;
