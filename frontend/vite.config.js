import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// React JSX and Fast Refresh / React JSX 변환 및 개발 중 빠른 갱신
export default defineConfig({
  plugins: [react()],
})
