import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './config/env.js'
import { pool } from './config/db.js'
import { migrate } from './db/migrate.js'
import { authenticate } from './middleware/auth.js'
import { errorHandler, notFound } from './middleware/errors.js'
import authRoutes from './routes/authRoutes.js'
import dashboardRoutes from './routes/dashboardRoutes.js'
import catalogRoutes from './routes/catalogRoutes.js'
import partnerRoutes from './routes/partnerRoutes.js'
import inventoryRoutes from './routes/inventoryRoutes.js'
import salesRoutes from './routes/salesRoutes.js'
import adminRoutes from './routes/adminRoutes.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const clientDist = path.join(projectRoot, 'client', 'dist')

const app = express()
app.set('trust proxy', 1)
app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: config.isProduction ? [] : null } } }))
app.use(cors({ origin: config.allowedOrigins, credentials: false }))
app.use(express.json({ limit: '1mb' }))
app.use(morgan(config.isProduction ? 'tiny' : 'dev'))

app.get('/api/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', service: 'renniels-phone-shop-api' })
  } catch (error) {
    next(error)
  }
})
app.use('/api/auth', authRoutes)
app.use('/api', authenticate, dashboardRoutes, catalogRoutes, partnerRoutes, inventoryRoutes, salesRoutes, adminRoutes)
app.use('/api', notFound)

// Serve the built React app (production / Railway). In development Vite serves the client.
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use('/assets', express.static(path.join(clientDist, 'assets'), { immutable: true, maxAge: '1y' }))
  app.use(express.static(clientDist, { index: false }))
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')))
}
app.use(notFound)
app.use(errorHandler)

async function start() {
  for (let attempt = 1; ; attempt++) {
    try {
      await migrate()
      break
    } catch (error) {
      if (attempt >= 15) throw error
      console.error(`Database not ready (attempt ${attempt}): ${error.code || error.message}. Retrying in 4s...`)
      await new Promise((resolve) => setTimeout(resolve, 4000))
    }
  }
  app.listen(config.port, '0.0.0.0', () => console.log(`Renniels Phone Shop listening on port ${config.port}`))
}

start().catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})
