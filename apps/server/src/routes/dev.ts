import { Router } from 'express';
import { z } from 'zod';
import { isProd } from '../config/env.js';
import { asyncHandler, HttpError } from '../http/errors.js';
import { armRateLimit, clearRateLimit, peekRateLimit } from '../ai/simulate.js';
import { broadcastUsage } from '../ai/runtime.js';

const router = Router();

/** Simulation is a development affordance only; production always 404s. */
router.use((_req, _res, next) => {
  if (isProd) next(new HttpError(404, 'Not found', 'not_found'));
  else next();
});

const schema = z.object({ failures: z.number().int().min(1).max(10).default(1) });

router.post(
  '/simulate/rate-limit',
  asyncHandler(async (req, res) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, 'Invalid simulation payload', 'invalid_body');
    armRateLimit(parsed.data.failures);
    await broadcastUsage();
    res.json({ armed: parsed.data.failures });
  }),
);

router.post(
  '/simulate/rate-limit/reset',
  asyncHandler(async (_req, res) => {
    clearRateLimit();
    res.json({ armed: 0 });
  }),
);

router.get(
  '/simulate/state',
  asyncHandler(async (_req, res) => {
    res.json({ armed: peekRateLimit() });
  }),
);

export default router;
