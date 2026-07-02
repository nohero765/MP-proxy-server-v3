import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import loonRouter from "./loon.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(loonRouter);

export default router;
