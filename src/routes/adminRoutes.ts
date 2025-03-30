import express from 'express';
import { authenticate, restrictByRole} from '../middlewares/authMiddleware';
import { registerSponsor, registerDictator } from '../controllers/authController';
import { deleteUser, getUsers, unlockUser } from '../controllers/adminController';
import { getProposedBattles, approveBattle, startBattle, closeBattle } from '../controllers/battleController';
import { listActiveEvents } from '../controllers/eventController';

const router = express.Router();

// Solo Admin puede crear dictadores y sponsors
router.post('/register-dictator', authenticate, restrictByRole(['Admin']), registerDictator);
router.post('/register-sponsor', authenticate, restrictByRole(['Admin']), registerSponsor);
router.get('/users', authenticate, restrictByRole(['Admin']), getUsers);
router.delete('/users/:id', authenticate, restrictByRole(['Admin']), deleteUser);
router.post('/unlock-user', authenticate, restrictByRole(['Admin']), unlockUser);
router.get('/get-Pending-Battles', authenticate, restrictByRole(['Admin']), getProposedBattles);
router.post('/Aprove-Battles', authenticate, restrictByRole(['Admin']), approveBattle);
router.post('/start/:battleId', authenticate, restrictByRole(['Admin']), startBattle);
router.get("/events/active", authenticate, restrictByRole(['Admin']), listActiveEvents);
router.post('/Close/:battleId', authenticate, restrictByRole(['Admin']), closeBattle);

export default router;