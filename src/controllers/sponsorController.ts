import { Request, Response,  NextFunction } from 'express';
import pool from '../config/db';

const getDictatorId = async (userId: string): Promise<string | null> => {
    console.log(`[getDictatorId] Buscando Dictador para el usuario ID: ${userId}`);

    try {
        const result = await pool.query('SELECT id FROM Dictator WHERE user_id = $1', [userId]);

        if (result.rows.length > 0) {
            console.log(`[getDictatorId] Dictador encontrado. ID: ${result.rows[0].id}`);
            return result.rows[0].id;
        } else {
            console.log(`[getDictatorId] No se encontró Dictador para el usuario ID: ${userId}`);
            return null;
        }
    } catch (error) {
        console.error(`[getDictatorId] Error al obtener Dictador para el usuario ID: ${userId}`, error);
        return null;
    }
};

const getSponsorId = async (userId: string): Promise<string | null> => {
    console.log(`[getSponsorId] Buscando Sponsor para el usuario ID: ${userId}`);

    try {
        const result = await pool.query('SELECT id FROM Sponsor WHERE user_id = $1', [userId]);

        if (result.rows.length > 0) {
            console.log(`[getSponsorId] Sponsor encontrado. ID: ${result.rows[0].id}`);
            return result.rows[0].id;
        } else {
            console.log(`[getSponsorId] No se encontró Sponsor para el usuario ID: ${userId}`);
            return null;
        }
    } catch (error) {
        console.error(`[getSponsorId] Error al obtener Sponsor para el usuario ID: ${userId}`, error);
        return null;
    }
};

export const giveItem = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { contestantId, itemName } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const sponsorId = await getSponsorId(userId);
        if (!sponsorId) {
            res.status(403).json({ error: "No tienes permiso para donar items." });
            return;
        }

        //  Verificar si el concursante ya tiene un item asignado
        const existingItem = await client.query(
            'SELECT * FROM ContestantItems WHERE contestant_id = $1',
            [contestantId]
        );

        if (existingItem.rows.length > 0) {
            res.status(400).json({ error: "El concursante ya tiene un item asignado." });
            return;
        }

        //  Verificar que el sponsor tiene el ítem en su inventario
        const item = await client.query(
            'SELECT * FROM sponsorinventory WHERE sponsor_id = $1 AND item_name = $2',
            [sponsorId, itemName]
        );

        if (item.rows.length === 0 || item.rows[0].quantity <= 0) {
            res.status(400).json({ error: "No tienes suficiente cantidad de este item." });
            return;
        }

        if (item.rows[0].category !== 'weapon') {  //  Solo armas se pueden donar
            res.status(400).json({ error: "Solo se pueden donar armas, no buffs." });
            return;
        }

        //  Registrar la donación en la tabla ContestantItems
        await client.query(
            'INSERT INTO ContestantItems (contestant_id, item_name, source, giver_id) VALUES ($1, $2, $3, $4)',
            [contestantId, itemName, 'sponsor', sponsorId]
        );

        //  Descontar el ítem del inventario
        await client.query(
            'UPDATE SponsorInventory SET quantity = quantity - 1 WHERE sponsor_id = $1 AND item_name = $2',
            [sponsorId, itemName]
        );

        await client.query('COMMIT');
        res.json({ message: "Item donado con éxito." });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error al donar item:", error);
        res.status(500).json({ error: "Error al donar item." });

    } finally {
        client.release();
    }
};



export const addItemToInventory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user!.id;
    const { itemName, quantity, category } = req.body; //  Agregamos 'category'

    if (!['weapon', 'buff'].includes(category)) {
        res.status(400).json({ error: "Categoría inválida. Debe ser 'weapon' o 'buff'." });
        return;
    }

    try {
        const sponsorId = await getSponsorId(userId);
        if (!sponsorId) {
            res.status(403).json({ error: "No tienes permiso para añadir items al inventario." });
            return;
        }

        const existingItem = await pool.query(
            'SELECT * FROM SponsorInventory WHERE sponsor_id = $1 AND item_name = $2',
            [sponsorId, itemName]
        );

        if (existingItem.rows.length > 0) {
            await pool.query(
                'UPDATE SponsorInventory SET quantity = quantity + $1 WHERE sponsor_id = $2 AND item_name = $3',
                [quantity, sponsorId, itemName]
            );
        } else {
            await pool.query(
                'INSERT INTO SponsorInventory (sponsor_id, item_name, quantity, category) VALUES ($1, $2, $3, $4)',
                [sponsorId, itemName, quantity, category]
            );
        }

        res.json({ message: "Item agregado al inventario." });

    } catch (error) {
        console.error(" Error al agregar item:", error);
        res.status(500).json({ error: "Error al agregar item." });
    }
};

