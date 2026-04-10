import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthenticatedRequest, requireAdmin } from '../middleware/auth';
import {
  previewImport,
  executeTrelloImport,
  TrelloBoard,
} from '../services/trelloImport';

const router = Router();

// All admin routes require auth + admin role
router.use(authenticate);
router.use(requireAdmin);

// ------------------------------------------------------------------ //
//  POST /preview  – dry-run: parse Trello JSON, return summary        //
// ------------------------------------------------------------------ //

router.post(
  '/import/trello/preview',
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const trello = req.body as TrelloBoard;
      if (!trello || !trello.lists || !trello.cards) {
        res.status(400).json({ error: 'Invalid Trello export JSON.' });
        return;
      }
      const preview = previewImport(trello);
      res.json(preview);
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  POST /import/trello  – execute the import                          //
// ------------------------------------------------------------------ //

router.post(
  '/import/trello',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { trello, memberMap, includeArchived } = req.body as {
        trello: TrelloBoard;
        memberMap?: Record<string, string>;
        includeArchived?: boolean;
      };

      if (!trello || !trello.lists || !trello.cards) {
        res.status(400).json({ error: 'Invalid Trello export JSON.' });
        return;
      }

      const adminUserId = req.user!.id;

      const stats = await executeTrelloImport(trello, adminUserId, {
        memberMap: memberMap ?? {},
        includeArchived: includeArchived ?? false,
      });

      res.json(stats);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
