import envConfig, { initializeConfig, getConfig, isFeatureEnabled } from './env-config.js';

// Initialize environment configuration on module load
let configInitialized = false;
const initPromise = initializeConfig().then(() => {
  configInitialized = true;
}).catch(error => {
  console.error('Failed to initialize environment configuration:', error);
  process.exit(1);
});

// Ensure config is initialized before accessing
export const ensureConfigInitialized = () => {
  if (!configInitialized) {
    throw new Error('Environment configuration not yet initialized. Please wait for initialization to complete.');
  }
};

// Export environment configuration access
export { getConfig, isFeatureEnabled, envConfig };

export const SYSTEM_CONFIG = {
  // Mission and NFRs - Enhanced with environment-aware configuration
  mission: "GDPR-compliant autonomous planner: 1 option/category (hotel,flight,activity,restaurant,car) with affiliate links, licensed images, rationale & calendar; revision loops; latency/quality/reliability SLOs; EN/DE.",
  
  nfr: {
    latency_p95: () => getConfig('NODE_ENV') === 'production' ? "18s" : "30s",
    accept_pct: 35,
    revision_p95: () => getConfig('NODE_ENV') === 'production' ? "6s" : "10s",
    error_pct: () => getConfig('NODE_ENV') === 'production' ? "<1" : "<5",
    cache_hit_pct: 60,
    cost_eur: 0.35,
    obs_pct: 100,
    availability_pct: () => getConfig('NODE_ENV') === 'production' ? 99.9 : 95.0,
    gdpr_pass_pct: 100
  },

  // Architecture definition
  arch: {
    holons_persistent: ["Coordinator", "Orchestrator", "Blackboard", "Telemetry", "Policy"],
    swarms_ephemeral: ["Candidate", "Validation", "Ranking", "Selection", "Enrichment", "Output"],
    planes: {
      data: "APIs: flights/hotels/activities/restaurants/cars, maps,tz,FX,images,safety/visa/holiday",
      control: "custom bus+queue+workflow"
    },
    adapt: {
      merge: ["Intent→Profiler", "Reputation→Ranking"],
      split: ["Availability→PriceVerifier+LinkHealth"],
      add: ["CacheSteward", "FreshnessSentinel"],
      retire: ["Planning→ItinerarySynth"]
    },
    autoscale: {
      triggers: ["Q>100→scale", "Cand>200→shard", "Err>3%→circuit", "p95>target→↑cache", "Mem>80%→spill"],
      cooldown_min: 10
    }
  },

  // State management
  state: {
    ns: ["user_input", "prefs", "intent", "constraints", "candidates", "evals", "selections", "itinerary", "affiliate", "media", "cache", "errors", "audit"],
    consistency: {
      strong: ["selections", "itinerary"],
      eventual: ["media", "links"]
    },
    ttl: {
      flights: "5m",
      hotels: "30m",
      "acts/rest": "24h",
      cars: "12h"
    },
    invalidate: {
      eval: "weights|price drift>2%",
      selection: "reverify>10m",
      media: "7d",
      affiliate: "24h"
    }
  },

  // Decision systems
  decisions: {
    escalate: ["safety/GDPR", "price drift>5%", "constraint conflict"],
    voting: {
      method: "Borda",
      weights: {
        tradeoff: 0.5,
        personal: 0.3,
        reputation: 0.2
      },
      threshold: 0.65
    },
    auction: {
      bid: "f(ETA,conf,cost)",
      select: "min ETA+cost",
      drop: "err>3%/circuit open"
    },
    arbiter: {
      checker: "Global",
      timeout_ms: 500,
      fallback: "top-1 unless fail→recompute"
    }
  },

  // Event system
  events: {
    list: ["INTENT", "CANDIDATES", "AVAILABILITY", "CONSTRAINTS", "SELECTION_PROP", "SELECTION_CONF", "ITINERARY", "REVISION", "FALLBACK", "OUTPUT"],
    schema: "Strict v1.0 JSON; correlation/saga/span required",
    errors: ["INVALID_INPUT", "TIMEOUT", "PRICE_DRIFT", "LOW_CONF", "CALENDAR_CONFLICT", "REVISION_INVALID", "LINK_FAIL", "PACKAGING_ERR"]
  },

  // Orchestration
  orchestration: {
    bus: {
      topics: ["intent", "candidates", "availability", "constraints", "selection", "itinerary", "output", "telemetry", "errors"],
      delivery: "at-least-once,FIFO per saga"
    },
    queue: {
      q: ["fast-io", "heavy-llm", "verify", "finalize", "background"],
      priority: "finalize>verify>fast-io"
    },
    workflow: {
      sagas: ["CREATE", "REVISE"],
      states: ["ADMIT", "GEN", "VERIFY", "RANK", "SELECT", "ENRICH", "BUILD", "FINAL_VERIFY", "PACKAGE", "DONE"],
      comp: "on drift→rollback & rerun"
    },
    idempot: "hash(user_input),dedupe(saga,event,seq),etag per ns",
    retries: {
      policy: "exp+jitter",
      base_ms: 200,
      max: 5
    },
    dlq: "per-topic quarantine; replay needs fix+approval",
    obs: {
      trace: "W3C",
      logs: "JSON redacted",
      metrics: ["latency", "error", "cache"],
      audit: true
    },
    secrets: {
      kms: () => getConfig('NODE_ENV') === 'production',
      rotation: () => getConfig('NODE_ENV') === 'production' ? 90 : 365,
      encryption: {
        enabled: true,
        algorithm: () => getConfig('ENCRYPTION_ALGORITHM', 'aes-256-gcm'),
        keyRotation: () => getConfig('NODE_ENV') === 'production' ? 30 : 90
      }
    },
    routing: [
      "INTENT→Profiler",
      "Profiler→Generators",
      "Cand→Verifier",
      "Avail→Validator",
      "Constr→Ranking",
      "Rank→Selector",
      "Sel→Checker",
      "Conf→Enrich→Synth→Verifier→Packager→OUTPUT",
      "Errors→Fallback/DLQ"
    ]
  },

  // Agent definitions
  agents: [
    { "Coordinator": "admission/policy" },
    { "Profiler": "prefs/intents" },
    { "Generators": ["Hotel≥20", "Flight≥30", "Activity≥25", "Restaurant≥25", "Car≥15"] },
    { "PriceVerifier": "real-time check" },
    { "Constraints": "feasibility" },
    { "Ranking": "multi-objective" },
    { "Selector": "top-1" },
    { "Checker": "cross-category" },
    { "Enrichment": "reviews,img,affiliate" },
    { "Synth": "timeline" },
    { "Verifier": "final recheck" },
    { "Packager": "schema output" },
    { "CacheSteward": "TTL/SWR" },
    { "Fallback": "alt/cache/scrape" }
  ],

  // Frontend configuration
  frontend: {
    quickAsk: "1 field,auto EN/DE,skeleton,explain/revise chips",
    classicForm: "dest,dates,party,budget,cabin,layovers,refund,diet,mobility,prefs,multi-city?",
    a11y: "WCAG2.2AA,keyboard,ARIA,contrast≥4.5,reduced-motion,alt",
    output_contract: "v1.0: selections{hotel,flight,activity,rest,car},calendar,rationale,media,audit"
  },

  // Integration settings
  integrations: {
    providers: ["Flights", "Hotels", "Acts", "Rest", "Cars", "Maps", "TZ", "FX", "Safety", "Visa", "Holidays", "Images"],
    normalize: "EUR,scores0-1,reviews1-5",
    images: "licensed,≥2/item,hash dedupe,aspect4:3/1:1",
    affiliate: "{network,prog,campaign,sub_user,sub_saga,deep_link,expiry};ping24h"
  },

  // Fallback strategies
  fallbacks: {
    backoff: "exp+jitter base200 cap10s",
    circuit: "err>3%/2m or p95>5s→open;half-open probe15s",
    strategy: "cache→alt→scrape→omit"
  },

  // Compliance
  compliance: {
    privacy: "PII-min: hash user,prefs only; retention 90d/365d anon; GDPR export/delete; no PII in affiliate; logs redacted",
    security: "KMS,RBAC,JIT tokens"
  },

  // Development phases
  phases: ["P0 Foundations", "P1 Candidate+Verify", "P2 Rank+Select", "P3 Enrich+Build", "P4 Revisions+Learn", "P5 Hardening"],

  // Testing requirements
  tests: {
    contracts: "validate schemas",
    e2e: "BER→LIS ≤18s",
    revision: "swap hotel ≤6s",
    perf: "50RPS,cache≥60%",
    failure: "provider500→fallback,DLQ<0.5%",
    privacy: "no PII logs"
  },

  // Learning system
  learning: {
    signals: {
      explicit: ["thumbs", "swaps", "accepts"],
      implicit: ["dwell", "CTR", "scroll", "clicks", "drops"]
    },
    online: "bandits,explore≤cap,guard safety/budget",
    offline: "weekly retrain,QA,regression,shadow→prod",
    ab: "hash traffic,stop-loss>5%",
    drift: "monitors,rollback,alerts",
    personal: "opt-in embed,180d,pseudonymized,on-device cache optional",
    guard: "safety filters,visa disclaimers,affiliate transparency"
  },

  // Risk management
  risks: ["rate-limit→cache", "price drift→rollback", "img licensing→audit", "GDPR→min+redact", "model drift→rollback"],

  // Readiness checklist
  readiness: ["schemas versioned", "queues provisioned", "creds rotated", "dashboards+alerts", "runbooks", "perf tests", "GDPR docs"]
};

// Environment-specific overrides
export const ENV_CONFIG = {
  development: {
    nfr: {
      latency_p95: "30s", // Relaxed for dev
      error_pct: "<5"
    },
    compliance: {
      privacy: "PII-min: hash user,prefs only; retention 7d; logs redacted"
    }
  },
  production: {
    // Use base config as-is
  }
};

export function getSystemConfig() {
  const env = process.env.NODE_ENV || 'development';
  const baseConfig = SYSTEM_CONFIG;
  const envOverrides = ENV_CONFIG[env] || {};
  
  // Deep merge configuration
  return mergeDeep(baseConfig, envOverrides);
}

function mergeDeep(target, source) {
  const output = Object.assign({}, target);
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target))
          Object.assign(output, { [key]: source[key] });
        else
          output[key] = mergeDeep(target[key], source[key]);
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}