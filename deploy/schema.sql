-- ==============================================================================
-- ArcOps Single-User Telemetry & Analytics Database Schema & Initial Mock Seed
-- ==============================================================================

-- 1. Create telemetry_metrics table
CREATE TABLE IF NOT EXISTS telemetry_metrics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(64) NOT NULL,
    time_label VARCHAR(64) NOT NULL,
    metric_value DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Seed Initial Throughput Metrics (Req/sec)
INSERT INTO telemetry_metrics (metric_name, time_label, metric_value) VALUES
('throughput', '00:00', 1200),
('throughput', '04:00', 1900),
('throughput', '08:00', 3400),
('throughput', '12:00', 2800),
('throughput', '16:00', 4900),
('throughput', '20:00', 6200),
('throughput', '24:00', 7800);

-- 3. Seed Initial Latency Metrics (p95 ms)
INSERT INTO telemetry_metrics (metric_name, time_label, metric_value) VALUES
('latency', '00:00', 1.2),
('latency', '04:00', 0.9),
('latency', '08:00', 1.8),
('latency', '12:00', 1.4),
('latency', '16:00', 2.1),
('latency', '20:00', 1.1),
('latency', '24:00', 0.8);

-- 4. Seed Connection Leases Metrics
INSERT INTO telemetry_metrics (metric_name, time_label, metric_value) VALUES
('leases', 'Postgres Primary', 42),
('leases', 'Redis Cache', 88),
('leases', 'Vector DB (pgvector)', 24),
('leases', 'ClickHouse Analytics', 15);
