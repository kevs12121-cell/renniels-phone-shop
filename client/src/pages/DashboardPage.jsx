import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Banknote, BarChart3, Boxes, CalendarRange, CircleDollarSign, Package, PackageX, Receipt, ShoppingBag, ShoppingCart, TrendingUp, Undo2, UserPlus, Users } from 'lucide-react'
import { BarList, ColumnChart, PAYMENT_COLORS, SegmentedBar } from '../components/charts'
import SaleDetailModal from '../components/SaleDetailModal'
import { EmptyState, ErrorBanner, PageHeader, Panel, StatCard, StatusBadge } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../hooks/useApi'
import { PAYMENT_LABELS, dayLabel, money, moneyShort, number, time } from '../utils/format'

function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

export default function DashboardPage() {
  const { user, isOwner } = useAuth()
  const { data, loading, error, reload } = useApi('/dashboard')
  const [saleId, setSaleId] = useState(null)
  const m = data?.metrics || {}
  const delta = m.yesterdaySales > 0 ? { value: (m.todaySales - m.yesterdaySales) / m.yesterdaySales, label: 'vs yesterday' } : null
  const firstName = user.name.split(' ')[0]
  const trend = (data?.salesTrend || []).map((point) => ({ key: point.day, label: dayLabel(point.day), value: point.sales, transactions: point.transactions, day: point.day }))
  const trendTotal = trend.reduce((sum, point) => sum + point.value, 0)

  return (
    <div className="dashboard">
      <PageHeader
        eyebrow={isOwner ? 'SHOP OVERVIEW' : 'MY SHIFT'}
        title={`${greeting()}, ${firstName}.`}
        description={isOwner ? 'Live signals from sales, stock and your team.' : 'Your selling performance today and the stock you should know about.'}
        actions={<>
          <span className="dashboard-date"><CalendarRange size={15} /> {new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        </>}
      />
      <ErrorBanner error={error} onRetry={reload} />

      <div className="stat-grid">
        <StatCard label={isOwner ? "Today's sales" : 'My sales today'} value={money(m.todaySales)} icon={CircleDollarSign} tone="blue" delta={delta} hint="No sales yesterday" loading={loading && !data} />
        <StatCard label={isOwner ? 'Transactions today' : 'My transactions today'} value={number(m.todayTransactions)} icon={Receipt} tone="cyan" hint={`Avg ${money(m.todayAverage)} per sale`} loading={loading && !data} />
        {isOwner
          ? <StatCard label="Gross profit today" value={money(m.todayProfit)} icon={TrendingUp} tone="green" hint={m.todaySales > 0 ? `${((m.todayProfit / m.todaySales) * 100).toFixed(1)}% margin` : 'Sales minus item cost'} loading={loading && !data} />
          : <StatCard label="Items sold today" value={number(m.todayItems)} icon={ShoppingBag} tone="green" hint={m.todayReturns ? `${m.todayReturns} return(s) processed` : 'Across all your sales'} loading={loading && !data} />}
        <StatCard label={isOwner ? 'Sales this month' : 'My sales this month'} value={moneyShort(m.monthSales)} icon={BarChart3} tone="violet" hint={`${number(m.monthTransactions)} transactions`} loading={loading && !data} />
      </div>

      <div className="stat-grid stat-grid-secondary">
        {isOwner
          ? <StatCard label="Inventory value (cost)" value={moneyShort(m.inventoryCost)} icon={Boxes} tone="orange" hint={`${moneyShort(m.inventoryRetail)} at retail`} loading={loading && !data} />
          : <StatCard label="Units on hand" value={number(m.unitsOnHand)} icon={Boxes} tone="orange" hint={`${number(m.serializedInStock)} phones & tablets`} loading={loading && !data} />}
        <StatCard label="Low stock" value={number(m.lowStock)} icon={AlertTriangle} tone="amber" hint="At or below reorder level" loading={loading && !data} />
        <StatCard label="Out of stock" value={number(m.outOfStock)} icon={PackageX} tone="red" hint={`${number(m.totalProducts)} active products`} loading={loading && !data} />
        <StatCard label="Active customers" value={number(m.customers)} icon={Users} tone="cyan" hint={isOwner ? `${number(m.suppliers)} active suppliers` : 'Registered for warranty'} loading={loading && !data} />
      </div>

      <div className="dashboard-grid">
        <Panel className="span-2" eyebrow={isOwner ? 'SALES TREND' : 'MY SALES TREND'} title="Last 14 days" actions={<span className="panel-figure">{moneyShort(trendTotal)}</span>}>
          {trend.length ? (
            <ColumnChart data={trend} axisFormat={moneyShort} highlightLast ariaLabel="Daily sales for the last 14 days"
              xLabel={(point) => dayLabel(point.day)}
              tooltip={(point) => <><span>{dayLabel(point.day, { weekday: 'short', month: 'short', day: 'numeric' })}</span><strong>{money(point.value)}</strong><span>{point.transactions} transaction{point.transactions === 1 ? '' : 's'}</span></>} />
          ) : <EmptyState title="No sales yet" />}
        </Panel>
        <Panel eyebrow="PAYMENT MIX" title="Last 30 days">
          <SegmentedBar format={moneyShort} items={(data?.paymentMix || []).map((row) => ({ key: row.method, label: PAYMENT_LABELS[row.method], value: row.total, color: PAYMENT_COLORS[row.method], detail: `${row.transactions} sales` }))} />
        </Panel>
      </div>

      <div className="dashboard-grid">
        <Panel eyebrow="RECENT SALES" title={isOwner ? 'Latest transactions' : 'My latest sales'} className="span-2" actions={<Link className="text-button" to="/sales">View all</Link>}>
          {data?.recentSales?.length ? (
            <div className="list">
              {data.recentSales.map((sale) => (
                <button type="button" className="list-row clickable" key={sale.id} onClick={() => setSaleId(sale.id)}>
                  <div><strong>{sale.invoice_number}</strong><small>{sale.customer} · {isOwner ? `${sale.cashier} · ` : ''}{PAYMENT_LABELS[sale.payment_method] || '—'} · {time(sale.sale_date)}</small></div>
                  <div className="list-row-end"><strong>{money(sale.total)}</strong>{sale.status !== 'COMPLETED' ? <StatusBadge value={sale.status} /> : <small>{new Date(sale.sale_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</small>}</div>
                </button>
              ))}
            </div>
          ) : <EmptyState icon={Receipt} title="No sales yet" text="Completed transactions will appear here." action={<Link to="/pos" className="btn btn-primary btn-sm">Start a sale</Link>} />}
        </Panel>
        <Panel eyebrow="TOP SELLERS" title={isOwner ? 'Best products, 30 days' : 'My best sellers, 30 days'}>
          <BarList format={moneyShort} items={(data?.topProducts || []).map((product) => ({ key: product.id, label: product.product_name, value: product.revenue, sublabel: `${number(product.quantity)} sold` }))} />
        </Panel>
      </div>

      <div className="dashboard-grid">
        <Panel eyebrow="STOCK ALERTS" title="Needs restocking" className="span-2 alert-panel" actions={<Link className="text-button" to="/inventory">Open inventory</Link>}>
          {data?.lowStock?.length ? (
            <div className="list">
              {data.lowStock.map((item) => (
                <div className="list-row" key={item.id}>
                  <div><strong>{item.product_name}</strong><small>{item.product_code} · reorder at {number(item.reorder_level)}</small></div>
                  <div className="list-row-end"><strong>{number(item.stock_quantity)} left</strong><StatusBadge value={Number(item.stock_quantity) <= 0 ? 'OUT OF STOCK' : 'LOW STOCK'} /></div>
                </div>
              ))}
            </div>
          ) : <EmptyState icon={Package} title="Stock looks healthy" text="No products are below their reorder level." />}
        </Panel>
        <Panel eyebrow="QUICK ACTIONS" title="Shortcuts" className="quick-panel">
          <div className="quick-actions">
            <Link to="/pos"><ShoppingCart size={18} /><span>New sale</span></Link>
            <Link to="/returns?new=1"><Undo2 size={18} /><span>Process a return</span></Link>
            <Link to="/customers?new=1"><UserPlus size={18} /><span>Add customer</span></Link>
            {isOwner ? <Link to="/purchases?new=1"><Banknote size={18} /><span>Receive stock</span></Link> : <Link to="/products"><Package size={18} /><span>Check prices</span></Link>}
          </div>
        </Panel>
      </div>

      <SaleDetailModal saleId={saleId} onClose={() => setSaleId(null)} onChanged={reload} />
    </div>
  )
}
