import { simulate, createConfig } from './core.js';
const baselineMetrics = simulate(createConfig('healthy')).metrics;
self.onmessage = ({ data: { id, config } }) => {
  try {
    const result = simulate(config);
    const transfers = [...Object.values(result.trace), ...Object.values(result.cycles)].map(a => a.buffer);
    self.postMessage({ id, result, baselineMetrics }, transfers);
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
