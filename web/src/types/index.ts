/// <reference types="vite/client" />

export interface APIKey {
  id: string;
  name: string;
  key_prefix: string;
  raw_key?: string; // Returned ONLY ONCE in POST response payload
  scopes: string[];
  last_used_at: string;
  created_at: string;
}

export interface ManagedDB {
  id: string;
  engine: string;
  db_name: string;
  dsn_masked: string;
  dsn_encrypted?: string;
  status: 'ACTIVE' | 'PROVISIONING' | 'INACTIVE';
  is_byodb: boolean;
  capability_mask: string;
  created_at: string;
}

export interface HealthStatus {
  status: string;
  service: string;
  timestamp: string;
  upstreams: {
    dbmux: string;
    buckstream: string;
    pgweb: string;
    web: string;
  };
}

export interface LatencyDataPoint {
  time: string;
  throughput: number;
  latencyMs: number;
}

export interface UserProfile {
  id: string;
  email: string;
}
