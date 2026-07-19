import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import type { Request, Response } from "express";

const router = Router();

// GET /api/auth/me
router.get("/me", requireAuth, (req: Request, res: Response) => {
  res.json(req.authUser);
});

// POST /api/auth/signup — creates user with email pre-confirmed (no verification email)
router.post("/signup", async (req: Request, res: Response) => {
  const { email, password, username } = req.body;
  if (!email || !password || !username) {
    res.status(400).json({ error: "이메일, 비밀번호, 닉네임을 모두 입력해주세요." });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "비밀번호는 최소 6자 이상이어야 합니다." });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip email verification
    user_metadata: { username, full_name: username },
  });

  if (error) {
    const msg = error.message.includes("already been registered")
      ? "이미 사용 중인 이메일입니다."
      : error.message;
    res.status(400).json({ error: msg });
    return;
  }

  res.json({ user_id: data.user.id });
});

// POST /api/auth/logout
router.post("/logout", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

export default router;
