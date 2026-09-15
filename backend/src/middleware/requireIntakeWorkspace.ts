import { NextFunction, Request, Response } from "express";
import { AuthenticatedSilRequest } from "./requireSilAuth";

export function intakeWorkspace(req: Request): string {
  const orgScope = (req as AuthenticatedSilRequest).silAuth?.orgScope?.trim();
  if (!orgScope) throw new Error("An authenticated organization scope is required for data intake.");
  return orgScope;
}

export function requireIntakeWorkspace(req: Request, res: Response, next: NextFunction) {
  if (!(req as AuthenticatedSilRequest).silAuth?.orgScope?.trim()) {
    res.status(403).json({ error: "An authenticated organization scope is required for data intake." });
    return;
  }
  next();
}
