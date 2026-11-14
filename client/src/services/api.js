import axios from 'axios'

export const TOKEN_KEY = 'renniels_token'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 30000 })

api.interceptors.request.use((request) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) request.headers.Authorization = `Bearer ${token}`
  return request
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLogin = error.config?.url?.includes('/auth/login')
    if (error.response?.status === 401 && !isLogin && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY)
      if (!window.location.pathname.startsWith('/login')) window.location.assign('/login?expired=1')
    }
    return Promise.reject(error)
  }
)

export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (error?.response?.data?.message) return error.response.data.message
  if (error?.code === 'ECONNABORTED') return 'The server took too long to respond.'
  if (error?.message === 'Network Error') return 'Cannot reach the server. Check your connection.'
  return fallback
}

export default api
