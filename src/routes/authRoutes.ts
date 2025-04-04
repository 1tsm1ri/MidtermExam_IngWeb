import express from 'express';
import { register, login } from '../controllers/authController';
import { authenticate } from '../middlewares/authMiddleware';
import { activateUser } from '../controllers/authController';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/activate', authenticate, activateUser);

export default router;