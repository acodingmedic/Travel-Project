import winston from 'winston';
import { BaseHolon } from './base-holon.js';
import { getSystemConfig } from '../config/system-config.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

export class Telemetry extends BaseHolon {
  constructor(orchestration) {
    super('Telemetry', orchestration);
    this.config = getSystemConfig();
    
    // Metrics storage
    this.metrics = {
      latency: [],
      errors: [],
      cache: [],
      throughput: [],
      system: {
        cpu: [],
        memory: [],
        connections: []
      }
    };
    
    // SLO tracking
    this.sloMetrics = {
      latency_p95: [],
      error_rate: [],
      cache_hit_rate: [],
      availability: [],
      gdpr_compliance: []
    };
    
    // Traces storage (W3C format)
    this.traces = new Map();
    this.spans = new Map();
    
    // Audit log
    this.auditLog = [];
    this.maxAuditEntries = 10000;
    
    // Alert thresholds
    this.alertThresholds = {
      latency_p95: this.parseDuration(this.config.nfr.latency_p95),
      error_rate: this.parsePercentage(this.config.nfr.error_pct),
      cache_hit_rate: this.config.nfr.cache_hit_pct,
      availability: this.config.nfr.availability_pct
    };
    
    // Active alerts
    this.activeAlerts = new Map();
    
    // Performance counters
    this.counters = {
      requests_total: 0,
      requests_success: 0,
      requests_error: 0,
      cache_hits: 0,
      cache_misses: 0,
      gdpr_requests: 0,
      gdpr_compliant: 0
    };
  }

  async initialize() {
    await super.initialize();
    
    // Subscribe to all telemetry events
    this.subscribe('request-start', this.handleRequestStart.bind(this));
    this.subscribe('request-end', this.handleRequestEnd.bind(this));
    this.subscribe('error-occurred', this.handleError.bind(this));
    this.subscribe('cache-hit', this.handleCacheHit.bind(this));
    this.subscribe('cache-miss', this.handleCacheMiss.bind(this));
    this.subscribe('workflow-complete', this.handleWorkflowComplete.bind(this));
    this.subscribe('workflow-error', this.handleWorkflowError.bind(this));
    this.subscribe('gdpr-request', this.handleGDPRRequest.bind(this));
    this.subscribe('audit-event', this.handleAuditEvent.bind(this));
    
    // Start metrics collection
    this.startMetricsCollection();
    
    // Start SLO monitoring
    this.startSLOMonitoring();
    
    logger.info('Telemetry holon initialized');
  }

  parseDuration(durationStr) {
    // Handle numeric values (already in milliseconds)
    if (typeof durationStr === 'number') {
      return durationStr;
    }
    
    // Handle string values with units
    if (typeof durationStr === 'string') {
      const match = durationStr.match(/(\d+)(s|ms)/);
      if (!match) return 18000; // Default 18s
      
      const [, amount, unit] = match;
      return unit === 's' ? parseInt(amount) * 1000 : parseInt(amount);
    }
    
    return 18000; // Default fallback
  }

  parsePercentage(percentageValue) {
    // Handle numeric values (already as percentage)
    if (typeof percentageValue === 'number') {
      return percentageValue;
    }
    
    // Handle string values with < or % symbols
    if (typeof percentageValue === 'string') {
      return parseFloat(percentageValue.replace(/[<%]/g, ''));
    }
    
    return 5; // Default fallback
  }

  startMetricsCollection() {
    // Collect system metrics every 10 seconds
    setInterval(() => {
      this.collectSystemMetrics();
    }, 10000);
    
    // Calculate derived metrics every 30 seconds
    setInterval(() => {
      this.calculateDerivedMetrics();
    }, 30000);
  }

  startSLOMonitoring() {
    // Check SLOs every minute
    setInterval(() => {
      this.checkSLOs();
    }, 60000);
  }

  async collectSystemMetrics() {
    const timestamp = Date.now();
    
    // Simulate system metrics collection
    // In production, use actual system monitoring libraries
    const systemMetrics = {
      timestamp,
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      connections: Math.floor(Math.random() * 1000)
    };
    
    this.metrics.system.cpu.push(systemMetrics.cpu);
    this.metrics.system.memory.push(systemMetrics.memory);
    this.metrics.system.connections.push(systemMetrics.connections);
    
    // Keep only last 1000 data points
    Object.values(this.metrics.system).forEach(arr => {
      if (arr.length > 1000) arr.shift();
    });
    
    // Check for system alerts
    if (systemMetrics.memory > 80) {
      await this.triggerAlert('high-memory', {
        value: systemMetrics.memory,
        threshold: 80,
        timestamp
      });
    }
  }

