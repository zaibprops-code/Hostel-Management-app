import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { env } from "./env";

export interface JwtPayload {
  sub: string; // user id
  companyId: string;
  role: Role;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpires as jwt.SignOptions["expiresIn"],
  });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpires as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwt.accessSecret) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwt.refreshSecret) as JwtPayload;
}
