/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // TamiLearn may be shown inside a page on sanmarkkamlife.org (the
  // /tamilearn page embeds it), and nowhere else. Other sites cannot frame it.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://sanmarkkamlife.org https://*.sanmarkkamlife.org",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
