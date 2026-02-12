import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { authenticate, requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { NotFoundError } from '../middleware/errorHandler';

const router = Router();

// ------------------------------------------------------------------ //
//  Validation schemas                                                 //
// ------------------------------------------------------------------ //

const createRuleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  targetBoardId: z.string().uuid('Invalid board ID'),
  targetListId: z.string().uuid('Invalid list ID'),
  fromAddresses: z.array(z.string().email()).optional().default([]),
  fromDomains: z.array(z.string().min(1)).optional().default([]),
  toAddresses: z.array(z.string().email()).optional().default([]),
  subjectContains: z.array(z.string().min(1)).optional().default([]),
  subjectNotContains: z.array(z.string().min(1)).optional().default([]),
  assignToUserIds: z.array(z.string().uuid()).optional().default([]),
  autoLabels: z.array(z.string().uuid()).optional().default([]),
});

const updateRuleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  targetBoardId: z.string().uuid('Invalid board ID').optional(),
  targetListId: z.string().uuid('Invalid list ID').optional(),
  fromAddresses: z.array(z.string().email()).optional(),
  fromDomains: z.array(z.string().min(1)).optional(),
  toAddresses: z.array(z.string().email()).optional(),
  subjectContains: z.array(z.string().min(1)).optional(),
  subjectNotContains: z.array(z.string().min(1)).optional(),
  assignToUserIds: z.array(z.string().uuid()).optional(),
  autoLabels: z.array(z.string().uuid()).optional(),
});

const toggleRuleSchema = z.object({
  isActive: z.boolean(),
});

// ------------------------------------------------------------------ //
//  All routes require authentication + admin                          //
// ------------------------------------------------------------------ //

router.use(authenticate);
router.use(requireAdmin);

// ------------------------------------------------------------------ //
//  Helpers                                                            //
// ------------------------------------------------------------------ //

