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
import exportRouter from "./export";
import androidRouter from "./android";
import dnsRouter from "./dns";
import notificationsRouter from "./notifications";
import analyticsRouter from "./analytics";
import reportsRouter from "./reports";

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
router.use(exportRouter);
router.use(androidRouter);
router.use(dnsRouter);
router.use(notificationsRouter);
router.use(analyticsRouter);
router.use(reportsRouter);

export default router;
