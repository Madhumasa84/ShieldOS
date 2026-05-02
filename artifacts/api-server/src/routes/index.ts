import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import vpnRouter from "./vpn";
import blocklistRouter from "./blocklist";
import threatsRouter from "./threats";
import dashboardRouter from "./dashboard";
import logRouter from "./log";
import statsRouter from "./stats";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(vpnRouter);
router.use(blocklistRouter);
router.use(threatsRouter);
router.use(dashboardRouter);
router.use(logRouter);
router.use(statsRouter);
router.use(adminRouter);

export default router;
