import { Router, Response, NextFunction } from 'express';
import { query } from '../db/pool';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { NotFoundError } from '../middleware/errorHandler';

const router = Router();

// ------------------------------------------------------------------ //
//  All routes require authentication                                  //
// ------------------------------------------------------------------ //

router.use(authenticate);

// ------------------------------------------------------------------ //
//  GET /  -  list all active users (for assignment dropdowns, etc.)   //
// ------------------------------------------------------------------ //

router.get(
  '/',
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await query(
        `SELECT id, email, display_name, avatar_url, role, created_at
         FROM users
         WHERE is_active = true
         ORDER BY display_name ASC`,
      );

      const users = result.rows.map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        role: row.role,
        createdAt: row.created_at,
      }));

      res.json(users);
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  GET /:userId  -  get a single user's profile                       //
// ------------------------------------------------------------------ //

router.get(
  '/:userId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;

      const result = await query(
        `SELECT id, email, display_name, avatar_url, role, created_at
         FROM users
         WHERE id = $1 AND is_active = true`,
        [userId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('User not found');
      }

      const user = result.rows[0];

      res.json({
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        role: user.role,
        createdAt: user.created_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
