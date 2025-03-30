import { Request, Response, NextFunction } from 'express';
import pool from '../config/db';

export const startBattle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { battleId } = req.params;
    console.log("battleId recibido:", battleId);

    try {
        // Obtener la batalla con estado "Approved"
        const battle = await pool.query(
            'SELECT * FROM battle WHERE id = $1 AND status = \'Approved\'',
            [battleId]
        );

        console.log("Resultado de la consulta:", battle.rows); // Ver el resultado de la consulta

        if (battle.rows.length === 0) {
            res.status(400).json({ error: "La batalla no está aprobada o no existe." });
            return;
        }

        // Actualizar el estado de la batalla a 'Start'
        await pool.query(
            'UPDATE battle SET status = \'Start\' WHERE id = $1',
            [battleId]
        );

        // Obtener los concursantes de la batalla
        const { contestant_1, contestant_2 } = battle.rows[0];

        // Obtener los buffs de los concursantes
        const buffs = await pool.query(
            'SELECT * FROM Buff WHERE contestant_id IN ($1, $2)',
            [contestant_1, contestant_2]
        );

        let contestantStats: any = {};
        for (const buff of buffs.rows) {
            if (!contestantStats[buff.contestant_id]) {
                contestantStats[buff.contestant_id] = { strength: 0, agility: 0 };
            }
            contestantStats[buff.contestant_id].strength += buff.strength_boost;
            contestantStats[buff.contestant_id].agility += buff.agility_boost;
        }

        res.json({
            message: "Batalla iniciada. Buffs aplicados antes del combate.",
            battle: battle.rows[0],
            buffs_applied: contestantStats
        });

    } catch (error) {
        console.error("Error al iniciar batalla:", error);
        res.status(500).json({ error: "Error al iniciar la batalla." });
    }
};

export const closeBattle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { battleId } = req.params;
    const { winnerId, deathOccurred, casualtyId } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verificar la batalla
        const battle = await client.query('SELECT * FROM Battle WHERE id = $1 AND status = \'Start\'', [battleId]);

        if (battle.rows.length === 0) {
            res.status(400).json({ error: "La batalla no está activa o no existe." });
            return;
        }

        const { contestant_1, contestant_2, dictator_id } = battle.rows[0];
        const loserId = contestant_1 === winnerId ? contestant_2 : contestant_1;

        //  Cerrar la batalla
        await client.query(
            'UPDATE Battle SET status = \'Closed\', winner_id = $1, death_occurred = $2, casualty_id = $3 WHERE id = $4',
            [winnerId, deathOccurred, casualtyId, battleId]
        );

        //  Actualizar estadísticas de los Contestants
        await client.query(
            'UPDATE Contestant SET wins = wins + 1, health = LEAST(health + 10, 100) WHERE id = $1',
            [winnerId]
        );
        await client.query(
            'UPDATE Contestant SET losses = losses + 1, health = GREATEST(health - 10, 0) WHERE id = $1',
            [loserId]
        );

        if (deathOccurred) {
            await client.query('UPDATE Contestant SET status = \'Dead\', health = 0 WHERE id = $1', [casualtyId]);
        }

        //  Ajustar fidelidad del Dictador
        await client.query(
            'UPDATE Dictator SET loyalty_score = LEAST(loyalty_score + 5, 100) WHERE id = (SELECT dictator_id FROM Contestant WHERE id = $1)',
            [winnerId]
        );
        await client.query(
            'UPDATE Dictator SET loyalty_score = GREATEST(loyalty_score - 100, 0) WHERE id = (SELECT dictator_id FROM Contestant WHERE id = $1)',
            [loserId]
        );

        //  Bloquear dictadores con fidelidad 0
        await client.query('UPDATE Dictator SET blocked = TRUE WHERE loyalty_score = 0');

        //  Ajustar fidelidad de Sponsors involucrados
        await adjustSponsorLoyalty(client, winnerId, loserId);

        //  Cerrar apuestas de la batalla
        await client.query(
            'UPDATE Bet SET status = \'Closed\' WHERE battle_id = $1',
            [battleId]
        );

        //  Pagar apuestas ganadoras
        await client.query(
            `UPDATE Bet 
            SET payout = amount * 2, status = 'Won' 
            WHERE battle_id = $1 AND predicted_winner = $2`,
            [battleId, winnerId]
        );

        //  Registrar apuestas perdedoras
        await client.query(
            `UPDATE Bet 
            SET payout = 0, status = 'Lost' 
            WHERE battle_id = $1 AND predicted_winner != $2`,
            [battleId, winnerId]
        );

        await client.query('COMMIT');
        res.json({ message: "Batalla cerrada, apuestas finalizadas y pagos aplicados." });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error al cerrar batalla:", error);
        res.status(500).json({ error: "Error al cerrar batalla." });

    } finally {
        client.release();
    }
};

