import { Request, Response, NextFunction  } from 'express';
import pool from '../config/db';

export const getUsers = async (req: Request, res: Response) => {
    try {
        const adminId = req.user!.id; // ID del admin autenticado
    
        const result = await pool.query(
          'SELECT id, username, role FROM "User" WHERE id != $1 ORDER BY role',
          [adminId]
        );
    
        res.json(result.rows);
      } catch (error) {
        console.error("Error al obtener usuarios:", error);
        res.status(500).json({ error: 'Error al obtener usuarios' });
      }
};

export const deleteUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { id } = req.params;
  const adminId = req.user!.id; // ID del admin autenticado

  if (id === adminId) {
    res.status(403).json({ error: "No puedes eliminar tu propia cuenta." });
    return 
  }

  try {
    const result = await pool.query('DELETE FROM "User" WHERE id = $1 RETURNING *', [id]);

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return 
    }

    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (error) {
    console.error("Error al eliminar usuario:", error);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
};

export const unlockUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { userId } = req.body;

  try {
      // Verificar el rol del usuario
      const userResult = await pool.query('SELECT role FROM "User" WHERE id = $1', [userId]);

      if (userResult.rows.length === 0) {
          res.status(404).json({ error: "Usuario no encontrado." });
          return;
      }

      const { role } = userResult.rows[0];

      if (role === "Dictator") {
          await pool.query('UPDATE dictator SET failed_attempts = 0, blocked = false WHERE user_id = $1', [userId]);
      } else if (role === "Sponsor") {
          await pool.query('UPDATE sponsor SET failed_attempts = 0, blocked = false WHERE user_id = $1', [userId]);
      } else {
          res.status(400).json({ error: "El usuario no tiene un rol válido para desbloquear." });
          return;
      }

      res.status(200).json({ message: "Usuario desbloqueado con éxito." });

  } catch (error) {
      console.error("Error al desbloquear usuario:", error);
      res.status(500).json({ error: "Error al desbloquear usuario." });
      next(error);
  }
};