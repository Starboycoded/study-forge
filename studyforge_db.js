const { Pool } = require("pg");

// PostgreSQL connection pool
// Uses DATABASE_URL env var (standard for Render, Railway, Supabase, Neon, etc.)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false } // Required for Render/Heroku managed Postgres
    : false,
  max: 10,              // max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on("error", (err) => {
  console.error("Unexpected DB pool error:", err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
