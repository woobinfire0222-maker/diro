import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import ordersRouter from "./orders.js";
import messagesRouter from "./messages.js";
import projectsRouter from "./projects.js";
import paymentsRouter from "./payments.js";
import notificationsRouter from "./notifications.js";
import discordRouter from "./discord.js";
import adminRouter from "./admin.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/orders", ordersRouter);
router.use("/orders/:orderId/messages", messagesRouter);
router.use("/projects", projectsRouter);
router.use("/payments", paymentsRouter);
router.use("/notifications", notificationsRouter);
router.use("/discord", discordRouter);
router.use("/admin", adminRouter);

export default router;
