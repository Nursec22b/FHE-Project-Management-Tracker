import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { query } from '../db/pool';

// ------------------------------------------------------------------ //
//  Custom Request interface that carries the authenticated user       //
// ------------------------------------------------------------------ //

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

// ------------------------------------------------------------------ //
//  authenticate  - verifies JWT and attaches user to the request      //
// ------------------------------------------------------------------ //

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ error: 'Authentication required. No token provided.' });
      return;
    }

    // Expect "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      res.status(401).json({ error: 'Invalid authorization format. Expected: Bearer <token>' });
      return;
    }

    const token = parts[1];

    // Verify the token
    let decoded: jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, config.jwt.secret) as jwt.JwtPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        res.status(401).json({ error: 'Token has expired.' });
        return;
      }
      if (err instanceof jwt.JsonWebTokenError) {
        res.status(401).json({ error: 'Invalid token.' });
        return;
      }
      throw err;
    }

    // Ensure the token payload contains a user id
    if (!decoded.sub && !decoded.id) {
      res.status(401).json({ error: 'Malformed token payload.' });
      return;
    }

    const userId = decoded.sub || decoded.id;

    // Look up the user in the database to confirm they still exist and
    // fetch their current role (in case it changed since the token was issued).
    const result = await query(
      'SELECT id, email, role FROM users WHERE id = $1',
      [userId],
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'User no longer exists.' });
      return;
    }

    const user = result.rows[0];
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (err) {
    next(err);
  }
}

// ------------------------------------------------------------------ //
//  requireAdmin  - rejects non-admin users with 403                   //
// ------------------------------------------------------------------ //

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required.' });
    return;
  }

  next();
}