function formatRule(row: any) {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    targetBoardId: row.target_board_id,
    targetListId: row.target_list_id,
    fromAddresses: row.from_addresses || [],
    fromDomains: row.from_domains || [],
    toAddresses: row.to_addresses || [],
    subjectContains: row.subject_contains || [],
    subjectNotContains: row.subject_not_contains || [],
    assignToUserIds: row.assign_to_user_ids || [],
    autoLabels: row.auto_labels || [],
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ------------------------------------------------------------------ //
//  GET /  -  list all email rules                                     //
// ------------------------------------------------------------------ //

router.get(
  '/',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await query(
        `SELECT er.*,
                b.title AS board_title,
                l.title AS list_title
         FROM email_rules er
         LEFT JOIN boards b ON b.id = er.target_board_id
         LEFT JOIN lists l ON l.id = er.target_list_id
         ORDER BY er.created_at DESC`,
      );

      const rules = result.rows.map((row) => ({
        ...formatRule(row),
        boardTitle: row.board_title,
        listTitle: row.list_title,
      }));

      res.json(rules);
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  POST /  -  create an email rule                                    //
// ------------------------------------------------------------------ //

router.post(
  '/',
  validate(createRuleSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        name, targetBoardId, targetListId,
        fromAddresses, fromDomains, toAddresses,
        subjectContains, subjectNotContains,
        assignToUserIds, autoLabels,
      } = req.body;

      // Verify the target board exists
      const boardResult = await query(
        'SELECT id FROM boards WHERE id = $1 AND is_archived = false',
        [targetBoardId],
      );
      if (boardResult.rows.length === 0) {
        throw new NotFoundError('Target board not found');
      }

      // Verify the target list exists and belongs to the board
      const listResult = await query(
        'SELECT id FROM lists WHERE id = $1 AND board_id = $2 AND is_archived = false',
        [targetListId, targetBoardId],
      );
      if (listResult.rows.length === 0) {
        throw new NotFoundError('Target list not found on the specified board');
      }

      const result = await query(
        `INSERT INTO email_rules (
           name, target_board_id, target_list_id,
           from_addresses, from_domains, to_addresses,
           subject_contains, subject_not_contains,
           assign_to_user_ids, auto_labels,
           created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          name, targetBoardId, targetListId,
          fromAddresses, fromDomains, toAddresses,
          subjectContains, subjectNotContains,
          assignToUserIds, autoLabels,
          req.user!.id,
        ],
      );

      res.status(201).json(formatRule(result.rows[0]));
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  PUT /:ruleId  -  update an email rule                              //
// ------------------------------------------------------------------ //

router.put(
  '/:ruleId',
  validate(updateRuleSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { ruleId } = req.params;
      const {
        name, targetBoardId, targetListId,
        fromAddresses, fromDomains, toAddresses,
        subjectContains, subjectNotContains,
        assignToUserIds, autoLabels,
      } = req.body;

      // Verify rule exists
      const existing = await query('SELECT id FROM email_rules WHERE id = $1', [ruleId]);
      if (existing.rows.length === 0) {
        throw new NotFoundError('Email rule not found');
      }

      // If changing board/list, verify they exist
      if (targetBoardId !== undefined) {
        const boardResult = await query(
          'SELECT id FROM boards WHERE id = $1 AND is_archived = false',
          [targetBoardId],
        );
        if (boardResult.rows.length === 0) {
          throw new NotFoundError('Target board not found');
        }
      }

      if (targetListId !== undefined && targetBoardId !== undefined) {
        const listResult = await query(
          'SELECT id FROM lists WHERE id = $1 AND board_id = $2 AND is_archived = false',
          [targetListId, targetBoardId],
        );
        if (listResult.rows.length === 0) {
          throw new NotFoundError('Target list not found on the specified board');
        }
      }

      const setClauses: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (name !== undefined) {
        setClauses.push(`name = $${paramIndex++}`);
        params.push(name);
      }
      if (targetBoardId !== undefined) {
        setClauses.push(`target_board_id = $${paramIndex++}`);
        params.push(targetBoardId);
      }
      if (targetListId !== undefined) {
        setClauses.push(`target_list_id = $${paramIndex++}`);
        params.push(targetListId);
      }
      if (fromAddresses !== undefined) {
        setClauses.push(`from_addresses = $${paramIndex++}`);
        params.push(fromAddresses);
      }
      if (fromDomains !== undefined) {
        setClauses.push(`from_domains = $${paramIndex++}`);
        params.push(fromDomains);
      }
      if (toAddresses !== undefined) {
        setClauses.push(`to_addresses = $${paramIndex++}`);
        params.push(toAddresses);
      }
      if (subjectContains !== undefined) {
        setClauses.push(`subject_contains = $${paramIndex++}`);
        params.push(subjectContains);
      }
      if (subjectNotContains !== undefined) {
        setClauses.push(`subject_not_contains = $${paramIndex++}`);
        params.push(subjectNotContains);
      }
      if (assignToUserIds !== undefined) {
        setClauses.push(`assign_to_user_ids = $${paramIndex++}`);
        params.push(assignToUserIds);
      }
      if (autoLabels !== undefined) {
        setClauses.push(`auto_labels = $${paramIndex++}`);
        params.push(autoLabels);
      }

      if (setClauses.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }

      params.push(ruleId);

      const result = await query(
        `UPDATE email_rules
         SET ${setClauses.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        params,
      );

      res.json(formatRule(result.rows[0]));
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  DELETE /:ruleId  -  delete an email rule                           //
// ------------------------------------------------------------------ //

router.delete(
  '/:ruleId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { ruleId } = req.params;

      const result = await query(
        'DELETE FROM email_rules WHERE id = $1',
        [ruleId],
      );

      if (result.rowCount === 0) {
        throw new NotFoundError('Email rule not found');
      }

      res.json({ message: 'Email rule deleted successfully' });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  PUT /:ruleId/toggle  -  enable/disable a rule                     //
// ------------------------------------------------------------------ //

router.put(
  '/:ruleId/toggle',
  validate(toggleRuleSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { ruleId } = req.params;
      const { isActive } = req.body;

      const result = await query(
        `UPDATE email_rules SET is_active = $1 WHERE id = $2
         RETURNING *`,
        [isActive, ruleId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Email rule not found');
      }

      res.json(formatRule(result.rows[0]));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