export const applyBuff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user!.id;
    const { contestantId, item_name, strength_boost, agility_boost, duration } = req.body;

    console.log(`[applyBuff] Usuario ID: ${userId}`);
    console.log(`[applyBuff] Datos recibidos:`, { contestantId, item_name, strength_boost, agility_boost, duration });

    try {
        // Determinar el tipo de usuario (Sponsor o Dictator)
        const sponsorId = await getSponsorId(userId);
        const dictatorId = await getDictatorId(userId);

        console.log(`[applyBuff] Sponsor ID: ${sponsorId}, Dictator ID: ${dictatorId}`);

        let sourceType: string | null = null;
        let sourceId: string | null = null;

        if (sponsorId) {
            sourceType = "sponsor";
            sourceId = sponsorId;
            console.log(`[applyBuff] El usuario es un Sponsor con ID: ${sourceId}`);
        } else if (dictatorId) {
            sourceType = "dictator";
            sourceId = dictatorId;
            console.log(`[applyBuff] El usuario es un Dictador con ID: ${sourceId}`);

            // Verificar si el Contestant pertenece al Dictador
            const contestantCheck = await pool.query(
                `SELECT id FROM Contestant WHERE id = $1 AND dictator_id = $2`,
                [contestantId, dictatorId]
            );

            if (contestantCheck.rows.length === 0) {
                console.warn(`[applyBuff] Intento de aplicar buff a un Contestant ajeno. Contestant ID: ${contestantId}`);
                res.status(403).json({ error: "No puedes aplicar buffs a un Contestant que no te pertenece." });
                return;
            }

            console.log(`[applyBuff] Validación exitosa: el Contestant pertenece al Dictador.`);
        } else {
            console.warn(`[applyBuff] Usuario sin permisos para aplicar buffs.`);
            res.status(403).json({ error: "No tienes permiso para aplicar buffs." });
            return;
        }

        // Verificar si el usuario tiene el buff en su inventario
        const inventoryCheck = await pool.query(
            'SELECT quantity, category FROM sponsorinventory WHERE sponsor_id = $1 AND item_name = $2',
            [sourceId, item_name]
        );

        if (inventoryCheck.rows.length === 0 || inventoryCheck.rows[0].quantity <= 0) {
            console.warn(`[applyBuff] Buff no encontrado en el inventario o sin cantidad suficiente. Item: ${item_name}`);
            res.status(400).json({ error: "No tienes este buff en el inventario." });
            return;
        }

        if (inventoryCheck.rows[0].category !== 'buff') {  
            console.warn(`[applyBuff] El usuario intentó aplicar un item que no es un buff. Item: ${item_name}`);
            res.status(400).json({ error: "Solo se pueden aplicar buffs, no armas." });
            return;
        }

        console.log(`[applyBuff] Buff válido en el inventario. Procediendo a aplicar.`);

        // Insertar el buff en la tabla de buffs con la nueva columna source_type
        await pool.query(
            `INSERT INTO Buff (name, effect, strength_boost, agility_boost, duration, source_type, source_id, contestant_id)
            VALUES ($1, 'Buff aplicado', $2, $3, $4, $5, $6, $7)`,
            [item_name, strength_boost, agility_boost, duration, sourceType, userId , contestantId]
        );

        console.log(`[applyBuff] Buff insertado en la base de datos.`);

        // Reducir la cantidad en el inventario
        await pool.query(
            `UPDATE sponsorinventory 
            SET quantity = quantity - 1 
            WHERE sponsor_id = $1 AND item_name = $2 AND category = $3`,
            [sourceId, item_name, sourceType]
        );

        console.log(`[applyBuff] Inventario actualizado. Buff consumido.`);

        res.status(201).json({ message: "Buff aplicado con éxito." });

    } catch (error) {
        console.error("[applyBuff] Error al aplicar buff:", error);
        res.status(500).json({ error: "Error al aplicar buff." });
    }
};

