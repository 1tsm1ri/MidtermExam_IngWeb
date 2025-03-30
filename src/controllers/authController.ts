import { Request, Response,  NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createUser, findUserByUsername } from '../models/User';
import bcrypt from 'bcrypt';
import pool from '../config/db';

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { username, password, role } = req.body;

try {
    console.log(" Datos recibidos:", { username, password, role });

    // Verificar si ya existe un Admin
    const adminCheck = await pool.query('SELECT * FROM "User" WHERE role = $1', ['Admin']);
    console.log(" Admin Check:", adminCheck.rows);

    if (adminCheck.rows.length > 0 && role === 'Admin') {
        res.status(400).json({ error: 'Solo puede existir un Administrador inicial' });
        return;
    }

    console.log(" Creando usuario...");
    const user = await createUser(username, password, role);
    
    console.log("Usuario creado:", user);
    res.status(201).json(user);

} catch (error) {
    console.error("Error en el registro:", error);
    res.status(500).json({ error: 'Error al registrar usuario' });
    next(error);
    }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { username, password } = req.body;

    try {
        const userResult = await pool.query('SELECT * FROM "User" WHERE username = $1', [username]);

        if (userResult.rows.length === 0) {
            res.status(400).json({ error: 'Credenciales inválidas' });
            return;
        }

        const user = userResult.rows[0];
        let account = null;

        // Verificar si el usuario es un Dictador o Sponsor y obtener intentos fallidos
        if (user.role === "Dictator") {
            const result = await pool.query('SELECT * FROM dictator WHERE user_id = $1', [user.id]);
            account = result.rows[0];
        } else if (user.role === "Sponsor") {
            const result = await pool.query('SELECT * FROM sponsor WHERE user_id = $1', [user.id]);
            account = result.rows[0];
        }

        // Si la cuenta está bloqueada
        if (account?.blocked) {
            res.status(403).json({ error: "Has bloqueado tu cuenta. Contacta al Administrador." });
            return;
        }

        // Comparar contraseña
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            if (account) {
                const newFailedAttempts = account.failed_attempts + 1;
                if (newFailedAttempts >= 3) {
                    await pool.query(
                        `UPDATE ${user.role === "Dictator" ? "dictator" : "sponsor"} SET failed_attempts = $1, blocked = true WHERE user_id = $2`,
                        [newFailedAttempts, user.id]
                    );
                    res.status(403).json({ error: "Has bloqueado tu cuenta. Contacta al Administrador." });
                } else {
                    await pool.query(
                        `UPDATE ${user.role === "Dictator" ? "dictator" : "sponsor"} SET failed_attempts = $1 WHERE user_id = $2`,
                        [newFailedAttempts, user.id]
                    );
                    res.status(400).json({ error: `Credenciales inválidas. Intento ${newFailedAttempts}/3 `});
                }
            } else {
                res.status(400).json({ error: 'Credenciales inválidas' });
            }
            return;
        }

        // Si el login es exitoso, resetear intentos fallidos
        if (account && account.failed_attempts > 0) {
            await pool.query(
                `UPDATE ${user.role === "Dictator" ? "dictator" : "sponsor"} SET failed_attempts = 0 WHERE user_id = $1`,
                [user.id]
            );
        }

        // Verificar activación de cuenta
        let needsActivation = false;
        if (user.role === "Dictator" && (account.name.startsWith('TEMP_') || account.territory.startsWith('TEMP_'))) {
            needsActivation = true;
        } else if (user.role === "Sponsor" && account.company_name.startsWith('TEMP_')) {
            needsActivation = true;
        }

        // Generar token
        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!, { expiresIn: "4h" });

        // Responder según activación
        if (needsActivation) {
            res.status(200).json({
                message: "Debes activar tu cuenta proporcionando tu información.",
                userId: user.id,
                token
            });
        } else {
            res.json({ token });
        }

    } catch (error) {
        console.error("Error en el login:", error);
        res.status(500).json({ error: "Error en el login" });
        next(error);
    }
};

export const registerDictator = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { username, password } = req.body; // Eliminamos name y territory del body

const client = await pool.connect();
try {
    await client.query('BEGIN');

    //  1. Crear usuario en la tabla "User"
    const userResult = await client.query(
        `INSERT INTO "User" (username, password_hash, role) 
        VALUES ($1, crypt($2, gen_salt('bf')), $3) 
        RETURNING id`,
        [username, password, 'Dictator']
    );

    const userId = userResult.rows[0].id;

    //  2. Crear Dictador con valores temporales y 0 intentos fallidos
    await client.query(
        `INSERT INTO Dictator (name, territory, user_id, failed_attempts) 
        VALUES ($1, $2, $3, 0) RETURNING *`, 
        [`TEMP_${userId.substring(0, 5)}`, `TEMP_${userId.substring(0, 5)}`, userId]
    );

    await client.query('COMMIT');
    res.status(201).json({ message: "Dictador registrado con éxito", userId });

} catch (error) {
    await client.query('ROLLBACK');
    console.error("Error al registrar dictador:", error);
    res.status(500).json({ error: 'Error al registrar dictador', details: error.message });
    next(error);

} finally {
    client.release();
    }
};

