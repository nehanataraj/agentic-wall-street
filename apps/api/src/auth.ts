import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import * as jose from "jose";

// ─── OAuth / Bearer token middleware ─────────────────────────────────────────
// Validates JWT Bearer tokens issued by the configured OIDC provider.
// Attaches verified token payload to req.auth.
// Never issues or stores tokens — purely a resource server.

export interface AuthInfo {
  agentId: string;
  operatorId: string;
  scopes: string[];
  sub: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthInfo;
    }
  }
}

const TokenClaimsSchema = z.object({
  sub: z.string(),
  agent_id: z.string().uuid(),
  operator_id: z.string().uuid(),
  scope: z.string(),
});

export function createBearerAuth(issuer: string, audience: string) {
  let jwks: ReturnType<typeof jose.createRemoteJWKSet> | null = null;

  function getJwks() {
    if (!jwks) {
      jwks = jose.createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    }
    return jwks;
  }

  return async function bearerAuth(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({
        error: "unauthorized",
        resource_metadata_url: `${req.protocol}://${req.get("host")}/.well-known/oauth-protected-resource`,
      });
      return;
    }

    const token = authHeader.slice(7);
    try {
      const { payload } = await jose.jwtVerify(token, getJwks(), {
        issuer,
        audience,
      });

      const claims = TokenClaimsSchema.parse(payload);
      req.auth = {
        sub: claims.sub,
        agentId: claims.agent_id,
        operatorId: claims.operator_id,
        scopes: claims.scope.split(" "),
      };
      next();
    } catch (err) {
      res.status(401).json({ error: "invalid_token" });
    }
  };
}

export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth?.scopes.includes(scope)) {
      res.status(403).json({ error: "insufficient_scope", required: scope });
      return;
    }
    next();
  };
}
