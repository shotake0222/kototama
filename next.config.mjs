/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // 1. API通信の許可（既存のまま）
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version" },
        ]
      },
      {
        // 💡 2. embed.js へのアクセス許可と【重要】MIMEタイプの強制
        source: "/embed.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          // これが最も重要！Vercelに「これはJavaScriptだ」と強制認識させる
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          // キャッシュが悪さをして古い情報を読み込まないようにする
          { key: "Cache-Control", value: "no-store, must-revalidate" }
        ]
      }
    ]
  }
};

export default nextConfig;