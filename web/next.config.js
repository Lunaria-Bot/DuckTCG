/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.discordapp.com' },
      { protocol: 'http',  hostname: '**' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  async rewrites() {
    // Proxy /api/* to the bot's Express dashboard API
    const botApiUrl = process.env.BOT_API_URL || 'http://localhost:3000'
    return [
      {
        source: '/api/:path*',
        destination: `${botApiUrl}/api/:path*`,
      },
    ]
  },
}
module.exports = nextConfig