  calculateDerivedMetrics() {
    const now = Date.now();
    const fiveMinutesAgo = now - 300000;
    
    // Calculate P95 latency
    const recentLatencies = this.metrics.latency
      .filter(entry => entry.timestamp > fiveMinutesAgo)
      .map(entry => entry.value)
      .sort((a, b) => a - b);
    
    if (recentLatencies.length > 0) {
      const p95Index = Math.floor(recentLatencies.length * 0.95);
      const p95Latency = recentLatencies[p95Index] || recentLatencies[recentLatencies.length - 1];
      
      this.sloMetrics.latency_p95.push({
        timestamp: now,
        value: p95Latency
      });
    }
    
    // Calculate error rate
    const recentErrors = this.metrics.errors
      .filter(entry => entry.timestamp > fiveMinutesAgo).length;
    
    const totalRequests = this.counters.requests_total;
    const errorRate = totalRequests > 0 ? (recentErrors / totalRequests) * 100 : 0;
    
    this.sloMetrics.error_rate.push({
      timestamp: now,
      value: errorRate
    });
    
    // Calculate cache hit rate
    const totalCacheRequests = this.counters.cache_hits + this.counters.cache_misses;
    const cacheHitRate = totalCacheRequests > 0 
      ? (this.counters.cache_hits / totalCacheRequests) * 100 
      : 0;
    
    this.sloMetrics.cache_hit_rate.push({
      timestamp: now,
      value: cacheHitRate
    });
    
    // Calculate GDPR compliance rate
    const gdprComplianceRate = this.counters.gdpr_requests > 0
      ? (this.counters.gdpr_compliant / this.counters.gdpr_requests) * 100
      : 100;
    
    this.sloMetrics.gdpr_compliance.push({
      timestamp: now,
      value: gdprComplianceRate
    });
    
    // Keep only last 1000 data points for SLO metrics
    Object.values(this.sloMetrics).forEach(arr => {
      if (arr.length > 1000) arr.shift();
    });
  }

  async checkSLOs() {
    const latestMetrics = this.getLatestSLOMetrics();
    
    // Check latency P95 SLO
    if (latestMetrics.latency_p95 > this.alertThresholds.latency_p95) {
      await this.triggerAlert('slo-violation-latency', {
        metric: 'latency_p95',
        value: latestMetrics.latency_p95,
        threshold: this.alertThresholds.latency_p95,
        target: this.config.nfr.latency_p95
      });
    }
    
    // Check error rate SLO
    if (latestMetrics.error_rate > this.alertThresholds.error_rate) {
      await this.triggerAlert('slo-violation-errors', {
        metric: 'error_rate',
        value: latestMetrics.error_rate,
        threshold: this.alertThresholds.error_rate,
        target: this.config.nfr.error_pct
      });
    }
    
    // Check cache hit rate SLO
    if (latestMetrics.cache_hit_rate < this.alertThresholds.cache_hit_rate) {
      await this.triggerAlert('slo-violation-cache', {
        metric: 'cache_hit_rate',
        value: latestMetrics.cache_hit_rate,
        threshold: this.alertThresholds.cache_hit_rate,
        target: this.config.nfr.cache_hit_pct
      });
    }
    
    // Check GDPR compliance SLO
    if (latestMetrics.gdpr_compliance < this.alertThresholds.gdpr_compliance || 100) {
      await this.triggerAlert('slo-violation-gdpr', {
        metric: 'gdpr_compliance',
        value: latestMetrics.gdpr_compliance,
        threshold: 100,
        target: this.config.nfr.gdpr_pass_pct
      });
    }
  }

  getLatestSLOMetrics() {
    return {
      latency_p95: this.getLatestMetricValue(this.sloMetrics.latency_p95),
      error_rate: this.getLatestMetricValue(this.sloMetrics.error_rate),
      cache_hit_rate: this.getLatestMetricValue(this.sloMetrics.cache_hit_rate),
      gdpr_compliance: this.getLatestMetricValue(this.sloMetrics.gdpr_compliance)
    };
  }

  getLatestMetricValue(metricArray) {
    return metricArray.length > 0 ? metricArray[metricArray.length - 1].value : 0;
  }

