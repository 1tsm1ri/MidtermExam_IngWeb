import pool from '../config/db';
import bcrypt from 'bcrypt';

interface User {
  id: string;
  username: string;
  password_hash: string;
  role: 'Admin' | 'Dictator' | 'Sponsor';
}

export const createUser = async (username: string, password: string, role: User['role']): Promise<User> => {
  const hashedPassword = await bcrypt.hash(password, 10);
  const result = await pool.query(
    'INSERT INTO "User" (username, password_hash, role) VALUES ($1, $2, $3) RETURNING *',
    [username, hashedPassword, role]
  );
  return result.rows[0];
};

export const findUserByUsername = async (username: string): Promise<User | null> => {
  const result = await pool.query('SELECT * FROM "User" WHERE username = $1', [username]);
  return result.rows[0] || null;
};