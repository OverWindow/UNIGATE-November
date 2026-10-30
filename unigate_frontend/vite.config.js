import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Enable React JSX transformation and Fast Refresh during development.
  // React JSX 변환과 개발 중 변경 내용을 반영하는 Fast Refresh를 활성화합니다.
  plugins: [react()],
})
