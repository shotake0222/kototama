/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // 💡 1. API通信（データの送受信）の許可
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" }, // どのLPからでもAPI利用可能にする
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version" },
        ]
      },
      {
        // 💡 2. 追加：embed.js 自体の読み込みを許可し、JSファイルだと明示する
        source: "/embed.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" }
        ]
      }
    ]
  }
};

export default nextConfig;