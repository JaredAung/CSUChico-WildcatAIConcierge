/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: 'http://127.0.0.1:8001/api/v1/:path*',
      },
    ]
  },
}

module.exports = nextConfig
