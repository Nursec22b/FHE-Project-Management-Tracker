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

const createChecklistSchema = z.object({
  cardId: z.string().uuid('Invalid card ID'),
  title: z.string().min(1, 'Title is required').max(255).default('Checklist'),
});

const updateChecklistSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
});

const createItemSchema = z.object({
  content: z.string().min(1, 'Content is required').max(500),
});

const updateItemSchema = z.object({
  content: z.string().min(1).max(500).optional(),
  isChecked: z.boolean().optional(),
});

// ------------------------------------------------------------------ //
//  Helpers                                                            //
// ------------------------------------------------------------------ //

/**
 * Verify that a card exists and the requesting user is a board member.
 * Returns the board_id.
 */
async function verifyCardAccess(cardId: string, userId: string): Promise<string> {
  const result = await query(
    `SELECT c.id, l.board_id
     FROM cards c
     JOIN lists l ON l.id = c.list_id
     JOIN boards b ON b.id = l.board_id
     WHERE c.id = $1 AND b.is_archived = false`,
    [cardId],
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Card not found');
  }

  const boardId = result.rows[0].board_id;

  const memberResult = await query(
    'SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2',
    [boardId, userId],
  );
  if (memberResult.rows.length === 0) {
    throw new ForbiddenError('You are not a member of this board');
  }

  return boardId;
}

/**
 * Fetch a checklist and verify the requesting user has access to the
 * board the checklist's card belongs to.  Returns the checklist row.
 */
async function getChecklistAndVerifyAccess(checklistId: string, userId: string) {
  const result = await query(
    `SELECT cl.id, cl.card_id, cl.title, cl.position, c.list_id, l.board_id
     FROM checklists cl
     JOIN cards c ON c.id = cl.card_id
     JOIN lists l ON l.id = c.list_id
     JOIN boards b ON b.id = l.board_id
     WHERE cl.id = $1 AND b.is_archived = false`,
    [checklistId],
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Checklist not found');
  }

  const checklist = result.rows[0];

  const memberResult = await query(
    'SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2',
    [checklist.board_id, userId],
  );
  if (memberResult.rows.length === 0) {
    throw new ForbiddenError('You are not a member of this board');
  }

  return checklist;
}

/**
 * Fetch a checklist item and verify the requesting user has access.
 * Returns the item row with board context.
 */
async function getItemAndVerifyAccess(itemId: string, userId: string) {
  const result = await query(
    `SELECT ci.id, ci.checklist_id, ci.content, ci.is_checked, ci.position,
            cl.card_id, l.board_id
     FROM checklist_items ci
     JOIN checklists cl ON cl.id = ci.checklist_id
     JOIN cards c ON c.id = cl.card_id
     JOIN lists l ON l.id = c.list_id
     JOIN boards b ON b.id = l.board_id
     WHERE ci.id = $1 AND b.is_archived = false`,
    [itemId],
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Checklist item not found');
  }

  const item = result.rows[0];

  const memberResult = await query(
    'SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2',
    [item.board_id, userId],
  );
  if (memberResult.rows.length === 0) {
    throw new ForbiddenError('You are not a member of this board');
  }

  return item;
}

// ------------------------------------------------------------------ //
//  All routes require authentication                                  //
// ------------------------------------------------------------------ //

router.use(authenticate);

// ------------------------------------------------------------------ //
//  POST /  -  create a checklist on a card                            //
// ------------------------------------------------------------------ //

router.post(
  '/',
  validate(createChecklistSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { cardId, title } = req.body;

      await verifyCardAccess(cardId, req.user!.id);

      // Determine next position
      const posResult = await query(
        'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM checklists WHERE card_id = $1',
        [cardId],
      );
      const nextPosition = posResult.rows[0].next_pos;

      const result = await query(
        `INSERT INTO checklists (card_id, title, position)
         VALUES ($1, $2, $3)
         RETURNING id, card_id, title, position, created_at`,
        [cardId, title, nextPosition],
      );

      const checklist = result.rows[0];

      res.status(201).json({
        id: checklist.id,
        cardId: checklist.card_id,
        title: checklist.title,
        position: checklist.position,
        createdAt: checklist.created_at,
        items: [],
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  PUT /:checklistId  -  update checklist title                       //
// ------------------------------------------------------------------ //

router.put(
  '/:checklistId',
  validate(updateChecklistSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { checklistId } = req.params;
      const { title } = req.body;

      await getChecklistAndVerifyAccess(checklistId, req.user!.id);

      const result = await query(
        `UPDATE checklists SET title = $1 WHERE id = $2
         RETURNING id, card_id, title, position, created_at`,
        [title, checklistId],
      );

      const checklist = result.rows[0];

      res.json({
        id: checklist.id,
        cardId: checklist.card_id,
        title: checklist.title,
        position: checklist.position,
        createdAt: checklist.created_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  DELETE /:checklistId  -  delete checklist (and its items)           //
// ------------------------------------------------------------------ //

router.delete(
  '/:checklistId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { checklistId } = req.params;

      await getChecklistAndVerifyAccess(checklistId, req.user!.id);

      // CASCADE will remove checklist_items
      await query('DELETE FROM checklists WHERE id = $1', [checklistId]);

      res.json({ message: 'Checklist deleted successfully' });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  POST /:checklistId/items  -  add checklist item                    //
// ------------------------------------------------------------------ //

router.post(
  '/:checklistId/items',
  validate(createItemSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { checklistId } = req.params;
      const { content } = req.body;

      await getChecklistAndVerifyAccess(checklistId, req.user!.id);

      // Determine next position
      const posResult = await query(
        'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM checklist_items WHERE checklist_id = $1',
        [checklistId],
      );
      const nextPosition = posResult.rows[0].next_pos;

      const result = await query(
        `INSERT INTO checklist_items (checklist_id, content, position)
         VALUES ($1, $2, $3)
         RETURNING id, checklist_id, content, is_checked, position, created_at`,
        [checklistId, content, nextPosition],
      );

      const item = result.rows[0];

      res.status(201).json({
        id: item.id,
        checklistId: item.checklist_id,
        content: item.content,
        isChecked: item.is_checked,
        position: item.position,
        createdAt: item.created_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  PUT /items/:itemId  -  update checklist item                       //
// ------------------------------------------------------------------ //

router.put(
  '/items/:itemId',
  validate(updateItemSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { itemId } = req.params;
      const { content, isChecked } = req.body;

      await getItemAndVerifyAccess(itemId, req.user!.id);

      const setClauses: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (content !== undefined) {
        setClauses.push(`content = $${paramIndex++}`);
        params.push(content);
      }
      if (isChecked !== undefined) {
        setClauses.push(`is_checked = $${paramIndex++}`);
        params.push(isChecked);
      }

      if (setClauses.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }

      params.push(itemId);

      const result = await query(
        `UPDATE checklist_items
         SET ${setClauses.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING id, checklist_id, content, is_checked, position, created_at`,
        params,
      );

      const item = result.rows[0];

      res.json({
        id: item.id,
        checklistId: item.checklist_id,
        content: item.content,
        isChecked: item.is_checked,
        position: item.position,
        createdAt: item.created_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  DELETE /items/:itemId  -  delete checklist item                    //
// ------------------------------------------------------------------ //

router.delete(
  '/items/:itemId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { itemId } = req.params;

      await getItemAndVerifyAccess(itemId, req.user!.id);

      await query('DELETE FROM checklist_items WHERE id = $1', [itemId]);

      res.json({ message: 'Checklist item deleted successfully' });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
