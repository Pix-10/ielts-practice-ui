import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages phục vụ site tại /<repo>/ → phải đặt base path khi build trên CI.
// Dev local vẫn chạy bình thường tại /.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: repo ? `/${repo}/` : '/',
})
