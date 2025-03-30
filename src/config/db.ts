import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config(); // Cargar variables de entorno desde .env

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 5432,
  ssl: false,
});

export default pool;