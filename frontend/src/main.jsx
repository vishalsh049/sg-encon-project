import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios'
import './index.css'
import App from './App.jsx'

axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

const savedTheme = localStorage.getItem('theme')
const preferredTheme =
  savedTheme ||
  (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

document.documentElement.classList.toggle('dark', preferredTheme === 'dark')
document.documentElement.style.colorScheme = preferredTheme

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