const adjustSponsorLoyalty = async (client: any, winnerId: string, loserId: string) => {
    //  Buscar Sponsors que donaron items a estos Contestants
    const sponsors = await client.query(
        'SELECT giver_id FROM public.contestantitems WHERE contestant_id IN ($1, $2)',
        [winnerId, loserId]
    );

    for (const sponsor of sponsors.rows) {
        const sponsorId = sponsor.sponsor_id;

        if (winnerId === sponsorId) {
            //  Sponsor apoyó al ganador → Aumenta fidelidad
            await client.query(
                'UPDATE Sponsor SET loyalty_score = LEAST(loyalty_score + 5, 100) WHERE id = $1',
                [sponsorId]
            );
        } else {
            //  Sponsor apoyó al perdedor → Disminuye fidelidad
            await client.query(
                'UPDATE Sponsor SET loyalty_score = GREATEST(loyalty_score - 10, 0) WHERE id = $1',
                [sponsorId]
            );
        }
    }
};

// obtener las batallas en admin 
export const getProposedBattles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Consultar todas las batallas con el estado 'Pending'
        const battles = await pool.query(
            'SELECT * FROM Battle WHERE status = \'Pending\' ORDER BY date ASC'
        );

        if (battles.rows.length === 0) {
            res.status(404).json({ message: "No hay batallas pendientes de aprobación." });
            return;
        }

        res.json({ battles: battles.rows });

    } catch (error) {
        console.error("Error al obtener las batallas propuestas:", error);
        res.status(500).json({ error: "Error al obtener las batallas propuestas." });
    }
};

//obtener los contestants de otros dictadores
export const getAvailableOpponents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user!.id; //  ID del usuario autenticado

    try {
        // Obtener el ID del Dictador autenticado
        const dictatorResult = await pool.query('SELECT id FROM Dictator WHERE user_id = $1', [userId]);

        if (dictatorResult.rows.length === 0) {
            res.status(403).json({ error: "No tienes permiso para ver esta información." });
            return;
        }

        const dictatorId = dictatorResult.rows[0].id; //  ID del dictador autenticado

        // Obtener los Contestants de otros dictadores que estén vivos
        const result = await pool.query(`
            SELECT 
                c.id AS contestant_id, c.name AS contestant_name, c.strength, c.agility, 
                d.id AS dictator_id, d.name AS dictator_name, d.territory
            FROM Contestant c
            JOIN Dictator d ON c.dictator_id = d.id
            WHERE c.dictator_id <> $1 AND c.status = 'Alive'
        `, [dictatorId]);

        res.json(result.rows);

    } catch (error) {
        console.error("Error al obtener oponentes disponibles:", error);
        res.status(500).json({ error: "Error al obtener oponentes disponibles." });
    }
};


