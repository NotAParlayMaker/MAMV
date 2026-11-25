type GaugeValue = { set: (value: number) => void; inc: (value?: number) => void; dec: (value?: number) => void };
type HistogramValue = { observe: (value: number) => void };
type CounterValue = { inc: (value?: number) => void };

export type GaugeMetric = GaugeValue & { labels: (...args: string[]) => GaugeValue };
export type HistogramMetric = HistogramValue & { labels: (...args: string[]) => HistogramValue };
export type CounterMetric = CounterValue & { labels: (...args: string[]) => CounterValue };

type PromRegistry = {
  setDefaultLabels: (labels: Record<string, string>) => void;
  metrics: () => Promise<string>;
  contentType: string;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const client = require('prom-client') as {
  Registry: new () => PromRegistry;
  collectDefaultMetrics: (params: { register: unknown }) => void;
  Gauge: new (config: Record<string, unknown>) => GaugeMetric;
  Histogram: new (config: Record<string, unknown>) => HistogramMetric;
  Counter: new (config: Record<string, unknown>) => CounterMetric;
};

export type MetricsRegistry = {
  register: PromRegistry;
  metrics: {
    queueDepth: GaugeMetric;
    activeJobs: GaugeMetric;
    jobLatencyMs: HistogramMetric;
    providerLatencyMs: HistogramMetric;
    chainFinalityMs: HistogramMetric;
    providerErrorsTotal: CounterMetric;
    jobsFailedTotal: CounterMetric;
    cacheHitsTotal: CounterMetric;
    cacheMissesTotal: CounterMetric;
  };
};

export function createMetrics(serviceName: string): MetricsRegistry {
  const register = new client.Registry();
  register.setDefaultLabels({ service: serviceName });
  client.collectDefaultMetrics({ register });

  const queueDepth = new client.Gauge({
    name: 'queue_depth',
    help: 'Queue depth for verification jobs',
    registers: [register],
    labelNames: ['queue'],
  });

  const activeJobs = new client.Gauge({
    name: 'active_jobs',
    help: 'Active verification jobs',
    registers: [register],
  });

  const jobLatencyMs = new client.Histogram({
    name: 'job_latency_ms',
    help: 'Job latency in milliseconds by phase',
    registers: [register],
    labelNames: ['phase'],
    buckets: [10, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 20000],
  });

  const providerLatencyMs = new client.Histogram({
    name: 'provider_latency_ms',
    help: 'Provider latency in milliseconds',
    registers: [register],
    labelNames: ['provider', 'model'],
    buckets: [25, 50, 100, 250, 500, 1000, 2000, 5000, 10000],
  });

  const chainFinalityMs = new client.Histogram({
    name: 'chain_finality_ms',
    help: 'Chain finality latency in milliseconds',
    registers: [register],
    labelNames: ['phase', 'chain_id'],
    buckets: [250, 500, 1000, 2000, 5000, 10000, 20000, 60000],
  });

  const providerErrorsTotal = new client.Counter({
    name: 'provider_errors_total',
    help: 'Provider errors total',
    registers: [register],
    labelNames: ['provider', 'model', 'code'],
  });

  const jobsFailedTotal = new client.Counter({
    name: 'jobs_failed_total',
    help: 'Jobs failed total',
    registers: [register],
    labelNames: ['reason'],
  });

  const cacheHitsTotal = new client.Counter({
    name: 'cache_hits_total',
    help: 'Cache hits total',
    registers: [register],
    labelNames: ['cache'],
  });

  const cacheMissesTotal = new client.Counter({
    name: 'cache_misses_total',
    help: 'Cache misses total',
    registers: [register],
    labelNames: ['cache'],
  });

  return {
    register,
    metrics: {
      queueDepth,
      activeJobs,
      jobLatencyMs,
      providerLatencyMs,
      chainFinalityMs,
      providerErrorsTotal,
      jobsFailedTotal,
      cacheHitsTotal,
      cacheMissesTotal,
    },
  };
}
