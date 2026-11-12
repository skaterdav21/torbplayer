/** Browser preview: watch parties run against simulated TVs (see cast.web.ts). */
import { createFakeCastNetwork } from '../lib/castv2/fakeReceiver';

export const connectCastSocket = createFakeCastNetwork({ latencyMs: 40, loadDelayMs: 1200 });
