import { Request, Response ,  NextFunction} from 'express';
import pool from '../config/db';

// Apostar en una batalla
export const placeBet = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user!.id;
    const { battleId, predictedWinner, amount } = req.body;

    try {
        // Verificar si el usuario es Dictador o Sponsor
        const dictator = await pool.query('SELECT * FROM Dictator WHERE user_id = $1', [userId]);
        const sponsor = await pool.query('SELECT * FROM Sponsor WHERE user_id = $1', [userId]);

        if (dictator.rows.length === 0 && sponsor.rows.length === 0) {
            res.status(403).json({ error: "Solo los Dictadores y Sponsors pueden apostar." });
            return;
        }

        // Obtener el ID y tipo de apostador
        const bettorId = dictator.rows.length > 0 ? dictator.rows[0].id : sponsor.rows[0].id;
        const bettorType = dictator.rows.length > 0 ? "Dictator" : "Sponsor";

        // Verificar que la batalla está activa
        const battle = await pool.query(
            'SELECT * FROM Battle WHERE id = $1 AND status = \'Approved\'',
            [battleId]
        );

        if (battle.rows.length === 0) {
            res.status(400).json({ error: "La batalla no está activa o no existe." });
            return;
        }

        // Verificar que un Dictador no apueste en batallas de sus propios esclavos
        if (bettorType === "Dictator") {
            const contestantOwned = await pool.query(
                'SELECT * FROM Contestant WHERE (id = $1 OR id = $2) AND dictator_id = $3',
                [battle.rows[0].contestant_1, battle.rows[0].contestant_2, bettorId]
            );

            if (contestantOwned.rows.length > 0) {
                res.status(403).json({ error: "No puedes apostar en batallas de tus propios esclavos." });
                return;
            }
        }

        // Verificar que el usuario no haya apostado más de 2 veces en la misma batalla
        const existingBets = await pool.query(
            'SELECT COUNT(*) FROM Bet WHERE battle_id = $1 AND bettor_id = $2',
            [battleId, bettorId]
        );

        if (parseInt(existingBets.rows[0].count) >= 2) {
            res.status(403).json({ error: "No puedes apostar más de dos veces en la misma batalla." });
            return;
        }

        // Registrar la apuesta
        await pool.query(
            `INSERT INTO Bet (battle_id, bettor_id, bettor_type, amount, predicted_winner, bet_date) 
            VALUES ($1, $2, $3, $4, $5, NOW())`,
            [battleId, bettorId, bettorType, amount, predictedWinner]
        );

        res.status(201).json({ message: "Apuesta registrada con éxito." });

    } catch (error) {
        console.error("Error al registrar apuesta:", error);
        res.status(500).json({ error: "Error al registrar apuesta." });
        return;
    }
};


export const getBetsByBattle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { battleId } = req.params;

    try {
        const bets = await pool.query(
            'SELECT * FROM Bet WHERE battle_id = $1',
            [battleId]
        );

        res.json(bets.rows);

    } catch (error) {
        console.error("Error al obtener apuestas:", error);
        res.status(500).json({ error: "Error al obtener apuestas." });
    }
};


const processBets = async (client: any, battleId: string, winnerId: string, next: NextFunction): Promise<void> => {
    //  Obtener todas las apuestas de la batalla
    const bets = await client.query('SELECT * FROM Bet WHERE battle_id = $1', [battleId]);

    for (const bet of bets.rows) {
        const { id, dictator_id, amount, predicted_winner } = bet;

        if (predicted_winner === winnerId) {
            //  Apuesta acertada: Ganancia = Doble del monto apostado
            const payout = amount * 2;

            await client.query(
                'UPDATE Bet SET status = \'Won\', payout = $1 WHERE id = $2',
                [payout, id]
            );

            if (dictator_id) {
                //  Si es un Dictador, aumentar fidelidad con el Admin
                await client.query(
                    'UPDATE Dictator SET loyalty_score = LEAST(loyalty_score + 5, 100) WHERE id = $1',
                    [dictator_id]
                );
            }
        } else {
            //  Apuesta fallida: No hay pago, pero disminuye fidelidad
            await client.query(
                'UPDATE Bet SET status = \'Lost\', payout = 0 WHERE id = $1',
                [id]
            );

            if (dictator_id) {
                await client.query(
                    'UPDATE Dictator SET loyalty_score = GREATEST(loyalty_score - 10, 0) WHERE id = $1',
                    [dictator_id]
                );
            }
        }
    }
};


export const getBetStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { betId } = req.params;

    try {
        const bet = await pool.query(
            'SELECT * FROM Bet WHERE id = $1',
            [betId]
        );

        if (bet.rows.length === 0) {
            res.status(404).json({ error: "Apuesta no encontrada." });
            return;
        }

        res.json(bet.rows[0]);

    } catch (error) {
        console.error("Error al obtener estado de apuesta:", error);
        res.status(500).json({ error: "Error al obtener apuesta." });
    }
};

