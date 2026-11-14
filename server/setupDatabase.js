// Creates/upgrades the database and loads demo data when the catalog is empty.
// The API runs this automatically on startup; this script lets you run it on its own.
import { migrate } from './db/migrate.js'

await migrate()
process.exit(0)
