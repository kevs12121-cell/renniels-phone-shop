import { pool } from '../config/db.js'

export async function audit(connection, userId, action, entityType, entityId, description, metadata = null) {
  await connection.execute(
    'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, description, metadata) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, action, entityType, entityId || null, description, metadata ? JSON.stringify(metadata) : null]
  )
}

export async function auditWithPool(userId, action, entityType, entityId, description, metadata = null) {
  return audit(pool, userId, action, entityType, entityId, description, metadata)
}
