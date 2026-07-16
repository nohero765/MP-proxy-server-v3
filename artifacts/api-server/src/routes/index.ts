import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import loonRouter from "./loon.js";
import authRouter, { requireAuth } from "./auth.js";

const router: IRouter = Router();

// Public: login / logout / status
router.use(authRouter);

// Everything below requires a valid session
router.use(requireAuth);
router.use(healthRouter);
router.use(loonRouter);

export default router;
