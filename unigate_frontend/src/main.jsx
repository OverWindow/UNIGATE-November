import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Mount App into the root element in index.html.
// index.html의 root 요소에 React 앱을 연결합니다.
// StrictMode enables additional development checks.
// StrictMode는 개발 중 잠재적인 문제를 찾는 추가 검사를 활성화합니다.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
