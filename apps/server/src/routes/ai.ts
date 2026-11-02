import { Router } from 'express';
import { asyncHandler } from '../http/errors.js';
import { buildUsageSnapshot, retryQueue, runtimeState } from '../ai/runtime.js';

const router = Router();

/** Live usage + budget + queue depth; also pushed on the `ai:usage` socket event. */
router.get(
  '/usage',
  asyncHandler(async (_req, res) => {
    res.json(await buildUsageSnapshot());
  }),
);

router.get(
  '/limits',
  asyncHandler(async (_req, res) => {
    const state = runtimeState();
    res.json({
      rateLimits: state.rateLimits,
      queueDepth: state.queueDepth,
      retryQueueDepth: retryQueue.depth,
    });
  }),
);

export default router;
