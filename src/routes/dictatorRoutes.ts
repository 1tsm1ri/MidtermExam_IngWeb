import express from 'express';
import { authenticate,  restrictByRole,  isActiveDictator, ownsContestant} from '../middlewares/authMiddleware';
import { createContestant, getContestants, updateContestant, releaseContestant,  giveItem, applyBuff} from '../controllers/contestantController';
import { buyItemFromBlackMarket,  getBlackMarketItems } from '../controllers/marketController';
import { placeBet } from '../controllers/betController';
import { getAvailableOpponents, proposeBattle} from '../controllers/battleController';
import { applyBuffDuringBattle } from '../controllers/sponsorController';

const router = express.Router();

router.get('/contestants', authenticate, restrictByRole(['Dictator']), getContestants);
router.post('/add-contestants', authenticate, restrictByRole(['Dictator']), isActiveDictator, createContestant);
router.get('/blackmarket/Activity', authenticate, restrictByRole(['Dictator']), isActiveDictator, getBlackMarketItems);
router.post('/blackmarket/buy-item', authenticate, restrictByRole(['Dictator']), isActiveDictator, buyItemFromBlackMarket);
router.post('/give-item', authenticate, restrictByRole(['Dictator']), giveItem);
router.post('/apply-buff', authenticate, restrictByRole(['Dictator']), applyBuff);
router.post('/apply-buff/battle', authenticate, restrictByRole(['Dictator']), applyBuffDuringBattle);
router.put('/contestants/:contestantId', authenticate, restrictByRole(['Dictator']), isActiveDictator,  updateContestant);
router.delete('/Release-contestants/:contestantId', authenticate, restrictByRole(['Dictator']), isActiveDictator, releaseContestant);
router.get('/available-opponents', authenticate, restrictByRole(['Dictator']), isActiveDictator, getAvailableOpponents);
router.post('/propose-battle', authenticate, restrictByRole(['Dictator']), isActiveDictator, proposeBattle);
router.post("/place-bet", authenticate, restrictByRole(['Dictator']), isActiveDictator, placeBet);


export default router;