export const registerSponsor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { username, password } = req.body; //  Eliminamos company_name del body

const client = await pool.connect();
try {
    await client.query('BEGIN');

    //  1. Crear usuario en la tabla "User"
    const userResult = await client.query(
        `INSERT INTO "User" (username, password_hash, role) 
        VALUES ($1, crypt($2, gen_salt('bf')), $3) 
        RETURNING id`,
        [username, password, 'Sponsor']
    );
    const userId = userResult.rows[0].id;

    //  2. Crear Sponsor con company_name temporal
    await client.query(
        `INSERT INTO Sponsor (company_name, preferred_fighter, user_id, failed_attempts) 
        VALUES ($1, NULL, $2, 0) RETURNING *`, 
        [`TEMP_${userId.substring(0, 5)}`, userId]
    );

    await client.query('COMMIT');
    res.status(201).json({ message: "Sponsor registrado con éxito", userId });

} catch (error) {
    await client.query('ROLLBACK');
    console.error("Error al registrar sponsor:", error);
    res.status(500).json({ error: 'Error al registrar sponsor', details: error.message });
    next(error);

} finally {
    client.release();
    }
};

export const activateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { name, territory, company_name } = req.body;
    const userId = req.user!.id;

    try {
        const user = await pool.query('SELECT * FROM "User" WHERE id = $1', [userId]);
        if (user.rows.length === 0) {
            res.status(404).json({ error: "Usuario no encontrado" });
            return;
        }

        const role = user.rows[0].role;

        if (role === "Dictator") {
            const dictator = await pool.query('SELECT * FROM Dictator WHERE user_id = $1', [userId]);

            if (dictator.rows.length === 0) {
                res.status(403).json({ error: "No tienes permiso para modificar. Módulo no disponible." });
                return;
            }

            const dictatorData = dictator.rows[0];
            console.log ("informacion del dictador",dictatorData.name)
            if ((dictatorData.name && !dictatorData.name.includes("TEMP")) || 
            (dictatorData.territory && !dictatorData.territory.includes("TEMP"))) {
            res.status(403).json({ error: "No tienes permiso para modificar. Módulo no disponible." });
            return;
            }

            if (dictatorData.failed_attempts >= 3) {
                res.status(403).json({ error: "Tu cuenta está bloqueada. Contacta al Admin." });
                return;
            }

            const existing = await pool.query(
                'SELECT COUNT(*) FROM Dictator WHERE name = $1 OR territory = $2', 
                [name, territory]
            );

            if (parseInt(existing.rows[0].count) > 0) {
                await pool.query('UPDATE Dictator SET failed_attempts = failed_attempts + 1 WHERE user_id = $1', [userId]);
                res.status(400).json({ error: "Ese nombre o territorio ya están en uso. Intenta de nuevo." });
                return;
            }

            await pool.query(
                'UPDATE Dictator SET name = $1, territory = $2, failed_attempts = 0 WHERE user_id = $3',
                [name, territory, userId]
            );

        } else if (role === "Sponsor") {
            const sponsor = await pool.query('SELECT * FROM Sponsor WHERE user_id = $1', [userId]);
        
            if (sponsor.rows.length === 0) {
                res.status(403).json({ error: "No tienes permiso para modificar. Módulo no disponible." });
                return;
            }
        
            const sponsorData = sponsor.rows[0];
        
            if (sponsorData.company_name && !sponsorData.company_name.includes("TEMP")) {
                res.status(403).json({ error: "No tienes permiso para modificar. Módulo no disponible." });
                return;
            }
        
            if (sponsorData.failed_attempts >= 3) {
                res.status(403).json({ error: "Tu cuenta está bloqueada. Contacta al Admin." });
                return;
            }
        
            const existing = await pool.query('SELECT COUNT(*) FROM Sponsor WHERE company_name = $1', [company_name]);
            if (parseInt(existing.rows[0].count) > 0) {
                await pool.query('UPDATE Sponsor SET failed_attempts = failed_attempts + 1 WHERE user_id = $1', [userId]);
                res.status(400).json({ error: "Ese nombre de empresa ya está en uso. Intenta de nuevo." });
                return;
            }
        
            await pool.query(
                'UPDATE Sponsor SET company_name = $1, failed_attempts = 0, blocked = FALSE WHERE user_id = $2',
                [company_name, userId]
            );
        }

        res.status(200).json({ message: "Cuenta activada con éxito." });

    } catch (error) {
        console.error("Error al activar usuario:", error);
        res.status(500).json({ error: "Error al activar usuario." });
        next(error);
    }
};