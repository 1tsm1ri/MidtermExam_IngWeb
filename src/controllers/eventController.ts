import { Request, Response,  NextFunction } from 'express';
import pool from '../config/db';

export const listActiveEvents = async (req: Request, res: Response): Promise<void> => {
    //  Verificar si el usuario es administrador
    if (!req.user || req.user.role !== "Admin") {
        res.status(403).json({ error: "Acceso denegado. Solo los administradores pueden ver los eventos activos." });
        return;
    }

    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT e.id, e.name, e.start_date, e.end_date, e.rules, COUNT(b.id) AS battles_count
            FROM Event e
            JOIN EventBattle eb ON e.id = eb.event_id
            JOIN Battle b ON eb.battle_id = b.id
            WHERE b.status = 'Approved'
            GROUP BY e.id, e.name, e.start_date, e.end_date, e.rules
            ORDER BY e.start_date ASC`
        );

        if (result.rows.length === 0) {
            res.json({ message: "No hay eventos activos en este momento." });
        } else {
            res.json(result.rows);
        }

    } catch (error) {
        console.error("Error al listar eventos activos:", error);
        res.status(500).json({ error: "Error al obtener eventos activos." });

    } finally {
        client.release();
    }
};
