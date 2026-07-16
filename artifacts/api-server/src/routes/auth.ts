import { Router, type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual } from "crypto";

declare module "express-session" {
  interface SessionData {
    authenticated: boolean;
  }
}

const router = Router();

function checkPassword(input: string, expected: string): boolean {
  if (input.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(input), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Middleware — attach to routes that require login */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session?.authenticated === true) return next();
  res.status(401).json({ error: "Unauthorized" });
}

router.post("/auth/login", (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  const expected = process.env["DASHBOARD_PASSWORD"] ?? "";

  if (!password || !expected) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (checkPassword(password, expected)) {
    req.session.authenticated = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: "Incorrect password" });
  }
});

router.get("/auth/status", (req: Request, res: Response) => {
  res.json({ authenticated: req.session?.authenticated === true });
});

router.post("/auth/logout", (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

export default router;
