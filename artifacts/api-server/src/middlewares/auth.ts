import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

export interface AuthUser {
  id: string;
  email: string | null;
  role: "admin" | "counselor" | "user";
  discord_id: string | null;
  username: string | null;
  avatar: string | null;
  display_name: string | null;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization token" });
    return;
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    // Get user record from our users table
    const { data: userRecord } = await supabaseAdmin
      .from("users")
      .select("id, discord_id, username, display_name, avatar, email, role")
      .eq("id", user.id)
      .single();

    if (!userRecord) {
      // Auto-create user record on first access
      const metadata = user.user_metadata;
      const newUser = {
        id: user.id,
        discord_id: metadata.provider_id || metadata.sub || null,
        username: metadata.custom_claims?.global_name || metadata.full_name || metadata.name || "Unknown",
        display_name: metadata.full_name || metadata.name || null,
        avatar: metadata.avatar_url || null,
        email: user.email || null,
        role: "user" as const,
        last_login: new Date().toISOString(),
      };

      const { data: created } = await supabaseAdmin
        .from("users")
        .insert(newUser)
        .select()
        .single();

      req.authUser = created || { ...newUser };
    } else {
      // Update last_login
      await supabaseAdmin
        .from("users")
        .update({ last_login: new Date().toISOString() })
        .eq("id", user.id);

      req.authUser = userRecord;
    }

    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: ("admin" | "counselor" | "user")[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.authUser.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
