import { Request, Response,  NextFunction} from 'express';
import pool from '../config/db';
import { validate as isUuid } from 'uuid'; //  Importar la validación UUID

const getDictatorId = async (userId: string): Promise<string | null> => {
    const result = await pool.query('SELECT id FROM Dictator WHERE user_id = $1', [userId]);
    return result.rows.length > 0 ? result.rows[0].id : null;
};

const getSponsorId = async (userId: string): Promise<string | null> => {
    const result = await pool.query('SELECT id FROM Sponsor WHERE user_id = $1', [userId]);
    return result.rows.length > 0 ? result.rows[0].id : null;
};

export const giveItem = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { contestantId, itemName } = req.body;
    console.log(" Iniciando proceso de donación de item");
    console.log(" Datos recibidos:", { userId, contestantId, itemName });

    const client = await pool.connect();
    try {
        
        await client.query('BEGIN');

        //  Verificar si el usuario es un dictador
        const dictatorId = await getDictatorId(userId);
        console.log(" Dictador ID:", dictatorId);
        if (!dictatorId) {
            res.status(403).json({ error: "No tienes permiso para donar items." });
            return;
        }
        console.log("dictador econtrado?");
        
        //  Verificar si el concursante pertenece al dictador
        const query = 'SELECT * FROM "contestant" WHERE id = $1 AND dictator_id = $2';
        console.log(" Query a ejecutar:", query, "Valores:", [contestantId, dictatorId]);

        const ownsContestant = await client.query(query, [contestantId, dictatorId]);
        console.log(" Contestant encontrado:", ownsContestant.rows);
        console.log(" Contestant encontrado:", ownsContestant.rows);
        if (ownsContestant.rows.length === 0) {
            res.status(403).json({ error: "No puedes dar items a un concursante que no es tuyo." });
            return;
        }

        //  Verificar si el concursante ya tiene un item asignado
        const existingItem = await client.query(
            'SELECT * FROM ContestantItems WHERE contestant_id = $1',
            [contestantId]
        );
        console.log(" Items existentes en ContestantItems:", existingItem.rows);
        if (existingItem.rows.length > 0) {
            res.status(400).json({ error: "El concursante ya tiene un item asignado." });
            return;
        }

        //  Verificar que el dictador tiene el ítem en su inventario
        const item = await client.query(
            'SELECT * FROM dictator_inventory WHERE dictator_id = $1 AND item_name = $2',
            [dictatorId, itemName]
        );
        console.log(" Item en inventario:", item.rows);

        if (item.rows.length === 0 || item.rows[0].quantity <= 0) {
            res.status(400).json({ error: "No tienes suficiente cantidad de este item." });
            return;
        }

        if (item.rows[0].category !== 'weapon') {  //  Solo armas se pueden donar
            res.status(400).json({ error: "Solo se pueden donar armas, no buffs." });
            return;
        }

        //  Registrar la donación en la tabla ContestantItems
        console.log(" Insertando en ContestantItems");
        await client.query(
            'INSERT INTO ContestantItems (contestant_id, item_name, source, giver_id) VALUES ($1, $2, $3, $4)',
            [contestantId, itemName, 'dictator', dictatorId]
        );

        //  Descontar el ítem del inventario
        console.log(" Actualizando inventario de DictatorInventory");
        await client.query(
            'UPDATE dictator_inventory SET quantity = quantity - 1 WHERE dictator_id = $1 AND item_name = $2',
            [dictatorId, itemName]
        );

        await client.query('COMMIT');
        console.log(" Item donado con éxito");
        res.json({ message: "Item donado con éxito." });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(" Error al donar item:", error);
        res.status(500).json({ error: "Error al donar item." });

    } finally {
        client.release();
        console.log(" Conexión liberada");
    }
};

