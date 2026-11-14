import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import AppLayout from './layouts/AppLayout'
import ProtectedRoute, { OwnerRoute } from './routes/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PosPage from './pages/PosPage'
import SalesPage from './pages/SalesPage'
import ReturnsPage from './pages/ReturnsPage'
import ProductsPage from './pages/ProductsPage'
import CategoriesPage from './pages/CategoriesPage'
import InventoryPage from './pages/InventoryPage'
import InventoryLogsPage from './pages/InventoryLogsPage'
import PurchasesPage from './pages/PurchasesPage'
import SuppliersPage from './pages/SuppliersPage'
import CustomersPage from './pages/CustomersPage'
import ReportsPage from './pages/ReportsPage'
import UsersPage from './pages/UsersPage'
import AuditLogsPage from './pages/AuditLogsPage'
import SettingsPage from './pages/SettingsPage'
import ProfilePage from './pages/ProfilePage'
import './styles.css'

const owner = (element) => <OwnerRoute>{element}</OwnerRoute>

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/pos" element={<PosPage />} />
                <Route path="/sales" element={<SalesPage />} />
                <Route path="/sales/history" element={<Navigate to="/sales" replace />} />
                <Route path="/returns" element={<ReturnsPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/customers" element={<CustomersPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/categories" element={owner(<CategoriesPage />)} />
                <Route path="/inventory-logs" element={owner(<InventoryLogsPage />)} />
                <Route path="/purchases" element={owner(<PurchasesPage />)} />
                <Route path="/suppliers" element={owner(<SuppliersPage />)} />
                <Route path="/reports" element={owner(<ReportsPage />)} />
                <Route path="/users" element={owner(<UsersPage />)} />
                <Route path="/audit-logs" element={owner(<AuditLogsPage />)} />
                <Route path="/settings" element={owner(<SettingsPage />)} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
