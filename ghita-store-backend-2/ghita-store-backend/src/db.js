const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "store.db");
require("fs").mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  price REAL NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  rating REAL DEFAULT 4.5,
  description TEXT,
  images TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  village TEXT NOT NULL,
  address TEXT NOT NULL,
  items TEXT NOT NULL,
  subtotal REAL NOT NULL,
  delivery REAL NOT NULL,
  total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  role TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_logs(session_id);
`);

// بيانات أولية لو الجدول فاضي
const productCount = db.prepare("SELECT COUNT(*) AS c FROM products").get().c;
if (productCount === 0) {
  const insert = db.prepare(`
    INSERT INTO products (name, category, subcategory, price, stock, rating, images)
    VALUES (@name, @category, @subcategory, @price, @stock, @rating, @images)
  `);
  const seed = [
    { name: "سماعة هيدفون Q10i", category: "electronics", subcategory: null, price: 349.99, stock: 20, rating: 4.6, images: "[]" },
    { name: "رام Lenovo 2 جيجا DDR3", category: "electronics", subcategory: null, price: 99.99, stock: 20, rating: 4.5, images: "[]" },
  ];
  const insertMany = db.transaction((rows) => rows.forEach((r) => insert.run(r)));
  insertMany(seed);
}

const catCount = db.prepare("SELECT COUNT(*) AS c FROM categories").get().c;
if (catCount === 0) {
  const insertCat = db.prepare("INSERT INTO categories (id, name, icon) VALUES (?, ?, ?)");
  insertCat.run("electronics", "إلكترونيات", "💻");
  insertCat.run("games", "ألعاب", "🎮");
}

module.exports = db;
