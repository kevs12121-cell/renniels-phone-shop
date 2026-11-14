import bcrypt from 'bcryptjs'
import { config } from '../config/env.js'

/*
 * Generates a realistic, internally consistent history for the shop:
 * opening stock, restock purchase orders, ~60 days of POS sales, cancellations,
 * returns, stock adjustments, serialized (IMEI) units, inventory logs and audit logs.
 * Everything is simulated chronologically so stock levels and logs always reconcile.
 * Runs only when the products table is empty.
 */

const MINUTE = 60000
const DAY = 86400000

function mulberry32(seed) {
  return function next() {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const STAFF = [
  { name: 'Maria Santos', email: 'cashier@renniels.local', status: 'ACTIVE', weight: 4, since: 150 },
  { name: 'John Dela Cruz', email: 'john@renniels.local', status: 'ACTIVE', weight: 3, since: 140 },
  { name: 'Angela Reyes', email: 'angela@renniels.local', status: 'ACTIVE', weight: 2.5, since: 75 },
  { name: 'Paolo Ramos', email: 'paolo@renniels.local', status: 'INACTIVE', weight: 2, since: 200, leftDaysAgo: 38 }
]

const SUPPLIERS = [
  { key: 'metro', supplier_name: 'Metro Mobile Wholesale', contact_person: 'Arnold Santos', phone: '+63 917 555 0101', email: 'sales@metromobile.local', address: '88 Ortigas Ave., Pasig City', notes: 'Samsung and Xiaomi distributor. Net 15 terms.' },
  { key: 'techline', supplier_name: 'Techline Distribution', contact_person: 'Jenny Cruz', phone: '+63 917 555 0102', email: 'orders@techline.local', address: '21 Ayala Ave., Makati City', notes: 'Apple, OPPO and vivo authorized reseller. COD or bank transfer.' },
  { key: 'digital', supplier_name: 'Digital Lane Trading', contact_person: 'Rico Villanueva', phone: '+63 917 555 0104', email: 'rico@digitallane.local', address: '5 Rizal Ave., Sta. Cruz, Manila', notes: 'realme, Infinix, Tecno and Nokia.' },
  { key: 'accessory', supplier_name: 'Accessory Hub', contact_person: 'Mika Reyes', phone: '+63 917 555 0103', email: 'hello@accessoryhub.local', address: '14 Banawe St., Quezon City', notes: 'Cases, tempered glass and cables. Weekly delivery every Monday.' },
  { key: 'powercell', supplier_name: 'PowerCell Supplies', contact_person: 'Karen Mendoza', phone: '+63 917 555 0105', email: 'karen@powercell.local', address: '230 E. Rodriguez Jr. Ave., Quezon City', notes: 'Chargers and power banks.' },
  { key: 'soundwave', supplier_name: 'SoundWave Imports', contact_person: 'Leo Garcia', phone: '+63 917 555 0106', email: 'leo@soundwave.local', address: '9 Shaw Blvd., Mandaluyong City', notes: 'Audio and memory cards.' },
  { key: 'bayview', supplier_name: 'Bayview Gadget Depot', contact_person: 'Tess Lim', phone: '+63 917 555 0107', email: 'tess@bayview.local', address: '77 Roxas Blvd., Pasay City', notes: 'Former supplier, replaced by Accessory Hub.', status: 'INACTIVE' }
]

// serial: 'dual' = two IMEIs, 'single' = one IMEI, 'serial' = serial number only (Wi-Fi tablets), null = not serialized
const CATALOG = [
  { code: 'SM-A15-128', cat: 'Smartphones', sup: 'metro', brand: 'Samsung', model: 'Galaxy A15', name: 'Samsung Galaxy A15 8GB/128GB', ram: '8GB', storage: '128GB', color: 'Blue Black', serial: 'dual', cost: 8490, price: 9990, reorder: 3, max: 10, pop: 9, desc: '6.5" Super AMOLED 90Hz, 50MP triple camera, 5000mAh battery.' },
  { code: 'SM-A25-256', cat: 'Smartphones', sup: 'metro', brand: 'Samsung', model: 'Galaxy A25 5G', name: 'Samsung Galaxy A25 5G 8GB/256GB', ram: '8GB', storage: '256GB', color: 'Light Blue', serial: 'dual', cost: 13200, price: 15490, reorder: 3, max: 8, pop: 5, desc: '6.5" Super AMOLED 120Hz, 5G, 50MP OIS camera.' },
  { code: 'SM-A55-256', cat: 'Smartphones', sup: 'metro', brand: 'Samsung', model: 'Galaxy A55 5G', name: 'Samsung Galaxy A55 5G 8GB/256GB', ram: '8GB', storage: '256GB', color: 'Awesome Navy', serial: 'dual', cost: 21500, price: 24990, reorder: 2, max: 6, pop: 3, desc: 'Metal frame, IP67, 50MP OIS camera, 5000mAh.' },
  { code: 'SM-S24-256', cat: 'Smartphones', sup: 'metro', brand: 'Samsung', model: 'Galaxy S24', name: 'Samsung Galaxy S24 8GB/256GB', ram: '8GB', storage: '256GB', color: 'Onyx Black', serial: 'dual', cost: 45000, price: 52990, reorder: 1, max: 4, pop: 1.4, freeze: 45, desc: 'Flagship, Galaxy AI, 6.2" Dynamic AMOLED 2X.' },
  { code: 'AP-IP13-128', cat: 'Smartphones', sup: 'techline', brand: 'Apple', model: 'iPhone 13', name: 'Apple iPhone 13 128GB', storage: '128GB', color: 'Midnight', serial: 'dual', cost: 30500, price: 34990, reorder: 2, max: 6, pop: 3.5, desc: 'A15 Bionic, dual 12MP camera, 6.1" Super Retina XDR.' },
  { code: 'AP-IP15-128', cat: 'Smartphones', sup: 'techline', brand: 'Apple', model: 'iPhone 15', name: 'Apple iPhone 15 128GB', storage: '128GB', color: 'Blue', serial: 'dual', cost: 45900, price: 51990, reorder: 2, max: 6, pop: 2.6, desc: 'Dynamic Island, 48MP main camera, USB-C.' },
  { code: 'AP-IP15P-256', cat: 'Smartphones', sup: 'techline', brand: 'Apple', model: 'iPhone 15 Pro', name: 'Apple iPhone 15 Pro 256GB', storage: '256GB', color: 'Natural Titanium', serial: 'dual', cost: 64000, price: 72990, reorder: 1, max: 3, pop: 1.1, freeze: 40, desc: 'Titanium design, A17 Pro, Action button.' },
  { code: 'XI-RN13-256', cat: 'Smartphones', sup: 'metro', brand: 'Xiaomi', model: 'Redmi Note 13', name: 'Xiaomi Redmi Note 13 8GB/256GB', ram: '8GB', storage: '256GB', color: 'Midnight Black', serial: 'dual', cost: 9800, price: 11999, reorder: 3, max: 10, pop: 8, desc: '6.67" AMOLED 120Hz, 108MP camera, 33W charging.' },
  { code: 'XI-R13C-128', cat: 'Smartphones', sup: 'metro', brand: 'Xiaomi', model: 'Redmi 13C', name: 'Xiaomi Redmi 13C 6GB/128GB', ram: '6GB', storage: '128GB', color: 'Navy Blue', serial: 'dual', cost: 5300, price: 6499, reorder: 4, max: 12, pop: 10, desc: '6.74" 90Hz display, 50MP camera, 5000mAh.' },
  { code: 'OP-A18-128', cat: 'Smartphones', sup: 'techline', brand: 'OPPO', model: 'A18', name: 'OPPO A18 4GB/128GB', ram: '4GB', storage: '128GB', color: 'Glowing Blue', serial: 'dual', cost: 5900, price: 7299, reorder: 3, max: 10, pop: 7, desc: '6.56" 90Hz display, 5000mAh, side fingerprint.' },
  { code: 'OP-R11-256', cat: 'Smartphones', sup: 'techline', brand: 'OPPO', model: 'Reno11 5G', name: 'OPPO Reno11 5G 12GB/256GB', ram: '12GB', storage: '256GB', color: 'Wave Green', serial: 'dual', cost: 21000, price: 24999, reorder: 2, max: 5, pop: 2, desc: '32MP telephoto portrait camera, 67W SUPERVOOC.' },
  { code: 'VI-Y17S-128', cat: 'Smartphones', sup: 'techline', brand: 'vivo', model: 'Y17s', name: 'vivo Y17s 6GB/128GB', ram: '6GB', storage: '128GB', color: 'Glitter Purple', serial: 'dual', cost: 6200, price: 7499, reorder: 3, max: 8, pop: 6, desc: '6.56" display, 50MP camera, 5000mAh.' },
  { code: 'VI-V30-256', cat: 'Smartphones', sup: 'techline', brand: 'vivo', model: 'V30 5G', name: 'vivo V30 5G 12GB/256GB', ram: '12GB', storage: '256GB', color: 'Peacock Green', serial: 'dual', cost: 22500, price: 25999, reorder: 2, max: 5, pop: 1.8, desc: 'Aura Light portrait, 50MP front and rear.' },
  { code: 'RM-C67-256', cat: 'Smartphones', sup: 'digital', brand: 'realme', model: 'C67', name: 'realme C67 8GB/256GB', ram: '8GB', storage: '256GB', color: 'Sunny Oasis', serial: 'dual', cost: 8000, price: 9499, reorder: 3, max: 8, pop: 5.5, desc: '108MP camera, 33W SUPERVOOC, 5000mAh.' },
  { code: 'RM-12PP-256', cat: 'Smartphones', sup: 'digital', brand: 'realme', model: '12 Pro+ 5G', name: 'realme 12 Pro+ 5G 12GB/256GB', ram: '12GB', storage: '256GB', color: 'Submarine Blue', serial: 'dual', cost: 19800, price: 22999, reorder: 1, max: 4, pop: 1.6, desc: 'Periscope portrait camera, curved AMOLED.' },
  { code: 'IN-HOT40P-256', cat: 'Smartphones', sup: 'digital', brand: 'Infinix', model: 'Hot 40 Pro', name: 'Infinix Hot 40 Pro 8GB/256GB', ram: '8GB', storage: '256GB', color: 'Starlit Black', serial: 'dual', cost: 6900, price: 8299, reorder: 3, max: 8, pop: 5.5, desc: '6.78" 120Hz, Helio G99, 33W charging.' },
  { code: 'TE-SPK20-128', cat: 'Smartphones', sup: 'digital', brand: 'Tecno', model: 'Spark 20', name: 'Tecno Spark 20 8GB/128GB', ram: '8GB', storage: '128GB', color: 'Gravity Black', serial: 'dual', cost: 5200, price: 6299, reorder: 3, max: 8, pop: 5.5, desc: '6.56" 90Hz, 50MP camera, dual speakers.' },
  { code: 'NK-105-4G', cat: 'Feature Phones', sup: 'digital', brand: 'Nokia', model: '105 4G', name: 'Nokia 105 4G', color: 'Charcoal', serial: 'single', cost: 1050, price: 1390, reorder: 5, max: 15, pop: 5, freeze: 24, desc: 'Dual SIM 4G, FM radio, long battery life.' },
  { code: 'NK-110-4G', cat: 'Feature Phones', sup: 'digital', brand: 'Nokia', model: '110 4G', name: 'Nokia 110 4G', color: 'Midnight Blue', serial: 'single', cost: 1450, price: 1890, reorder: 4, max: 12, pop: 4, desc: '4G calls, camera, MP3 player.' },
  { code: 'NK-3310-3G', cat: 'Feature Phones', sup: 'digital', brand: 'Nokia', model: '3310 3G', name: 'Nokia 3310 3G (Discontinued)', color: 'Warm Red', serial: 'single', cost: 2100, price: 2690, reorder: 0, max: 0, pop: 0, status: 'INACTIVE', desc: 'Discontinued model. Kept for sales history.' },
  { code: 'AP-IPAD10-64', cat: 'Tablets', sup: 'techline', brand: 'Apple', model: 'iPad (10th gen)', name: 'Apple iPad 10th Gen Wi-Fi 64GB', storage: '64GB', color: 'Silver', serial: 'serial', cost: 22000, price: 25990, reorder: 1, max: 4, pop: 1.8, desc: '10.9" Liquid Retina, A14 Bionic, USB-C.' },
  { code: 'SM-TABA9-64', cat: 'Tablets', sup: 'metro', brand: 'Samsung', model: 'Galaxy Tab A9', name: 'Samsung Galaxy Tab A9 4GB/64GB Wi-Fi', ram: '4GB', storage: '64GB', color: 'Graphite', serial: 'serial', cost: 7600, price: 8990, reorder: 2, max: 6, pop: 2.8, desc: '8.7" display, compact and light for kids and reading.' },
  { code: 'XI-PAD6-128', cat: 'Tablets', sup: 'metro', brand: 'Xiaomi', model: 'Pad 6', name: 'Xiaomi Pad 6 8GB/128GB', ram: '8GB', storage: '128GB', color: 'Gravity Gray', serial: 'serial', cost: 15500, price: 18499, reorder: 1, max: 4, pop: 1.3, freeze: 50, desc: '11" 144Hz 2.8K display, Snapdragon 870.' },
  { code: 'CHG-AP-20W', cat: 'Chargers', sup: 'powercell', brand: 'Apple', name: 'Apple 20W USB-C Power Adapter', cost: 950, price: 1390, reorder: 5, max: 20, pop: 4 },
  { code: 'CHG-SM-25W', cat: 'Chargers', sup: 'powercell', brand: 'Samsung', name: 'Samsung 25W Super Fast Charger', cost: 690, price: 990, reorder: 5, max: 20, pop: 4.5 },
  { code: 'CHG-ANK-30W', cat: 'Chargers', sup: 'powercell', brand: 'Anker', name: 'Anker Nano 30W USB-C Charger', cost: 1050, price: 1499, reorder: 4, max: 15, pop: 2.5 },
  { code: 'CHG-UGR-65W', cat: 'Chargers', sup: 'powercell', brand: 'Ugreen', name: 'Ugreen Nexode 65W GaN Charger', cost: 1650, price: 2290, reorder: 2, max: 8, pop: 1.2, freeze: 40 },
  { code: 'CBL-CC-1M', cat: 'Cables', sup: 'accessory', brand: 'Generic', name: 'USB-C to USB-C Cable 1m', cost: 120, price: 249, reorder: 10, max: 40, pop: 7 },
  { code: 'CBL-CL-1M', cat: 'Cables', sup: 'accessory', brand: 'Generic', name: 'USB-C to Lightning Cable 1m', cost: 180, price: 349, reorder: 10, max: 30, pop: 5, freeze: 26 },
  { code: 'CBL-BRD-2M', cat: 'Cables', sup: 'accessory', brand: 'Baseus', name: 'Baseus Braided USB-C Cable 2m', cost: 220, price: 399, reorder: 6, max: 25, pop: 3.5 },
  { code: 'CBL-MICRO-1M', cat: 'Cables', sup: 'accessory', brand: 'Generic', name: 'Micro USB Cable 1m', cost: 60, price: 149, reorder: 10, max: 30, pop: 3 },
  { code: 'CSE-IP15-CLR', cat: 'Phone Cases', sup: 'accessory', brand: 'Generic', name: 'iPhone 15 Clear MagSafe Case', cost: 150, price: 399, reorder: 6, max: 25, pop: 3.5, freeze: 32 },
  { code: 'CSE-A15-SIL', cat: 'Phone Cases', sup: 'accessory', brand: 'Generic', name: 'Galaxy A15 Silicone Case', cost: 90, price: 249, reorder: 6, max: 25, pop: 4 },
  { code: 'CSE-RN13-SHK', cat: 'Phone Cases', sup: 'accessory', brand: 'Generic', name: 'Redmi Note 13 Shockproof Case', cost: 100, price: 279, reorder: 6, max: 25, pop: 3.5 },
  { code: 'CSE-UNI-FLIP', cat: 'Phone Cases', sup: 'accessory', brand: 'Generic', name: 'Universal Flip Wallet Case', cost: 130, price: 299, reorder: 5, max: 20, pop: 2.5 },
  { code: 'SP-IP15-TG', cat: 'Screen Protectors', sup: 'accessory', brand: 'Generic', name: 'iPhone 15 Tempered Glass', cost: 60, price: 199, reorder: 10, max: 40, pop: 5 },
  { code: 'SP-A15-TG', cat: 'Screen Protectors', sup: 'accessory', brand: 'Generic', name: 'Galaxy A15 Tempered Glass', cost: 45, price: 149, reorder: 10, max: 40, pop: 5.5 },
  { code: 'SP-UNI-PRV', cat: 'Screen Protectors', sup: 'accessory', brand: 'Generic', name: 'Privacy Tempered Glass (Universal 6.5")', cost: 80, price: 249, reorder: 8, max: 30, pop: 4 },
  { code: 'EAR-AP-AIR2', cat: 'Earphones', sup: 'soundwave', brand: 'Apple', name: 'Apple AirPods (2nd Gen)', cost: 6300, price: 7490, reorder: 2, max: 6, pop: 1.2 },
  { code: 'EAR-SM-BFE', cat: 'Earphones', sup: 'soundwave', brand: 'Samsung', name: 'Samsung Galaxy Buds FE', cost: 3900, price: 4990, reorder: 2, max: 6, pop: 1.4, freeze: 30 },
  { code: 'EAR-JBL-T110', cat: 'Earphones', sup: 'soundwave', brand: 'JBL', name: 'JBL Tune 110 Wired Earphones', cost: 380, price: 599, reorder: 5, max: 20, pop: 4 },
  { code: 'EAR-QCY-T13', cat: 'Earphones', sup: 'soundwave', brand: 'QCY', name: 'QCY T13 True Wireless Earbuds', cost: 650, price: 999, reorder: 5, max: 20, pop: 3.5 },
  { code: 'PB-ANK-10K', cat: 'Power Banks', sup: 'powercell', brand: 'Anker', name: 'Anker PowerCore 10000mAh', cost: 1050, price: 1490, reorder: 4, max: 15, pop: 2.5 },
  { code: 'PB-XI-20K', cat: 'Power Banks', sup: 'powercell', brand: 'Xiaomi', name: 'Xiaomi Power Bank 20000mAh 22.5W', cost: 1100, price: 1599, reorder: 4, max: 15, pop: 3 },
  { code: 'PB-RMS-30K', cat: 'Power Banks', sup: 'powercell', brand: 'Romoss', name: 'Romoss Sense 8P+ 30000mAh', cost: 1150, price: 1699, reorder: 3, max: 12, pop: 2, freeze: 35 },
  { code: 'OTH-SD-128', cat: 'Other Accessories', sup: 'soundwave', brand: 'SanDisk', name: 'SanDisk Ultra 128GB microSD Card', cost: 450, price: 699, reorder: 5, max: 20, pop: 3 },
  { code: 'OTH-RING-HLD', cat: 'Other Accessories', sup: 'accessory', brand: 'Generic', name: 'Phone Ring Holder', cost: 25, price: 99, reorder: 10, max: 40, pop: 3.5 },
  { code: 'OTH-CAR-MNT', cat: 'Other Accessories', sup: 'accessory', brand: 'Generic', name: 'Magnetic Car Phone Mount', cost: 220, price: 449, reorder: 4, max: 15, pop: 1.5 }
]

const CUSTOMERS = [
  ['Ana Dizon', 'Marikina City'], ['Mark Villanueva', 'Pasig City'], ['Carla Mendoza', 'Quezon City'], ['Jerome Bautista', 'Taguig City'],
  ['Liza Navarro', 'Makati City'], ['Ramon Aquino', 'Mandaluyong City'], ['Kristine Flores', 'Quezon City'], ['Paul Castillo', 'Manila'],
  ['Joy Ramirez', 'Caloocan City'], ['Christian Torres', 'Pasig City'], ['Bea Gonzales', 'Marikina City'], ['Nico Fernandez', 'San Juan City'],
  ['Patricia Lim', 'Makati City'], ['Daniel Pascual', 'Parañaque City'], ['Grace Domingo', 'Quezon City'], ['Miguel Salazar', 'Taguig City'],
  ['Erika Manalo', 'Pasay City'], ['Vincent Ocampo', 'Manila'], ['Rhea Soriano', 'Valenzuela City'], ['Adrian Valdez', 'Las Piñas City'],
  ['Sofia Javier', 'Muntinlupa City'], ['Kenneth Cruz', 'Marikina City'], ['Jasmine Rivera', 'Pasig City'], ['Luis Mercado', 'Quezon City'],
  ['Camille Tan', 'Mandaluyong City'], ['Ryan Garcia', 'Antipolo City'], ['Nicole Robles', 'Cainta, Rizal'], ['Brian Santiago', 'Makati City'],
  ['Northpoint BPO Services', 'Taguig City', 'Corporate account. Bulk orders for staff phones; bank transfer only.'],
  ['St. Jude Learning Center', 'Marikina City', 'School account. Tablets for classroom use.']
]
const STREETS = ['Mabini St.', 'Rizal Ave.', 'Bonifacio St.', 'Luna St.', 'Del Pilar St.', 'Aguinaldo Hwy.', 'Katipunan Ave.', 'Shaw Blvd.', 'J.P. Laurel St.', 'Sampaguita St.']

const CANCEL_REASONS = ['Customer changed mind before leaving the counter', 'Wrong item scanned', 'Duplicate transaction', 'GCash payment did not go through', 'Price correction, re-rung under a new invoice']
const RETURN_REASONS = {
  GOOD: ['Changed mind within 7 days, unopened', 'Wrong model purchased', 'Not compatible with customer device', 'Gift duplicate, exchanged for store credit'],
  DEFECTIVE: ['Not charging properly', 'Screen flicker on arrival', 'Left earbud has no sound', 'Charging port loose', 'Cable stopped working after 2 days'],
  DAMAGED: ['Cracked glass discovered on opening', 'Case arrived with a torn seam']
}

export async function seedDemoData(connection, { log = console.log } = {}) {
  const [[{ total: productCount }]] = await connection.query('SELECT COUNT(*) total FROM products')
  if (productCount > 0) return false
  log('Seeding demo data (products, purchases, sales, returns, logs)...')

  const random = mulberry32(20261114)
  const pick = (list) => list[Math.floor(random() * list.length)]
  const between = (min, max) => min + Math.floor(random() * (max - min + 1))
  const chance = (p) => random() < p
  const weighted = (items, weightOf) => {
    const sum = items.reduce((total, item) => total + weightOf(item), 0)
    if (sum <= 0) return null
    let roll = random() * sum
    for (const item of items) { roll -= weightOf(item); if (roll <= 0) return item }
    return items[items.length - 1]
  }

  // ---- time helpers (all simulation times are epoch ms; wall-clock hours are in the shop's timezone)
  const offset = config.timezoneOffsetMinutes * MINUTE
  const nowMs = Date.now()
  const localNow = new Date(nowMs + offset)
  const [year, month, day] = [localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()]
  const nowLocalMinutes = localNow.getUTCHours() * 60 + localNow.getUTCMinutes()
  const at = (daysAgo, minutesOfDay) => Date.UTC(year, month, day - daysAgo, 0, minutesOfDay) - offset
  const localDay = (ms) => new Date(ms + offset).toISOString().slice(0, 10)
  const dateKey = (ms) => localDay(ms).replaceAll('-', '')
  const daysAgoOf = (ms) => (nowMs - ms) / DAY
  const dt = (ms) => new Date(ms)
  const nextId = async (table) => (await connection.query(`SELECT COALESCE(MAX(id), 0) + 1 next FROM \`${table}\``))[0][0].next

  await connection.beginTransaction()
  try {
    // ---- users
    const cashierHash = await bcrypt.hash(config.cashierPassword, 10)
    await connection.query(
      'INSERT IGNORE INTO users (name, email, password_hash, role, status, created_at) VALUES ?',
      [STAFF.map((person) => [person.name, person.email, cashierHash, 'CASHIER', person.status, dt(at(person.since, 540))])]
    )
    const [userRows] = await connection.query('SELECT id, name, email, role FROM users')
    const owner = userRows.find((user) => user.role === 'OWNER')
    if (!owner) throw new Error('Owner account must exist before seeding demo data.')
    const staff = STAFF.map((person) => ({ ...person, id: userRows.find((user) => user.email === person.email)?.id })).filter((person) => person.id)
    const activeStaff = staff.filter((person) => person.status === 'ACTIVE')

    // ---- categories
    const [categoryRows] = await connection.query('SELECT id, category_name FROM categories')
    const categoryId = Object.fromEntries(categoryRows.map((row) => [row.category_name, row.id]))

    // ---- suppliers
    let supplierId = await nextId('suppliers')
    const suppliers = SUPPLIERS.map((supplier) => ({ ...supplier, id: supplierId++ }))
    const supplierByKey = Object.fromEntries(suppliers.map((supplier) => [supplier.key, supplier]))

    // ---- customers
    let customerId = await nextId('customers')
    const customers = CUSTOMERS.map(([fullName, city, notes], index) => {
      const id = customerId++
      const first = fullName.split(' ')[0].toLowerCase()
      const last = fullName.split(' ').slice(-1)[0].toLowerCase()
      return {
        id,
        code: `CUS-${String(id).padStart(4, '0')}`,
        full_name: fullName,
        phone: `+63 9${between(15, 99)} ${between(100, 999)} ${between(1000, 9999)}`,
        email: notes ? `purchasing@${last}.example.com` : index % 3 === 2 ? null : `${first}.${last}@example.com`,
        address: `${between(1, 250)} ${pick(STREETS)}, ${city}`,
        notes: notes || null,
        created_at: at(between(62, 160), between(600, 1140)),
        status: index === 7 ? 'INACTIVE' : 'ACTIVE',
        weight: notes ? 0.6 : 0.5 + random() * 2
      }
    })
    const activeCustomers = customers.filter((customer) => customer.status === 'ACTIVE')

    // ---- products (simulation state)
    let productId = await nextId('products')
    const products = CATALOG.map((item) => ({
      ...item,
      id: productId++,
      status: item.status || 'ACTIVE',
      stock: 0,
      units: [],
      tac: `${item.brand === 'Samsung' || item.brand === 'Apple' ? '35' : '86'}${String(between(100000, 999999))}`
    }))
    const devices = products.filter((product) => product.serial && product.status === 'ACTIVE')
    const accessories = products.filter((product) => !product.serial && product.status === 'ACTIVE')

    const ids = {
      unit: await nextId('product_units'), purchase: await nextId('purchases'), purchaseItem: await nextId('purchase_items'),
      sale: await nextId('sales'), saleItem: await nextId('sale_items'), payment: await nextId('payments'),
      return: await nextId('returns'), returnItem: await nextId('return_items'), log: await nextId('inventory_logs'), audit: await nextId('audit_logs')
    }
    const units = []
    const purchases = []
    const purchaseItems = []
    const sales = []
    const returns = []
    const returnItems = []
    const logs = []
    const audits = []
    const usedIdentifiers = new Set()
    const activity = [] // [userId, time] for generating login audits

    const audit = (userId, action, entity, entityId, description, time) => {
      audits.push([ids.audit++, userId, action, entity, entityId, description, null, dt(time)])
    }
    const move = (product, type, quantity, time, referenceType, referenceId, remarks, userId, unitId = null) => {
      const previous = product.stock
      product.stock = previous + quantity
      if (product.stock < 0) throw new Error(`Demo seed produced negative stock for ${product.code}`)
      logs.push([ids.log++, product.id, unitId, type, quantity, previous, product.stock, referenceType, referenceId, remarks, userId, dt(time)])
    }
    const luhn = (body) => {
      let sum = 0
      for (let i = 0; i < body.length; i++) {
        let digit = Number(body[body.length - 1 - i])
        if (i % 2 === 0) { digit *= 2; if (digit > 9) digit -= 9 }
        sum += digit
      }
      return String((10 - (sum % 10)) % 10)
    }
    const uniqueIdentifier = (make) => {
      for (;;) { const value = make(); if (!usedIdentifiers.has(value)) { usedIdentifiers.add(value); return value } }
    }
    const makeUnit = (product, reference, time) => {
      let imei = null
      let imei2 = null
      let serialNumber = null
      if (product.serial === 'serial') {
        const prefix = product.brand === 'Apple' ? 'DMP' : product.brand === 'Samsung' ? 'R9' : 'XP'
        serialNumber = uniqueIdentifier(() => prefix + Array.from({ length: 9 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'[between(0, 33)]).join(''))
      } else {
        const makeImei = () => { const body = `${product.tac}${String(between(100000, 999999))}`; return body + luhn(body) }
        imei = uniqueIdentifier(makeImei)
        if (product.serial === 'dual') imei2 = uniqueIdentifier(makeImei)
      }
      const unit = { id: ids.unit++, product, imei, imei2, serialNumber, status: 'IN_STOCK', cost: product.cost, price: product.price, purchaseReference: reference, saleReference: null, warrantyUntil: null, created: time }
      units.push(unit)
      return unit
    }

    // ---- purchasing
    const createPurchase = (supplier, lines, time, note) => {
      const id = ids.purchase++
      const reference = `PO-${dateKey(time)}-${String(id).padStart(4, '0')}`
      let subtotal = 0
      for (const { product, quantity } of lines) {
        const lineTotal = quantity * product.cost
        subtotal += lineTotal
        purchaseItems.push([ids.purchaseItem++, id, product.id, quantity, product.cost, lineTotal])
        if (product.serial) for (let i = 0; i < quantity; i++) product.units.push(makeUnit(product, reference, time))
        move(product, 'PURCHASE', quantity, time, 'PURCHASE', id, `Received via ${reference}`, owner.id)
      }
      const discount = subtotal >= 100000 ? Math.round(subtotal * 0.01) : 0
      const age = daysAgoOf(time)
      const paymentStatus = age > 21 ? 'PAID' : age > 7 ? pick(['PAID', 'PAID', 'PARTIAL']) : pick(['UNPAID', 'PARTIAL', 'PAID'])
      purchases.push([id, supplier.id, reference, localDay(time), subtotal, discount, subtotal - discount, paymentStatus, note, owner.id, dt(time)])
      audit(owner.id, 'PURCHASE_CREATE', 'PURCHASE', id, `Received ${reference} from ${supplier.supplier_name} (${lines.length} item${lines.length > 1 ? 's' : ''})`, time)
      activity.push([owner.id, time])
    }
    const restock = (time, initial) => {
      const groups = new Map()
      for (const product of products) {
        if (product.status !== 'ACTIVE' || product.max === 0) continue
        if (!initial && product.freeze && daysAgoOf(time) < product.freeze) continue
        if (!initial && product.stock > product.reorder) continue
        const quantity = product.max - product.stock
        if (quantity <= 0) continue
        if (!groups.has(product.sup)) groups.set(product.sup, [])
        groups.get(product.sup).push({ product, quantity })
      }
      let index = 0
      for (const [key, lines] of groups) createPurchase(supplierByKey[key], lines, time + index++ * 7 * MINUTE, initial ? 'Opening stock for the new shop system' : 'Restock order (reorder level reached)')
    }

    // ---- selling
    const cashierFor = (time) => {
      const daysAgo = daysAgoOf(time)
      const onDuty = staff.filter((person) => person.status === 'ACTIVE' ? daysAgo <= person.since : daysAgo > (person.leftDaysAgo || 0))
      return chance(0.08) ? { id: owner.id, name: owner.name } : weighted(onDuty, (person) => person.weight)
    }
    const queue = []
    let sequence = 0
    const schedule = (time, run) => { if (time <= nowMs - MINUTE) queue.push({ time, seq: sequence++, run }) }

    const cancelSale = (sale, time) => {
      if (sale.status !== 'COMPLETED' || sale.refunded > 0) return
      const reason = pick(CANCEL_REASONS)
      for (const item of sale.items) {
        if (item.unit) {
          Object.assign(item.unit, { status: 'IN_STOCK', saleReference: null, warrantyUntil: null })
          item.product.units.unshift(item.unit)
        }
        move(item.product, 'CANCELLATION', item.quantity, time, 'SALE', sale.id, reason, owner.id, item.unit?.id ?? null)
      }
      Object.assign(sale, { status: 'CANCELLED', cancellationReason: reason, cancelledBy: owner.id, cancelledAt: time })
      sale.payment.status = 'VOIDED'
      audit(owner.id, 'SALE_CANCEL', 'SALE', sale.id, `Cancelled ${sale.invoice}: ${reason}`, time)
      activity.push([owner.id, time])
    }

    const processReturn = (sale, time) => {
      if (sale.status !== 'COMPLETED') return
      const candidates = sale.items.filter((item) => item.quantity - item.returned > 0)
      if (!candidates.length) return
      const item = pick(candidates)
      const quantity = item.unit ? 1 : Math.min(item.quantity - item.returned, chance(0.7) ? 1 : item.quantity - item.returned)
      const condition = weighted(['GOOD', 'DEFECTIVE', 'DAMAGED'], (value) => ({ GOOD: 5, DEFECTIVE: 4, DAMAGED: 1 })[value])
      const reason = pick(RETURN_REASONS[condition])
      const refund = Math.min(item.unitPrice * quantity - (item.discount * quantity) / item.quantity, sale.total - sale.refunded)
      if (refund <= 0) return
      const processor = weighted(activeStaff.filter((person) => daysAgoOf(time) <= person.since), (person) => person.weight) || { id: owner.id }
      const id = ids.return++
      const reference = `RET-${dateKey(time)}-${String(id).padStart(4, '0')}`
      const method = ['CASH', 'GCASH'].includes(sale.payment.method) ? sale.payment.method : 'CASH'
      returns.push([id, reference, sale.id, sale.customerId, processor.id, dt(time), reason, refund, method, method === 'GCASH' ? `GC${between(100000000, 999999999)}` : null, 'COMPLETED', condition === 'GOOD' ? 'Item inspected and returned to shelf.' : 'Item set aside for supplier warranty claim.', dt(time)])
      returnItems.push([ids.returnItem++, id, item.id, item.product.id, item.unit?.id ?? null, quantity, refund, condition, reason])
      item.returned += quantity
      sale.refunded += refund
      if (condition === 'GOOD') {
        if (item.unit) {
          Object.assign(item.unit, { status: 'IN_STOCK', saleReference: null, warrantyUntil: null })
          item.product.units.push(item.unit)
        }
        move(item.product, 'RETURN', quantity, time, 'RETURN', id, reason, processor.id, item.unit?.id ?? null)
      } else if (item.unit) {
        item.unit.status = condition
      }
      if (sale.items.every((line) => line.returned >= line.quantity)) sale.status = 'RETURNED'
      audit(processor.id, 'RETURN', 'RETURN', id, `Processed return ${reference} for ${sale.invoice}`, time)
      activity.push([processor.id, time])
    }

    const makeSale = (time) => {
      const cashier = cashierFor(time)
      if (!cashier) return
      const lines = []
      const isDeviceSale = chance(0.32)
      if (isDeviceSale) {
        const device = weighted(devices.filter((product) => product.units.length > 0), (product) => product.pop)
        if (device) {
          const count = device.cat === 'Tablets' && chance(0.08) ? Math.min(2, device.units.length) : 1
          for (let i = 0; i < count; i++) lines.push({ product: device, unit: device.units.shift(), quantity: 1 })
        }
      }
      const accessoryCount = lines.length ? (chance(0.55) ? between(1, 2) : 0) : 1 + (chance(0.35) ? 1 : 0) + (chance(0.1) ? 1 : 0)
      for (let i = 0; i < accessoryCount; i++) {
        const options = accessories.filter((product) => product.stock > 0 && !lines.some((line) => line.product === product))
        const boost = (product) => product.pop * (lines.length && ['Phone Cases', 'Screen Protectors', 'Chargers'].includes(product.cat) ? 2 : 1)
        const accessory = weighted(options, boost)
        if (!accessory) break
        const quantity = Math.min(accessory.stock, ['Cables', 'Screen Protectors', 'Other Accessories'].includes(accessory.cat) && chance(0.25) ? 2 : 1)
        lines.push({ product: accessory, unit: null, quantity })
      }
      if (!lines.length) return

      const id = ids.sale++
      const invoice = `INV-${dateKey(time)}-${String(id).padStart(5, '0')}`
      const items = lines.map(({ product, unit, quantity }) => ({
        id: ids.saleItem++, product, unit, quantity, unitPrice: unit ? unit.price : product.price, unitCost: unit ? unit.cost : product.cost, discount: 0, returned: 0
      }))
      const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice - item.discount, 0)
      let discount = 0
      if (isDeviceSale && lines[0].unit && chance(0.18)) discount = pick([200, 300, 500, 1000].filter((value) => value <= subtotal * 0.05)) || 0
      else if (subtotal >= 500 && chance(0.08)) discount = pick([20, 50, 100])
      const total = subtotal - discount
      const method = isDeviceSale && lines[0].unit
        ? weighted(['CASH', 'GCASH', 'CARD', 'BANK_TRANSFER'], (value) => ({ CASH: 40, GCASH: 25, CARD: 22, BANK_TRANSFER: 13 })[value])
        : weighted(['CASH', 'GCASH', 'CARD', 'OTHER'], (value) => ({ CASH: 58, GCASH: 34, CARD: 6, OTHER: 2 })[value])
      const step = total >= 5000 ? 1000 : total >= 1000 ? 500 : 100
      const tendered = method === 'CASH' ? (chance(0.3) ? total : Math.ceil((total + 1) / step) * step) : total
      const referenceNumber = method === 'GCASH' ? `${between(1000, 9999)}${between(100000000, 999999999)}` : method === 'CARD' ? `AUTH-${between(100000, 999999)}` : method === 'BANK_TRANSFER' ? `BT-${between(10000000, 99999999)}` : method === 'OTHER' ? `MAYA-${between(1000000, 9999999)}` : null
      const customer = chance(lines.some((line) => line.unit) ? 0.72 : 0.32) ? weighted(activeCustomers, (entry) => entry.weight) : null

      const sale = {
        id, invoice, time, cashierId: cashier.id, customerId: customer?.id ?? null, items, subtotal, discount, total,
        tendered, change: tendered - total, status: 'COMPLETED', refunded: 0,
        payment: { id: ids.payment++, method, amount: total, reference: referenceNumber, status: 'COMPLETED' },
        notes: lines.some((line) => line.unit) && chance(0.25) ? pick(['Free screen protector installed', 'Customer registered for 1-year warranty', 'Data transfer assisted']) : null
      }
      for (const item of items) {
        if (item.unit) {
          const warranty = new Date(time + offset)
          warranty.setUTCFullYear(warranty.getUTCFullYear() + 1)
          Object.assign(item.unit, { status: 'SOLD', saleReference: invoice, warrantyUntil: warranty.toISOString().slice(0, 10) })
        }
        move(item.product, 'SALE', -item.quantity, time, 'SALE', id, `Sold via ${invoice}`, cashier.id, item.unit?.id ?? null)
      }
      sales.push(sale)
      audit(cashier.id, 'SALE_CREATE', 'SALE', id, `Completed sale ${invoice} (₱${total.toLocaleString('en-PH')})`, time)
      activity.push([cashier.id, time])

      if (chance(0.03)) schedule(time + between(10, 90) * MINUTE, (when) => cancelSale(sale, when))
      else if (chance(0.03)) schedule(time + between(1, 6) * DAY + between(-120, 120) * MINUTE, (when) => processReturn(sale, when))
    }

    const adjust = (time) => {
      if (chance(0.25)) {
        const device = pick(devices.filter((product) => product.units.length >= 2))
        if (!device) return
        const unit = device.units.pop()
        unit.status = 'DAMAGED'
        const remarks = 'Display unit dropped, screen cracked; set aside for repair'
        move(device, 'DAMAGE', -1, time, 'MANUAL', null, remarks, owner.id, unit.id)
        audit(owner.id, 'INVENTORY_ADJUSTMENT', 'PRODUCT', device.id, `${remarks} (${device.name})`, time)
        return
      }
      const product = pick(accessories.filter((item) => item.stock >= 3))
      if (!product) return
      const kind = pick([
        { quantity: -1, type: 'ADJUSTMENT', remarks: 'Cycle count correction, 1 unit short' },
        { quantity: 1, type: 'ADJUSTMENT', remarks: 'Cycle count correction, extra unit found in stockroom' },
        { quantity: -1, type: 'DAMAGE', remarks: 'Damaged packaging, written off' },
        { quantity: -2, type: 'DAMAGE', remarks: 'Water damage in storage, written off' }
      ])
      move(product, kind.type, kind.quantity, time, 'MANUAL', null, kind.remarks, owner.id)
      audit(owner.id, 'INVENTORY_ADJUSTMENT', 'PRODUCT', product.id, `${kind.remarks} (${product.name})`, time)
      activity.push([owner.id, time])
    }

    // ---- build the event timeline
    schedule(at(90, 600), (time) => restock(time, true))
    for (let daysAgo = 87; daysAgo >= 0; daysAgo -= 3) schedule(at(daysAgo, 510), (time) => restock(time, false))
    for (let daysAgo = 60; daysAgo >= 0; daysAgo--) {
      const weekday = new Date(at(daysAgo, 720) + offset).getUTCDay()
      const dayOfMonth = new Date(at(daysAgo, 720) + offset).getUTCDate()
      let count = weekday === 0 || weekday === 6 ? between(7, 12) : between(4, 8)
      if ([15, 30, 31].includes(dayOfMonth)) count += 3
      let open = 570
      let close = 1230
      if (daysAgo === 0) {
        close = Math.min(close, nowLocalMinutes - 3)
        if (close - open < 45) { open = Math.max(0, close - 150); count = Math.min(count, 3) } else count = Math.max(3, Math.round((count * (close - open)) / 660))
        if (close <= open) count = 0
      }
      for (let i = 0; i < count; i++) schedule(at(daysAgo, open + random() * (close - open)), (time) => makeSale(time))
    }
    for (let i = 0; i < 9; i++) schedule(at(between(1, 58), between(1140, 1200)), (time) => adjust(time))

    while (queue.length) {
      let next = 0
      for (let i = 1; i < queue.length; i++) {
        if (queue[i].time < queue[next].time || (queue[i].time === queue[next].time && queue[i].seq < queue[next].seq)) next = i
      }
      const [event] = queue.splice(next, 1)
      event.run(event.time)
    }

    for (const product of products) {
      if (product.serial && product.stock !== product.units.length) throw new Error(`Demo seed unit mismatch for ${product.code}`)
    }

    // ---- login audit trail and setup audits
    const firstActivity = new Map()
    for (const [userId, time] of activity) {
      const key = `${userId}:${localDay(time)}`
      if (!firstActivity.has(key) || firstActivity.get(key) > time) firstActivity.set(key, time)
    }
    const lastLogin = new Map()
    for (const [key, time] of firstActivity) {
      const userId = Number(key.split(':')[0])
      const localMidnight = Date.parse(`${localDay(time)}T00:00:00Z`) - offset
      const loginTime = Math.max(time - between(5, 35) * MINUTE, localMidnight)
      audit(userId, 'LOGIN', 'USER', userId, 'Signed in', loginTime)
      if (!lastLogin.has(userId) || lastLogin.get(userId) < loginTime) lastLogin.set(userId, loginTime)
    }
    for (const person of staff) audit(owner.id, 'USER_CREATE', 'USER', person.id, `Created cashier account for ${person.name}`, at(person.since, 540))
    const paolo = staff.find((person) => person.status === 'INACTIVE')
    if (paolo) audit(owner.id, 'USER_UPDATE', 'USER', paolo.id, `Deactivated ${paolo.name} (resigned)`, at(paolo.leftDaysAgo, 1110))
    for (const supplier of suppliers) audit(owner.id, 'CREATE', 'SUPPLIER', supplier.id, `Created supplier ${supplier.supplier_name}`, at(95, 600))
    for (const product of products) audit(owner.id, 'CREATE', 'PRODUCT', product.id, `Created product ${product.name}`, at(92, 600))
    audit(owner.id, 'SETTINGS_UPDATE', 'SETTINGS', null, 'Updated business settings', at(93, 600))

    // ---- write everything
    const insert = async (table, columns, rows) => {
      for (let i = 0; i < rows.length; i += 400) {
        await connection.query(`INSERT INTO \`${table}\` (${columns.join(', ')}) VALUES ?`, [rows.slice(i, i + 400)])
      }
    }
    await insert('suppliers', ['id', 'supplier_name', 'contact_person', 'phone', 'email', 'address', 'status', 'notes', 'created_at'],
      suppliers.map((s) => [s.id, s.supplier_name, s.contact_person, s.phone, s.email, s.address, s.status || 'ACTIVE', s.notes, dt(at(95, 600))]))
    await insert('customers', ['id', 'customer_code', 'full_name', 'phone', 'email', 'address', 'notes', 'status', 'created_at'],
      customers.map((c) => [c.id, c.code, c.full_name, c.phone, c.email, c.address, c.notes, c.status, dt(c.created_at)]))
    await insert('products', ['id', 'category_id', 'supplier_id', 'product_code', 'brand', 'model', 'product_name', 'variant', 'storage', 'ram', 'color', 'description', 'is_serialized', 'stock_quantity', 'cost_price', 'selling_price', 'reorder_level', 'status', 'created_at'],
      products.map((p) => [p.id, categoryId[p.cat], supplierByKey[p.sup].id, p.code, p.brand, p.model || null, p.name, null, p.storage || null, p.ram || null, p.color || null, p.desc || null, Boolean(p.serial), p.stock, p.cost, p.price, p.reorder, p.status, dt(at(92, 600))]))
    await insert('product_units', ['id', 'product_id', 'imei', 'imei2', 'serial_number', 'unit_status', 'cost_price', 'selling_price', 'purchase_reference', 'sale_reference', 'warranty_until', 'created_at'],
      units.map((u) => [u.id, u.product.id, u.imei, u.imei2, u.serialNumber, u.status, u.cost, u.price, u.purchaseReference, u.saleReference, u.warrantyUntil, dt(u.created)]))
    await insert('purchases', ['id', 'supplier_id', 'reference_number', 'purchase_date', 'subtotal', 'discount', 'total', 'payment_status', 'notes', 'created_by', 'created_at'], purchases)
    await insert('purchase_items', ['id', 'purchase_id', 'product_id', 'quantity', 'unit_cost', 'subtotal'], purchaseItems)
    await insert('sales', ['id', 'invoice_number', 'customer_id', 'processed_by', 'sale_date', 'subtotal', 'discount', 'total', 'amount_tendered', 'change_due', 'payment_status', 'status', 'cancellation_reason', 'cancelled_by', 'cancelled_at', 'notes', 'created_at'],
      sales.map((s) => [s.id, s.invoice, s.customerId, s.cashierId, dt(s.time), s.subtotal, s.discount, s.total, s.tendered, s.change, 'PAID', s.status, s.cancellationReason || null, s.cancelledBy || null, s.cancelledAt ? dt(s.cancelledAt) : null, s.notes, dt(s.time)]))
    await insert('sale_items', ['id', 'sale_id', 'product_id', 'product_unit_id', 'quantity', 'unit_price', 'unit_cost', 'discount', 'subtotal'],
      sales.flatMap((s) => s.items.map((i) => [i.id, s.id, i.product.id, i.unit?.id ?? null, i.quantity, i.unitPrice, i.unitCost, i.discount, i.quantity * i.unitPrice - i.discount])))
    await insert('payments', ['id', 'sale_id', 'payment_method', 'amount', 'reference_number', 'payment_status', 'paid_at', 'created_by', 'created_at'],
      sales.map((s) => [s.payment.id, s.id, s.payment.method, s.payment.amount, s.payment.reference, s.payment.status, dt(s.time), s.cashierId, dt(s.time)]))
    await insert('returns', ['id', 'return_reference', 'sale_id', 'customer_id', 'processed_by', 'return_date', 'reason', 'refund_amount', 'refund_method', 'refund_reference', 'status', 'notes', 'created_at'], returns)
    await insert('return_items', ['id', 'return_id', 'sale_item_id', 'product_id', 'product_unit_id', 'quantity', 'refund_amount', 'item_condition', 'reason'], returnItems)
    await insert('inventory_logs', ['id', 'product_id', 'product_unit_id', 'movement_type', 'quantity', 'previous_quantity', 'new_quantity', 'reference_type', 'reference_id', 'remarks', 'created_by', 'created_at'], logs)
    audits.sort((a, b) => a[7] - b[7])
    audits.forEach((row, index) => { row[0] = ids.audit - audits.length + index })
    await insert('audit_logs', ['id', 'user_id', 'action', 'entity_type', 'entity_id', 'description', 'metadata', 'created_at'], audits)

    for (const [userId, time] of lastLogin) await connection.query('UPDATE users SET last_login_at = ? WHERE id = ?', [dt(time), userId])
    const settings = { business_address: '123 Rizal Avenue, Poblacion, Marikina City, Metro Manila', business_phone: '+63 917 555 0199', business_email: 'hello@renniels.local', tax_id: '000-123-456-000' }
    for (const [key, value] of Object.entries(settings)) {
      await connection.query("UPDATE settings SET setting_value = ? WHERE setting_key = ? AND setting_value = ''", [value, key])
    }

    await connection.commit()
    log(`Demo data: ${products.length} products, ${units.length} serialized units, ${purchases.length} purchases, ${sales.length} sales, ${returns.length} returns, ${logs.length} inventory logs.`)
    return true
  } catch (error) {
    await connection.rollback()
    throw error
  }
}