export const createContestant = async (req: Request, res: Response, next: NextFunction): Promise<void>  => {
    const { name, nickname, strength, agility } = req.body;
    const dictatorId = req.user!.id; // ID del dictador autenticado

    try {
        //  Verificar que el usuario realmente es un dictador
        const dictator = await pool.query('SELECT * FROM Dictator WHERE user_id = $1', [dictatorId]);
        if (dictator.rows.length === 0) {
            res.status(403).json({ error: 'No tienes permiso para crear Contestants.' });
            return;
        }

        //  Verificar si ya existe un Contestant con los mismos datos
        const existingContestant = await pool.query(
            `SELECT * FROM Contestant 
            WHERE name = $1 AND nickname = $2 AND strength = $3 AND agility = $4`,
            [name, nickname, strength, agility]
        );

        if (existingContestant.rows.length > 0) {
            res.status(400).json({ error: 'Ya existe un Contestant con estos mismos datos. Debes cambiar al menos uno.' });
            return;
        }

        //  Insertar nuevo Contestant
        const newContestant = await pool.query(
            `INSERT INTO Contestant (name, nickname, strength, agility, dictator_id)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [name, nickname, strength, agility, dictator.rows[0].id]
        );

        res.status(201).json({ message: 'Contestant creado con éxito', contestant: newContestant.rows[0] });

    } catch (error) {
        console.error("Error al crear Contestant:", error);
        res.status(500).json({ error: 'Error al crear Contestant' });
    }
};

export const getContestants = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user!.id; //  Este es el ID del User
    const { status, strength, agility } = req.query; 

    try {
        //  1. Obtener el ID del Dictador a partir del userId
        const dictatorResult = await pool.query(
            'SELECT id FROM Dictator WHERE user_id = $1', 
            [userId]
        );

        if (dictatorResult.rows.length === 0) {
            res.status(403).json({ error: "No tienes permiso para ver Contestants." });
            return;
        }

        const dictatorId = dictatorResult.rows[0].id; //  Ahora sí tenemos el ID correcto

        //  2. Construir la consulta con los filtros
        let query = `SELECT * FROM Contestant WHERE dictator_id = $1`;
        const values: any[] = [dictatorId];

        if (status && status !== '') {
            values.push(status);
            query += ` AND status = $${values.length}`;
        }
        if (strength && !isNaN(Number(strength))) {
            values.push(Number(strength));
            query += ` AND strength >= $${values.length}`;
        }
        if (agility && !isNaN(Number(agility))) {
            values.push(Number(agility));
            query += ` AND agility >= $${values.length}`;
        }

        console.log(" Consulta SQL generada:", query, values); //  Depuración

        //  3. Ejecutar la consulta final
        const result = await pool.query(query, values);
        res.json(result.rows);
        return;

    } catch (error) {
        console.error("Error al obtener Contestants:", error);
        res.status(500).json({ error: 'Error al obtener Contestants' });
        return;
    }
};

export const updateContestant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user!.id; //  ID del User autenticado
    const { contestantId } = req.params; 
    const { name, nickname, status, strength, agility } = req.body;

    try {
        //  1. Obtener el ID del Dictador desde el User ID
        console.log(" Buscando Dictador con user_id:", userId); //  Depuración

        const dictatorResult = await pool.query(
            'SELECT id FROM Dictator WHERE user_id = $1', 
            [userId]
        );

        console.log("Resultado de Dictador:", dictatorResult.rows); //  Depuración

        if (dictatorResult.rows.length === 0) {
            res.status(403).json({ error: "No tienes permiso para modificar Contestants." });
            return;
        }

        const dictatorId = dictatorResult.rows[0].id; 
        console.log(" Dictador encontrado con ID:", dictatorId); //  Depuración

        //  2. Verificar que el Contestant pertenece a este Dictador
        console.log(" Buscando Contestant con ID:", contestantId);
        console.log(" Dictador autenticado con ID:", dictatorId);

        const contestantResult = await pool.query(
            'SELECT * FROM Contestant WHERE id = $1 AND dictator_id = $2',
            [contestantId, dictatorId]
        );

        console.log(" Resultado de Contestant en DB:", contestantResult.rows); //  Nuevo log de depuración

    if (contestantResult.rows.length === 0) {
    res.status(403).json({ error: "No tienes permiso para modificar este Contestant." });
    return;
    }

        //  3. Construir la consulta de actualización dinámicamente
        const updateFields = [];
        const values: any[] = [];
        
        if (name) {
            values.push(name);
            updateFields.push(`name = $${values.length}`);
        }
        if (nickname) {
            values.push(nickname);
            updateFields.push(`nickname = $${values.length}`);
        }
        if (status) {
            values.push(status);
            updateFields.push(`status = $${values.length}`);
        }
        if (strength) {
            values.push(Number(strength));
            updateFields.push(`strength = $${values.length}`);
        }
        if (agility) {
            values.push(Number(agility));
            updateFields.push(`agility = $${values.length}`);
        }
        if (updateFields.length === 0) {
            res.status(400).json({ error: "No se proporcionaron campos para actualizar." });
            return;
        }

        values.push(contestantId);
        
        const query = `UPDATE Contestant SET ${updateFields.join(', ')} WHERE id = $${values.length} RETURNING *`;
        const updatedContestant = await pool.query(query, values);

        console.log(" Contestant actualizado:", updatedContestant.rows[0]); //  Depuración

        res.status(200).json({ message: "Contestant actualizado con éxito.", contestant: updatedContestant.rows[0] });

    } catch (error) {
        console.error(" Error al actualizar Contestant:", error);
        res.status(500).json({ error: "Error al actualizar Contestant." });
    }
};

export const releaseContestant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user!.id; //  ID del usuario autenticado
    let contestantId = req.params.contestantId;

    console.log(" Raw contestantId recibido:", contestantId); //  Depuración

    //  Validar si contestantId es realmente un UUID
    if (!isUuid(contestantId)) {
        res.status(400).json({ error: "ID de Contestant inválido." });
        return;
    }

    try {
        //  1. Obtener el ID del Dictador desde el User ID
        const dictatorResult = await pool.query(
            'SELECT id FROM Dictator WHERE user_id = $1', 
            [userId]
        );

        if (dictatorResult.rows.length === 0) {
            res.status(403).json({ error: "No tienes permiso para liberar Contestants." });
            return;
        }

        const dictatorId = dictatorResult.rows[0].id; //  ID correcto del Dictador

        console.log(" Dictador autenticado con ID:", dictatorId);
        console.log(" Buscando Contestant con ID:", contestantId);

        //  2. Verificar que el Contestant pertenece al Dictador autenticado
        const contestant = await pool.query(
            'SELECT * FROM Contestant WHERE id = $1 AND dictator_id = $2 AND released = false', 
            [contestantId, dictatorId]
        );

        console.log(" Resultado de Contestant en DB:", contestant.rows); //  Depuración

        if (contestant.rows.length === 0) {
            res.status(403).json({ error: "No tienes permiso para liberar este Contestant o ya ha sido liberado." });
            return;
        }

        //  3. Liberar al Contestant (cambiar status a 'Free' y quitar dictator_id)
        await pool.query(
            `UPDATE Contestant 
            SET status = 'Free', released = true, dictator_id = NULL
            WHERE id = $1`,
            [contestantId]
        );

        res.json({ message: "Contestant liberado. Ahora es libre y no podrá ser reclamado nuevamente." });

    } catch (error) {
        console.error(" Error al liberar Contestant:", error);
        res.status(500).json({ error: "Error al liberar Contestant" });
    }
};

export const applyBuff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user!.id;
    const { contestantId, item_name, strength_boost, agility_boost, duration } = req.body;

    try {
        // Determinar el tipo de usuario (Sponsor o Dictator)
        const sponsorId = await getSponsorId(userId);
        const dictatorId = await getDictatorId(userId);

        let sourceType: string | null = null;
        let sourceId: string | null = null;

        if (sponsorId) {
            sourceType = "sponsor";
            sourceId = sponsorId;
        } else if (dictatorId) {
            sourceType = "dictator";
            sourceId = dictatorId;

            // Verificar si el Contestant pertenece al Dictador
            const contestantCheck = await pool.query(
                `SELECT id FROM Contestant WHERE id = $1 AND dictator_id = $2`,
                [contestantId, dictatorId]
            );

            if (contestantCheck.rows.length === 0) {
                res.status(403).json({ error: "No puedes aplicar buffs a un Contestant que no te pertenece." });
                return;
            }
        } else {
            res.status(403).json({ error: "No tienes permiso para aplicar buffs." });
            return;
        }

        // Verificar si el usuario tiene el buff en su inventario
        const inventoryCheck = await pool.query(
            'SELECT quantity, category FROM dictator_inventory WHERE dictator_id = $1 AND item_name = $2',
            [sourceId, item_name]
        );

        if (inventoryCheck.rows.length === 0 || inventoryCheck.rows[0].quantity <= 0) {
            res.status(400).json({ error: "No tienes este buff en el inventario." });
            return;
        }

        if (inventoryCheck.rows[0].category !== 'buff') {  
            res.status(400).json({ error: "Solo se pueden aplicar buffs, no armas." });
            return;
        }

        // Insertar el buff en la tabla de buffs con la nueva columna source_type
        await pool.query(
            `INSERT INTO Buff (name, effect, strength_boost, agility_boost, duration, source_type, source_id, contestant_id)
            VALUES ($1, 'Buff aplicado', $2, $3, $4, $5, $6, $7)`,
            [item_name, strength_boost, agility_boost, duration, sourceType, userId , contestantId]
        );

        // Reducir la cantidad en el inventario
        await pool.query(
            `UPDATE dictator_inventory 
            SET quantity = quantity - 1 
            WHERE dictator_id = $1 AND item_name = $2 AND category = $3`,
            [sourceId, item_name, sourceType]
        );

        res.status(201).json({ message: "Buff aplicado con éxito." });
    } catch (error) {
        console.error("Error al aplicar buff:", error);
        res.status(500).json({ error: "Error al aplicar buff." });
    }
};