  async triggerAlert(alertType, data) {
    const alertId = `${alertType}-${Date.now()}`;
    
    if (this.activeAlerts.has(alertType)) {
      // Update existing alert
      const existingAlert = this.activeAlerts.get(alertType);
      existingAlert.count++;
      existingAlert.lastOccurrence = new Date().toISOString();
      existingAlert.data = data;
    } else {
      // Create new alert
      const alert = {
        id: alertId,
        type: alertType,
        severity: this.getAlertSeverity(alertType),
        data,
        count: 1,
        firstOccurrence: new Date().toISOString(),
        lastOccurrence: new Date().toISOString(),
        status: 'active'
      };
      
      this.activeAlerts.set(alertType, alert);
      
      // Emit alert event
      await this.publish('alert-triggered', alert);
      
      logger.warn(`Alert triggered: ${alertType}`, data);
    }
  }

  getAlertSeverity(alertType) {
    const severityMap = {
      'slo-violation-latency': 'high',
      'slo-violation-errors': 'critical',
      'slo-violation-cache': 'medium',
      'slo-violation-gdpr': 'critical',
      'high-memory': 'medium',
      'system-error': 'high'
    };
    
    return severityMap[alertType] || 'low';
  }

  // Event handlers
  async handleRequestStart(event) {
    const { sagaId, correlationId, timestamp } = event;
    
    // Start trace
    const traceId = correlationId || sagaId;
    const spanId = `span-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const trace = {
      traceId,
      spans: new Map(),
      startTime: timestamp || Date.now(),
      status: 'active'
    };
    
    const span = {
      spanId,
      traceId,
      parentSpanId: null,
      operationName: 'travel-request',
      startTime: timestamp || Date.now(),
      tags: {
        'saga.id': sagaId,
        'correlation.id': correlationId
      },
      logs: []
    };
    
    this.traces.set(traceId, trace);
    this.spans.set(spanId, span);
    trace.spans.set(spanId, span);
    
    this.counters.requests_total++;
  }

  async handleRequestEnd(event) {
    const { sagaId, correlationId, duration, success } = event.data;
    
    // Record latency
    this.metrics.latency.push({
      timestamp: Date.now(),
      value: duration,
      sagaId
    });
    
    // Update counters
    if (success) {
      this.counters.requests_success++;
    } else {
      this.counters.requests_error++;
    }
    
    // Complete trace
    const traceId = correlationId || sagaId;
    const trace = this.traces.get(traceId);
    if (trace) {
      trace.endTime = Date.now();
      trace.duration = trace.endTime - trace.startTime;
      trace.status = success ? 'completed' : 'error';
      
      // Complete root span
      for (const span of trace.spans.values()) {
        if (!span.parentSpanId) {
          span.endTime = trace.endTime;
          span.duration = span.endTime - span.startTime;
          break;
        }
      }
    }
    
    // Keep only recent latency data
    if (this.metrics.latency.length > 10000) {
      this.metrics.latency.shift();
    }
  }

  async handleError(event) {
    const { error, sagaId, correlationId, component } = event.data;
    
    // Record error
    this.metrics.errors.push({
      timestamp: Date.now(),
      error: error.message,
      sagaId,
      component
    });
    
    // Add to trace
    const traceId = correlationId || sagaId;
    const trace = this.traces.get(traceId);
    if (trace) {
      for (const span of trace.spans.values()) {
        span.logs.push({
          timestamp: Date.now(),
          level: 'error',
          message: error.message,
          component
        });
        span.tags['error'] = true;
      }
    }
    
    // Keep only recent error data
    if (this.metrics.errors.length > 5000) {
      this.metrics.errors.shift();
    }
  }

  async handleCacheHit(event) {
    this.counters.cache_hits++;
    
    this.metrics.cache.push({
      timestamp: Date.now(),
      type: 'hit',
      key: event.data.key,
      namespace: event.data.namespace
    });
  }

  async handleCacheMiss(event) {
    this.counters.cache_misses++;
    
    this.metrics.cache.push({
      timestamp: Date.now(),
      type: 'miss',
      key: event.data.key,
      namespace: event.data.namespace
    });
  }

  async handleWorkflowComplete(event) {
    const { sagaId, totalTime, stateTransitions } = event.data;
    
    // Record throughput
    this.metrics.throughput.push({
      timestamp: Date.now(),
      sagaId,
      duration: totalTime,
      stateTransitions
    });
    
    // Keep only recent throughput data
    if (this.metrics.throughput.length > 5000) {
      this.metrics.throughput.shift();
    }
  }

  async handleWorkflowError(event) {
    await this.handleError({
      data: {
        error: { message: event.data.error },
        sagaId: event.data.sagaId,
        component: 'Workflow'
      }
    });
  }

  async handleGDPRRequest(event) {
    const { type, compliant } = event.data;
    
    this.counters.gdpr_requests++;
    if (compliant) {
      this.counters.gdpr_compliant++;
    }
    
    // Audit GDPR requests
    await this.handleAuditEvent({
      data: {
        action: `gdpr-${type}`,
        compliant,
        timestamp: Date.now()
      }
    });
  }

  async handleAuditEvent(event) {
    const auditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...event.data
    };
    
    this.auditLog.push(auditEntry);
    
    // Maintain audit log size
    if (this.auditLog.length > this.maxAuditEntries) {
      this.auditLog.shift();
    }
    
    // Emit audit event for external systems
    await this.publish('audit-logged', auditEntry);
  }

  // Query methods
  getMetrics(timeRange = '1h') {
    const now = Date.now();
    const ranges = {
      '5m': 300000,
      '1h': 3600000,
      '24h': 86400000,
      '7d': 604800000
    };
    
    const since = now - (ranges[timeRange] || ranges['1h']);
    
    return {
      counters: { ...this.counters },
      slo: this.getSLOMetrics(since),
      latency: this.getLatencyMetrics(since),
      errors: this.getErrorMetrics(since),
      cache: this.getCacheMetrics(since),
      system: this.getSystemMetrics(since)
    };
  }

  getSLOMetrics(since) {
    const filterBySince = (arr) => arr.filter(entry => entry.timestamp > since);
    
    return {
      latency_p95: filterBySince(this.sloMetrics.latency_p95),
      error_rate: filterBySince(this.sloMetrics.error_rate),
      cache_hit_rate: filterBySince(this.sloMetrics.cache_hit_rate),
      gdpr_compliance: filterBySince(this.sloMetrics.gdpr_compliance)
    };
  }

  getLatencyMetrics(since) {
    return this.metrics.latency.filter(entry => entry.timestamp > since);
  }

  getErrorMetrics(since) {
    return this.metrics.errors.filter(entry => entry.timestamp > since);
  }

  getCacheMetrics(since) {
    return this.metrics.cache.filter(entry => entry.timestamp > since);
  }

  getSystemMetrics(since) {
    // Return recent system metrics
    const recentCount = Math.floor((Date.now() - since) / 10000); // 10s intervals
    
    return {
      cpu: this.metrics.system.cpu.slice(-recentCount),
      memory: this.metrics.system.memory.slice(-recentCount),
      connections: this.metrics.system.connections.slice(-recentCount)
    };
  }

  getTraces(filters = {}) {
    let traces = Array.from(this.traces.values());
    
    if (filters.sagaId) {
      traces = traces.filter(trace => 
        Array.from(trace.spans.values()).some(span => 
          span.tags['saga.id'] === filters.sagaId
        )
      );
    }
    
    if (filters.status) {
      traces = traces.filter(trace => trace.status === filters.status);
    }
    
    if (filters.since) {
      traces = traces.filter(trace => trace.startTime > filters.since);
    }
    
    return traces.slice(-100); // Return last 100 traces
  }

  getAuditLog(filters = {}) {
    let log = [...this.auditLog];
    
    if (filters.action) {
      log = log.filter(entry => entry.action === filters.action);
    }
    
    if (filters.since) {
      const since = new Date(filters.since);
      log = log.filter(entry => new Date(entry.timestamp) > since);
    }
    
    return log.slice(-1000); // Return last 1000 entries
  }

  getActiveAlerts() {
    return Array.from(this.activeAlerts.values());
  }

  async resolveAlert(alertType) {
    if (this.activeAlerts.has(alertType)) {
      const alert = this.activeAlerts.get(alertType);
      alert.status = 'resolved';
      alert.resolvedAt = new Date().toISOString();
      
      this.activeAlerts.delete(alertType);
      
      await this.publish('alert-resolved', alert);
      
      logger.info(`Alert resolved: ${alertType}`);
      return true;
    }
    
    return false;
  }

  async shutdown() {
    logger.info('Shutting down Telemetry holon');
    
    // Clear all data
    this.traces.clear();
    this.spans.clear();
    this.auditLog = [];
    this.activeAlerts.clear();
    
    // Reset metrics
    Object.keys(this.metrics).forEach(key => {
      if (Array.isArray(this.metrics[key])) {
        this.metrics[key] = [];
      } else if (typeof this.metrics[key] === 'object') {
        Object.keys(this.metrics[key]).forEach(subKey => {
          this.metrics[key][subKey] = [];
        });
      }
    });
    
    await super.shutdown();
  }
}