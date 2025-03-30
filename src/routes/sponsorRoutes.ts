import express from 'express';
import { authenticate, restrictByRole, hasItemInInventory } from '../middlewares/authMiddleware';
import { giveItem, addItemToInventory, applyBuff, applyBuffDuringBattle,  getSponsorInventory, getAllContestants, getSponsorBlackMarketItems, removeBlackMarketListing , listActiveBattles} from '../controllers/sponsorController';
import { sellItemInBlackMarket } from '../controllers/marketController';
import { placeBet } from '../controllers/betController';


const router = express.Router();

//  Solo los Sponsors pueden acceder a estas rutas
router.get('/contestants', authenticate, restrictByRole(['Sponsor']), getAllContestants);
router.post('/give-item', authenticate, restrictByRole(['Sponsor']), giveItem);
router.get('/inventory', authenticate, restrictByRole(['Sponsor']), getSponsorInventory);
router.post('/blackmarket/offer-item', authenticate, restrictByRole(['Sponsor']), sellItemInBlackMarket);
router.post('/add-item', authenticate, restrictByRole(['Sponsor']), addItemToInventory);
router.get("/blackmarket/listings",authenticate,restrictByRole(["Sponsor"]),getSponsorBlackMarketItems);
router.delete("/blackmarket/remove-listing",authenticate,restrictByRole(["Sponsor"]),removeBlackMarketListing);
router.get('/battles/active', authenticate, restrictByRole(['Sponsor']), listActiveBattles);
router.post('/apply-buff', authenticate, restrictByRole(['Sponsor']), applyBuff);
router.post('/apply-buff/battle', authenticate, restrictByRole(['Sponsor']), applyBuffDuringBattle);
router.post("/place-bet", authenticate, restrictByRole(['Sponsor']), placeBet);

export default router;