// Un Dictador propone una batalla
export const proposeBattle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user!.id;
    let { contestant1, contestant2 } = req.body;

    try {
        //  1. Convertir los IDs a formato UUID asegurado
        contestant1 = String(contestant1).trim();
        contestant2 = String(contestant2).trim();

        if (!contestant1 || !contestant2) {
            res.status(400).json({ error: "Se requieren ambos IDs de Contestants." });
            return;
        }

        //  2. Obtener el ID del Dictador autenticado
        const dictatorResult = await pool.query('SELECT id FROM Dictator WHERE user_id = $1', [userId]);

        if (dictatorResult.rows.length === 0) {
            res.status(403).json({ error: "No tienes permiso para proponer batallas." });
            return;
        }

        const dictatorId = dictatorResult.rows[0].id; //  ID del dictador autenticado

        //  3. Obtener información de los Contestants con conversión explícita a UUID
        const [c1, c2] = await Promise.all([
            pool.query('SELECT * FROM Contestant WHERE id::uuid = $1', [contestant1]),
            pool.query('SELECT * FROM Contestant WHERE id::uuid = $1', [contestant2])
        ]);

        if (c1.rows.length === 0 || c2.rows.length === 0) {
            res.status(400).json({ error: "Uno o ambos Contestants no existen." });
            return;
        }

        const contestant1Data = c1.rows[0];
        const contestant2Data = c2.rows[0];

        //  4. Validaciones
        if (contestant1Data.dictator_id === contestant2Data.dictator_id) {
            res.status(400).json({ error: "No puedes proponer una batalla entre tus propios Contestants." });
            return;
        }

        if (contestant1Data.dictator_id !== dictatorId && contestant2Data.dictator_id !== dictatorId) {
            res.status(400).json({ error: "Debes seleccionar al menos un Contestant propio." });
            return;
        }

        //  5. Registrar la batalla como "Pending Approval"
        const result = await pool.query(
            `INSERT INTO Battle (contestant_1, contestant_2, dictator_id, status) 
             VALUES ($1::uuid, $2::uuid, $3::uuid, 'Pending') RETURNING *`,
            [contestant1, contestant2, dictatorId]
        );

        res.status(201).json({ message: "Batalla propuesta. Esperando aprobación del Admin.", battle: result.rows[0] });

    } catch (error) {
        console.error("Error al proponer batalla:", error);
        res.status(500).json({ error: "Error al proponer batalla." });
    }
};


export const approveBattle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { battleId, eventName } = req.body; // Esperamos que el nombre del evento sea enviado en el cuerpo de la solicitud.

    try {
        // 1. Consultar la batalla pendiente
        const battle = await pool.query(
            'SELECT * FROM Battle WHERE id = $1 AND status = \'Pending\'',
            [battleId]
        );

        if (battle.rows.length === 0) {
            res.status(400).json({ error: "La batalla no está pendiente de aprobación." });
            return;
        }

        // 2. Obtener el dictator_id de la batalla
        const dictatorId = battle.rows[0].dictator_id;

        // 3. Consultar los detalles del dictador utilizando dictator_id
        const dictatorResult = await pool.query(
            'SELECT * FROM Dictator WHERE id = $1',
            [dictatorId]
        );

        if (dictatorResult.rows.length === 0) {
            res.status(404).json({ error: "No se encontró al dictador." });
            return;
        }

        // 4. Aprobar la batalla
        await pool.query(
            'UPDATE Battle SET status = \'Approved\' WHERE id = $1',
            [battleId]
        );

        // 5. Verificar si ya existe un evento con el mismo nombre
        let event = await pool.query(
            'SELECT * FROM Event WHERE name = $1',
            [eventName]
        );

        // Si el evento no existe, crearlo con reglas predeterminadas
        if (event.rows.length === 0) {
            const defaultRules = "Duelo a Muerte"; // Puedes cambiarlo o parametrizarlo

            event = await pool.query(
                'INSERT INTO Event (name, organizer_id, start_date, rules) VALUES ($1, $2, CURRENT_TIMESTAMP, $3) RETURNING id',
                [eventName, dictatorId, defaultRules] // Agregamos la columna rules
            );
        }

        // 6. Asociar la batalla al evento
        await pool.query(
            'INSERT INTO EventBattle (event_id, battle_id) VALUES ($1, $2)',
            [event.rows[0].id, battleId]
        );

        // 7. Actualizar las fechas del evento: start_date y end_date
        const eventBattles = await pool.query(
            'SELECT b.date FROM Battle b ' +
            'JOIN EventBattle eb ON eb.battle_id = b.id ' +
            'WHERE eb.event_id = $1 ORDER BY b.date ASC',
            [event.rows[0].id]
        );

        if (eventBattles.rows.length > 0) {
            const startDate = eventBattles.rows[0].date;
            const endDate = eventBattles.rows[eventBattles.rows.length - 1].date;

            // Actualizar el evento con las fechas correctas
            await pool.query(
                'UPDATE Event SET start_date = $1, end_date = $2 WHERE id = $3',
                [startDate, endDate, event.rows[0].id]
            );
        }

        res.json({ message: "Batalla aprobada y asociada al evento correctamente." });

    } catch (error) {
        console.error("Error al aprobar la batalla y asociarla al evento:", error);
        res.status(500).json({ error: "Error al aprobar la batalla y asociarla al evento." });
    }
};