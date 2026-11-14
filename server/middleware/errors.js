export function notFound(req, res) {
  res.status(404).json({ message: 'Resource not found.' })
}

const duplicateMessages = [
  [/product_code/, 'A product with that code (SKU) already exists.'],
  [/email/, 'That email address is already in use.'],
  [/category_name/, 'A category with that name already exists.'],
  [/reference_number/, 'That reference number is already used by another purchase.'],
  [/imei|serial_number/, 'That IMEI / serial number already exists in inventory.']
]

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)
  if (error.code === 'ER_DUP_ENTRY') {
    const match = duplicateMessages.find(([pattern]) => pattern.test(error.sqlMessage || ''))
    return res.status(409).json({ message: match ? match[1] : 'A record with that value already exists.' })
  }
  if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid request body.' })
  if (!error.status || error.status >= 500) console.error(error)
  res.status(error.status || 500).json({ message: error.status ? error.message : 'An unexpected server error occurred.' })
}