export const applyBuffDuringBattle = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { battleId, contestantId, item_name, strength_boost, agility_boost, duration } = req.body;

    try {
        //  Verificar si es Sponsor o Dictador
        const sponsorId = await getSponsorId(userId);
        const dictatorId = await getDictatorId(userId);

        if (!sponsorId && !dictatorId) {
            res.status(403).json({ error: "No tienes permiso para aplicar buffs." });
            return;
        }

        //  Verificar que la batalla está activa
        const battle = await pool.query('SELECT * FROM Battle WHERE id = $1 AND status = \'Start\'', [battleId]);
        if (battle.rows.length === 0) {
            res.status(400).json({ error: "La batalla no está activa o no existe." });
            return;
        }

        let inventoryCheck;
        let sourceType;
        let sourceId;

        if (sponsorId) {
            //  Verificar en el inventario del Sponsor
            inventoryCheck = await pool.query(
                'SELECT quantity FROM SponsorInventory WHERE sponsor_id = $1 AND item_name = $2 AND category = \'buff\'',
                [sponsorId, item_name]
            );
            sourceType = 'sponsor';
            sourceId = sponsorId;
        } else if (dictatorId) {
            //  Verificar en el inventario del Dictador
            inventoryCheck = await pool.query(
                'SELECT quantity FROM dictator_inventory WHERE dictator_id = $1 AND item_name = $2 AND category = \'buff\'',
                [dictatorId, item_name]
            );
            sourceType = 'dictator';
            sourceId = dictatorId;
        }

        if (!inventoryCheck || inventoryCheck.rows.length === 0 || inventoryCheck.rows[0].quantity <= 0) {
            res.status(400).json({ error: "No tienes este buff en el inventario." });
            return;
        }

        //  Aplicar el buff
        await pool.query(
            `INSERT INTO Buff (name, effect, strength_boost, agility_boost, duration, source_type, source_id, contestant_id)
            VALUES ($1, 'Buff aplicado', $2, $3, $4, $5, $6, $7)`,
            [item_name, strength_boost, agility_boost, duration, sourceType, userId , contestantId]
        );

        //  Reducir la cantidad en el inventario
        if (sponsorId) {
            await pool.query(
                `UPDATE SponsorInventory SET quantity = quantity - 1 WHERE sponsor_id = $1 AND item_name = $2`,
                [sponsorId, item_name]
            );
        } else if (dictatorId) {
            await pool.query(
                `UPDATE dictator_inventory SET quantity = quantity - 1 WHERE dictator_id = $1 AND item_name = $2`,
                [dictatorId, item_name]
            );
        }

        res.status(201).json({ message: "Buff aplicado durante la batalla." });

    } catch (error) {
        console.error(" Error al aplicar buff en batalla:", error);
        res.status(500).json({ error: "Error al aplicar buff en batalla." });
    }
};

export const getSponsorInventory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user!.id;

    try {
        const sponsorId = await getSponsorId(userId);
        if (!sponsorId) {
            res.status(403).json({ error: "No tienes permiso para ver el inventario." });
            return;
        }

        const inventory = await pool.query(
            'SELECT * FROM SponsorInventory WHERE sponsor_id = $1',
            [sponsorId]
        );

        res.json(inventory.rows);

    } catch (error) {
        console.error(" Error al obtener inventario:", error);
        res.status(500).json({ error: "Error al obtener inventario." });
    }
};

export const getContestantDetails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { contestantId } = req.params;

    try {
        const query = `
            SELECT 
                c.id AS contestant_id, 
                c.name AS contestant_name, 
                c.nickname, 
                c.strength, 
                c.agility, 
                c.health, 
                c.wins, 
                c.losses, 
                c.status, 
                c.released,
                d.id AS dictator_id,
                d.name AS dictator_name,
                d.territory
            FROM Contestant c
            JOIN Dictator d ON c.dictator_id = d.id
            WHERE c.id = $1
        `;

        const result = await pool.query(query, [contestantId]);

        if (result.rows.length === 0) {
            res.status(404).json({ error: "El Contestant no existe o no tiene un Dictador asignado." });
            return;
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error(" Error al obtener detalles del Contestant:", error);
        res.status(500).json({ error: "Error al obtener detalles del Contestant." });
    }
};



export const getAllContestants = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const query = `
            SELECT 
                c.id AS contestant_id, 
                c.name AS contestant_name, 
                c.nickname, 
                c.strength, 
                c.agility, 
                c.health, 
                c.wins, 
                c.losses, 
                c.status, 
                c.released,
                d.id AS dictator_id,
                d.name AS dictator_name,
                d.territory
            FROM Contestant c
            JOIN Dictator d ON c.dictator_id = d.id
            WHERE c.released = false
        `;

        const result = await pool.query(query);

        res.json(result.rows);

    } catch (error) {
        console.error(" Error al obtener la lista de Contestants:", error);
        res.status(500).json({ error: "Error al obtener la lista de Contestants." });
    }
};


