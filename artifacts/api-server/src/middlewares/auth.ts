import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

const SUPERADMIN_USERNAME = "bini2222";

export interface AuthUser {
  id: string;
  email: string | null;
  role: "admin" | "counselor" | "developer" | "user";
  discord_id: string | null;
  username: string | null;
  avatar: string | null;
  display_name: string | null;
  isSuperAdmin: boolean;
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
      const username = metadata.custom_claims?.global_name || metadata.full_name || metadata.name || "Unknown";
      const newUser = {
        id: user.id,
        discord_id: metadata.provider_id || metadata.sub || null,
        username,
        display_name: metadata.full_name || metadata.name || null,
        avatar: metadata.avatar_url || null,
        email: user.email || null,
        role: (username === SUPERADMIN_USERNAME ? "admin" : "user") as "admin" | "counselor" | "developer" | "user",
        last_login: new Date().toISOString(),
      };

      const { data: created } = await supabaseAdmin
        .from("users")
        .insert(newUser)
        .select()
        .single();

      const record = created || { ...newUser };
      req.authUser = { ...record, isSuperAdmin: record.username === SUPERADMIN_USERNAME };
    } else {
      // Update last_login
      await supabaseAdmin
        .from("users")
        .update({ last_login: new Date().toISOString() })
        .eq("id", user.id);

      // isSuperAdmin flag gives extra permissions on top of the user's actual DB role.
      // We do NOT force-override the role so that bini2222 can freely change their
      // own role in the admin panel and test the counselor / developer / user flows.
      req.authUser = {
        ...userRecord,
        isSuperAdmin: userRecord.username === SUPERADMIN_USERNAME,
      };
    }

    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: ("admin" | "counselor" | "developer" | "user")[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    // isSuperAdmin bypasses all role restrictions
    if (!roles.includes(req.authUser.role) && !req.authUser.isSuperAdmin) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
