import { useState } from 'react'
import { Download, FileClock } from 'lucide-react'
import { Badge, DataTable, PageHeader, Panel, SearchInput, Segmented, Toolbar } from '../components/ui'
import { useApi, useDebounce } from '../hooks/useApi'
import { ROLE_LABELS, dateTime, downloadCsv, isoDay, titleCase } from '../utils/format'

const RANGES = [['1', 'Today'], ['7', '7 days'], ['30', '30 days'], ['90', '90 days']]
const TONE = (action) => (/CANCEL|DEACTIVATE/.test(action) ? 'critical' : /RETURN|ADJUST|RESET/.test(action) ? 'warning' : /CREATE|PURCHASE/.test(action) ? 'good' : /LOGIN|LOGOUT/.test(action) ? 'neutral' : 'info')

export default function AuditLogsPage() {
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('')
  const [range, setRange] = useState('7')
  const [userId, setUserId] = useState('')
  const debounced = useDebounce(search)
  const { data, loading, error, reload } = useApi('/audit-logs', { search: debounced, action, user_id: userId, from: isoDay(-(Number(range) - 1)), to: isoDay() })
  const users = useApi('/users')
  const rows = data?.logs || []

  const columns = [
    { key: 'description', label: 'Activity', primary: true, render: (row) => <><span className="cell-title wrap">{row.description}</span><small className="cell-sub">{dateTime(row.created_at)}</small></> },
    { key: 'action', label: 'Action', render: (row) => <Badge tone={TONE(row.action)}>{titleCase(row.action)}</Badge> },
    { key: 'entity_type', label: 'Record', hideMobile: true, render: (row) => `${titleCase(row.entity_type)}${row.entity_id ? ` #${row.entity_id}` : ''}` },
    { key: 'user_name', label: 'User', render: (row) => <>{row.user_name || 'System'}<small className="cell-sub">{ROLE_LABELS[row.user_role] || ''}</small></> }
  ]

  return (
    <div>
      <PageHeader eyebrow="ADMINISTRATION" title="Audit logs" description="A tamper-evident trail of sign-ins, sales, cancellations, returns, stock changes and settings."
        actions={<button type="button" className="btn btn-ghost" disabled={!rows.length} onClick={() => downloadCsv(`audit-logs-${range}d.csv`, [[(row) => dateTime(row.created_at), 'Date'], ['user_name', 'User'], ['action', 'Action'], ['entity_type', 'Record'], ['entity_id', 'Record ID'], ['description', 'Description']], rows)}><Download size={16} /> Export CSV</button>} />
      <Panel flush>
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search activity..." />
          <Segmented label="Date range" options={RANGES} value={range} onChange={setRange} />
          <select value={action} onChange={(event) => setAction(event.target.value)} aria-label="Action">
            <option value="">All actions</option>{(data?.actions || []).map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
          </select>
          <select value={userId} onChange={(event) => setUserId(event.target.value)} aria-label="User">
            <option value="">All users</option>{(users.data?.users || []).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </Toolbar>
        <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={reload} pageSize={25} empty={{ icon: FileClock, title: 'No activity found', text: 'Try a longer date range.' }} />
      </Panel>
    </div>
  )
}