export const getSponsorBlackMarketItems = async (req: Request, res: Response,  next: NextFunction): Promise<void> => {
    const userId = req.user!.id; // ID del usuario autenticado

    try {
        // Obtener el ID del Sponsor desde el User ID
        const sponsorResult = await pool.query('SELECT id FROM Sponsor WHERE user_id = $1', [userId]);

        if (sponsorResult.rows.length === 0) {
            res.status(403).json({ error: "No tienes permiso para ver items en el mercado negro." });
            return;
        }

        const sponsorId = sponsorResult.rows[0].id;

        // Obtener los items del sponsor en el mercado negro
        const items = await pool.query(
            "SELECT * FROM BlackMarketTransaction WHERE seller_id = $1 AND status = 'Discovered'",
            [userId]
        );

        if (items.rows.length === 0) {
            res.json({ message: "No tienes items publicados en el mercado negro." });
            return;
        }

        res.json(items.rows);

    } catch (error) {
        console.error("Error al obtener items del mercado negro del sponsor:", error);
        res.status(500).json({ error: "Error al obtener items del mercado negro del sponsor." });
    }
};


export const removeBlackMarketListing = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user!.id;
    const { transactionId } = req.body; // ID de la transacción a eliminar

    try {
        console.log(" Buscando Sponsor con userId:", userId);

        // Obtener el Sponsor ID desde el User ID
        const sponsorResult = await pool.query("SELECT id FROM Sponsor WHERE user_id = $1", [userId]);

        if (sponsorResult.rows.length === 0) {
            res.status(403).json({ error: "No tienes permiso para eliminar publicaciones del mercado negro." });
            return;
        }

        const sponsorId = sponsorResult.rows[0].id;
        console.log(" Sponsor encontrado:", sponsorId);

        // Verificar que la transacción pertenece al sponsor y está en estado 'Discovered'
        console.log(" Buscando transacción con ID:", transactionId);
        const transaction = await pool.query(
            "SELECT * FROM BlackMarketTransaction WHERE id = $1 AND seller_id = $2 AND status = 'Discovered'",
            [transactionId, userId]
        );

        if (transaction.rows.length === 0) {
            console.log(" No se encontró la transacción con ID:", transactionId);
            res.status(400).json({ error: "No se encontró la publicación o ya ha sido vendida." });
            return;
        }

        console.log(" Transacción encontrada:", transaction.rows[0]);

        const itemName = transaction.rows[0].item;
        const transactionQuantity = 1; //  SOLO DEVOLVER 1 ITEM AL INVENTARIO 

        console.log(" Cantidad de items a devolver:", transactionQuantity);

        // Eliminar la transacción del mercado negro
        console.log(" Eliminando transacción...");
        await pool.query("DELETE FROM BlackMarketTransaction WHERE id = $1", [transactionId]);

        // Verificar si el Sponsor ya tiene este item en su inventario
        console.log(" Verificando inventario...");
        const inventoryCheck = await pool.query(
            "SELECT quantity FROM SponsorInventory WHERE sponsor_id = $1 AND item_name = $2",
            [sponsorId, itemName]
        );

        if (inventoryCheck.rows.length > 0) {
            const currentQuantity = inventoryCheck.rows[0].quantity || 0;
            const newQuantity = currentQuantity + transactionQuantity;

            console.log("Item ya existe en el inventario, actualizando cantidad a:", newQuantity);

            // Si el item ya existe, actualizar cantidad
            await pool.query(
                "UPDATE SponsorInventory SET quantity = $1 WHERE sponsor_id = $2 AND item_name = $3",
                [newQuantity, sponsorId, itemName]
            );
        } else {
            console.log("Item no existe en el inventario, agregando nuevo registro con cantidad:", transactionQuantity);

            // Si el item no existe, insertarlo
            await pool.query(
                "INSERT INTO SponsorInventory (sponsor_id, item_name, quantity) VALUES ($1, $2, $3)",
                [sponsorId, itemName, transactionQuantity]
            );
        }

        res.json({ message: "Publicación eliminada y item devuelto al inventario."});

    } catch (error) {
        console.error("Error al eliminar publicación del mercado negro:", error);
        res.status(500).json({ error: "Error al eliminar publicación del mercado negro."});
    }
};

export const listActiveBattles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        console.log("Buscando batallas activas...");

        const activeBattles = await pool.query(`
        SELECT 
        b.id, 
        b.date, 
        b.contestant_1, 
        b.contestant_2, 
        b.winner_id, 
        b.death_occurred, 
        b.casualty_id, 
        b.injuries, 
        b.dictator_id, 
        b.status 
        FROM Battle b
        WHERE b.status = 'Approved';
        `);

        if (activeBattles.rows.length === 0) {
            console.log("No hay batallas activas.");
            res.json({ message: "No hay batallas activas en este momento." });
            return;
        }

        console.log("Batallas activas encontradas:", activeBattles.rows);
        res.json(activeBattles.rows);

    } catch (error) {
        console.error("Error al obtener batallas activas:", error);
        res.status(500).json({ error: "Error al obtener batallas activas." });
    }
};