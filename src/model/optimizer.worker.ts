import { optimize, type OptimizeRequest } from './optimizer';

self.onmessage = (e: MessageEvent<OptimizeRequest>) => {
  for (const msg of optimize(e.data)) (self as unknown as Worker).postMessage(msg);
};
