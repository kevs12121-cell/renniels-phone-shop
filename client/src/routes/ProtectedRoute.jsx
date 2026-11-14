import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Smartphone } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="screen-loader"><div className="brand-mark large"><Smartphone size={26} /></div><span>Loading workspace...</span></div>
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location.pathname }} />
}

export function OwnerRoute({ children }) {
  const { isOwner } = useAuth()
  return isOwner ? children : <Navigate to="/dashboard" replace />
}
