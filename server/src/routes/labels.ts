import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler';

const router = Router();

// ------------------------------------------------------------------ //
//  Validation schemas                                                 //
// ------------------------------------------------------------------ //

const createLabelSchema = z.object({
  boardId: z.string().uuid('Invalid board ID'),
  name: z.string().max(100).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color').default('#61BD4F'),
});

const updateLabelSchema = z.object({
  name: z.string().max(100).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color').optional(),
});

// ------------------------------------------------------------------ //
//  Helpers                                                            //
// ------------------------------------------------------------------ //

async function verifyBoardMembership(boardId: string, userId: string): Promise<void> {
  const boardResult = await query(
    'SELECT id FROM boards WHERE id = $1 AND is_archived = false',
    [boardId],
  );
  if (boardResult.rows.length === 0) {
    throw new NotFoundError('Board not found');
  }

  const memberResult = await query(
    'SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2',
    [boardId, userId],
  );
  if (memberResult.rows.length === 0) {
    throw new ForbiddenError('You are not a member of this board');
  }
}

// ------------------------------------------------------------------ //
//  All routes require authentication                                  //
// ------------------------------------------------------------------ //

router.use(authenticate);

// ------------------------------------------------------------------ //
//  GET /board/:boardId  -  list labels for a board                    //
// ------------------------------------------------------------------ //

router.get(
  '/board/:boardId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { boardId } = req.params;

      await verifyBoardMembership(boardId, req.user!.id);

      const result = await query(
        'SELECT id, board_id, name, color FROM labels WHERE board_id = $1 ORDER BY name',
        [boardId],
      );

      const labels = result.rows.map((row) => ({
        id: row.id,
        boardId: row.board_id,
        name: row.name,
        color: row.color,
      }));

      res.json(labels);
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  POST /  -  create a label                                          //
// ------------------------------------------------------------------ //

router.post(
  '/',
  validate(createLabelSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { boardId, name, color } = req.body;

      await verifyBoardMembership(boardId, req.user!.id);

      const result = await query(
        `INSERT INTO labels (board_id, name, color)
         VALUES ($1, $2, $3)
         RETURNING id, board_id, name, color`,
        [boardId, name || null, color],
      );

      const label = result.rows[0];

      res.status(201).json({
        id: label.id,
        boardId: label.board_id,
        name: label.name,
        color: label.color,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  PUT /:labelId  -  update a label                                   //
// ------------------------------------------------------------------ //

router.put(
  '/:labelId',
  validate(updateLabelSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { labelId } = req.params;
      const { name, color } = req.body;

      // Fetch the label and verify board membership
      const labelResult = await query(
        'SELECT id, board_id, name, color FROM labels WHERE id = $1',
        [labelId],
      );
      if (labelResult.rows.length === 0) {
        throw new NotFoundError('Label not found');
      }

      await verifyBoardMembership(labelResult.rows[0].board_id, req.user!.id);

      const setClauses: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (name !== undefined) {
        setClauses.push(`name = $${paramIndex++}`);
        params.push(name);
      }
      if (color !== undefined) {
        setClauses.push(`color = $${paramIndex++}`);
        params.push(color);
      }

      if (setClauses.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }

      params.push(labelId);

      const result = await query(
        `UPDATE labels SET ${setClauses.join(', ')} WHERE id = $${paramIndex}
         RETURNING id, board_id, name, color`,
        params,
      );

      const label = result.rows[0];

      res.json({
        id: label.id,
        boardId: label.board_id,
        name: label.name,
        color: label.color,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  DELETE /:labelId  -  delete a label                                //
// ------------------------------------------------------------------ //

router.delete(
  '/:labelId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { labelId } = req.params;

      // Fetch the label and verify board membership
      const labelResult = await query(
        'SELECT id, board_id FROM labels WHERE id = $1',
        [labelId],
      );
      if (labelResult.rows.length === 0) {
        throw new NotFoundError('Label not found');
      }

      await verifyBoardMembership(labelResult.rows[0].board_id, req.user!.id);

      // Deleting the label will cascade-delete card_labels rows
      await query('DELETE FROM labels WHERE id = $1', [labelId]);

      res.json({ message: 'Label deleted successfully' });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
