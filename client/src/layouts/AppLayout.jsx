import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, Boxes, ClipboardList, FileClock, History, LayoutDashboard, LogOut, Menu, Package, Settings, ShoppingCart, Smartphone, Tags, Truck, Undo2, UserCog, UserRound, Users, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS } from '../utils/format'

const NAVIGATION = [
  { group: 'Selling', items: [
    { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
    { label: 'Point of Sale', to: '/pos', icon: ShoppingCart },
    { label: 'Sales History', to: '/sales', icon: History },
    { label: 'Returns', to: '/returns', icon: Undo2 }
  ] },
  { group: 'Stock', items: [
    { label: 'Products', to: '/products', icon: Package },
    { label: 'Categories', to: '/categories', icon: Tags, ownerOnly: true },
    { label: 'Inventory', to: '/inventory', icon: Boxes },
    { label: 'Stock Movements', to: '/inventory-logs', icon: FileClock, ownerOnly: true },
    { label: 'Purchases', to: '/purchases', icon: ClipboardList, ownerOnly: true },
    { label: 'Suppliers', to: '/suppliers', icon: Truck, ownerOnly: true }
  ] },
  { group: 'People', items: [
    { label: 'Customers', to: '/customers', icon: Users },
    { label: 'Users', to: '/users', icon: UserCog, ownerOnly: true }
  ] },
  { group: 'Admin', items: [
    { label: 'Reports', to: '/reports', icon: BarChart3, ownerOnly: true },
    { label: 'Audit Logs', to: '/audit-logs', icon: FileClock, ownerOnly: true },
    { label: 'Settings', to: '/settings', icon: Settings, ownerOnly: true },
    { label: 'My Account', to: '/profile', icon: UserRound }
  ] }
]

export default function AppLayout() {
  const { user, logout, isOwner, settings } = useAuth()
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => { setOpen(false) }, [location.pathname])
  useEffect(() => {
    document.body.classList.toggle('nav-open', open)
    return () => document.body.classList.remove('nav-open')
  }, [open])

  const groups = NAVIGATION.map((group) => ({ ...group, items: group.items.filter((item) => !item.ownerOnly || isOwner) })).filter((group) => group.items.length)
  const current = NAVIGATION.flatMap((group) => group.items).find((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`))

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`} aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark"><Smartphone size={19} /></div>
          <div><strong>{(settings.business_name || 'Renniels Phone Shop').replace(/ Phone Shop$/, '')}</strong><span>Phone Shop</span></div>
          <button type="button" className="icon-button sidebar-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <nav className="sidebar-nav">
          {groups.map((group) => (
            <div className="nav-group" key={group.group}>
              <div className="nav-label">{group.group}</div>
              {group.items.map(({ label, to, icon: Icon }) => (
                <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <Icon size={17} /><span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <NavLink to="/profile" className="user-card">
            <div className="avatar">{user.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>
            <div><strong>{user.name}</strong><span>{ROLE_LABELS[user.role]}</span></div>
          </NavLink>
          <button type="button" className="logout-button" onClick={logout}><LogOut size={16} /> Log out</button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button type="button" className="icon-button menu-button" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <div className="crumb"><span>{settings.business_name || 'Renniels Phone Shop'}</span><strong>{current?.label || 'Workspace'}</strong></div>
          <div className="topbar-right">
            {location.pathname !== '/pos' && <NavLink to="/pos" className="btn btn-primary btn-sm topbar-pos"><ShoppingCart size={15} /><span>New sale</span></NavLink>}
            <span className={`role-chip role-${user.role.toLowerCase()}`}>{ROLE_LABELS[user.role]}</span>
          </div>
        </header>
        <section className="page-content"><Outlet /></section>
      </main>
      {open && <button type="button" className="backdrop" onClick={() => setOpen(false)} aria-label="Close navigation overlay" />}
    </div>
  )
}
