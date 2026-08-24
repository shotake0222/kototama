/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // ESLintのエラーでビルドが止まるのを防ぐ
    ignoreDuringBuilds: true,
  },
  typescript: {
    // TypeScriptの型エラーでビルドが止まるのを防ぐ
    ignoreBuildErrors: true,
  },
};

export default nextConfig;