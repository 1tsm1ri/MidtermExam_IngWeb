import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/db';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: string };
    }
  }
}

//   Middleware para verificar autenticación
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    res.status(401).send('Acceso denegado');
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
    const user = await pool.query('SELECT * FROM "User" WHERE id = $1', [decoded.id]);
    if (!user.rows[0]) {
      res.status(401).send('Token inválido');
      return;
    }
    req.user = user.rows[0];
    next();
  } catch (error) {
    res.status(401).send('Token inválido');
  }
};

export const isActiveDictator = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const dictator = await pool.query('SELECT * FROM Dictator WHERE user_id = $1 AND loyalty_score > 0', [req.user!.id]);

  if (dictator.rows.length === 0) {
      res.status(403).send({ error: "Has perdido acceso al sistema por falta de fidelidad." });
      return;
  }

  next();
};


export const ownsContestant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const contestantId = req.params.id;
  const userId = req.user!.id;

  const contestant = await pool.query(
      'SELECT * FROM Contestant WHERE id = $1 AND dictator_id = (SELECT id FROM Dictator WHERE user_id = $2)', 
      [contestantId, userId]
  );

  if (contestant.rows.length === 0) {
      res.status(403).send({ error: "No tienes permiso para modificar este Contestant." });
      return;
  }

  next();
};


export const hasItemInInventory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const sponsorId = req.user!.id;
  const { itemName } = req.body;

  const item = await pool.query(
      'SELECT * FROM SponsorInventory WHERE sponsor_id = $1 AND item_name = $2',
      [sponsorId, itemName]
  );

  if (item.rows.length === 0 || item.rows[0].quantity <= 0) {
      res.status(400).json({ error: "No tienes suficiente cantidad de este item." });
      return;
  }

  next();
};


export const validBattleProposal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { contestant1, contestant2 } = req.body;

  const [c1, c2] = await Promise.all([
      pool.query('SELECT dictator_id FROM Contestant WHERE id = $1', [contestant1]),
      pool.query('SELECT dictator_id FROM Contestant WHERE id = $2', [contestant2])
  ]);

  if (c1.rows.length === 0 || c2.rows.length === 0) {
      res.status(400).json({ error: "Uno o ambos Contestants no existen." });
      return;
  }

  if (c1.rows[0].dictator_id === c2.rows[0].dictator_id) {
      res.status(400).json({ error: "No puedes proponer una batalla entre tus propios Contestants." });
      return;
  }

  next();
};



export const restrictByRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
      if (!allowedRoles.includes(req.user!.role)) {
          res.status(403).send({ error: "No tienes permiso para acceder a esta función." });
          return;
      }
      next();
  };
};