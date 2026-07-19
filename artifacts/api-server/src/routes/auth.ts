import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import type { Request, Response } from "express";

const router = Router();

router.get("/me", requireAuth, (req: Request, res: Response) => {
  res.json(req.authUser);
});

router.post("/logout", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

export default router;
