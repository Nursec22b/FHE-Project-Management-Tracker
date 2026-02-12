import { Router, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../db/pool';
import { config } from '../config';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { ConflictError, AuthenticationError, NotFoundError } from '../middleware/errorHandler';

const router = Router();

// ------------------------------------------------------------------ //
//  Validation schemas                                                 //
// ------------------------------------------------------------------ //

const registerSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  displayName: z.string().min(1, 'Display name is required').max(255),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
});

// ------------------------------------------------------------------ //
//  Helpers                                                            //
// ------------------------------------------------------------------ //

function generateToken(user: { id: string; email: string; role: string }): string {
  const options: jwt.SignOptions = {
    expiresIn: config.jwt.expiresIn as any,
  };
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.jwt.secret,
    options,
  );
}

// ------------------------------------------------------------------ //
//  POST /register                                                     //
// ------------------------------------------------------------------ //

router.post(
  '/register',
  validate(registerSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { email, password, displayName } = req.body;

      // Check if user already exists
      const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        throw new ConflictError('A user with this email already exists');
      }

      // Hash password
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(password, salt);

      // Insert user
      const result = await query(
        `INSERT INTO users (email, password_hash, display_name)
         VALUES ($1, $2, $3)
         RETURNING id, email, display_name, role, avatar_url, created_at`,
        [email, passwordHash, displayName],
      );

      const user = result.rows[0];
      const token = generateToken({ id: user.id, email: user.email, role: user.role });

      res.status(201).json({
        token,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          role: user.role,
          avatarUrl: user.avatar_url,
          createdAt: user.created_at,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  POST /login                                                        //
// ------------------------------------------------------------------ //

router.post(
  '/login',
  validate(loginSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      // Look up user by email
      const result = await query(
        `SELECT id, email, password_hash, display_name, role, avatar_url, is_active, created_at
         FROM users
         WHERE email = $1`,
        [email],
      );

      if (result.rows.length === 0) {
        throw new AuthenticationError('Invalid email or password');
      }

      const user = result.rows[0];

      if (!user.is_active) {
        throw new AuthenticationError('Account has been deactivated');
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        throw new AuthenticationError('Invalid email or password');
      }

      const token = generateToken({ id: user.id, email: user.email, role: user.role });

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          role: user.role,
          avatarUrl: user.avatar_url,
          createdAt: user.created_at,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  GET /me                                                            //
// ------------------------------------------------------------------ //

router.get(
  '/me',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await query(
        `SELECT id, email, display_name, role, avatar_url, is_active, created_at, updated_at
         FROM users
         WHERE id = $1`,
        [req.user!.id],
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('User not found');
      }

      const user = result.rows[0];

      res.json({
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        avatarUrl: user.avatar_url,
        isActive: user.is_active,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  PUT /me                                                            //
// ------------------------------------------------------------------ //

router.put(
  '/me',
  authenticate,
  validate(updateProfileSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { displayName, avatarUrl } = req.body;

      // Build dynamic SET clause based on provided fields
      const setClauses: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (displayName !== undefined) {
        setClauses.push(`display_name = $${paramIndex++}`);
        params.push(displayName);
      }

      if (avatarUrl !== undefined) {
        setClauses.push(`avatar_url = $${paramIndex++}`);
        params.push(avatarUrl);
      }

      if (setClauses.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }

      params.push(req.user!.id);

      const result = await query(
        `UPDATE users
         SET ${setClauses.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING id, email, display_name, role, avatar_url, is_active, created_at, updated_at`,
        params,
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('User not found');
      }

      const user = result.rows[0];

      res.json({
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        avatarUrl: user.avatar_url,
        isActive: user.is_active,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
