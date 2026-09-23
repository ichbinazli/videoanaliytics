/**
 * API'nin döndürdüğü şekiller.
 *
 * Şimdilik elle yazıldı. Tekrar arttığında `packages/contracts` çıkarılıp
 * zod şemalarından üretilecek — gün 1'de o paketi kurmak, henüz olmayan bir
 * sorunu çözmek olurdu.
 */

export type Role = "SUPER_ADMIN" | "TENANT_ADMIN" | "TENANT_VIEWER";
export type Gender = "MALE" | "FEMALE" | "UNKNOWN";
export type AgeBucket = "CHILD" | "YOUTH" | "ADULT" | "MIDDLE_AGED" | "SENIOR" | "UNKNOWN";
export type Emotion =
  | "ANGRY"
  | "DISGUST"
  | "FEAR"
  | "HAPPY"
  | "SAD"
  | "SURPRISE"
  | "NEUTRAL"
  | "UNKNOWN";
export type DeviceStatus = "ACTIVE" | "INACTIVE" | "DECOMMISSIONED";

export type User = {
  id: number;
  tenantId: number | null;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type Site = {
  id: number;
  tenantId: number;
  name: string;
  code: string;
  city: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
};

export type Device = {
  id: number;
  tenantId: number;
  siteId: number;
  name: string;
  code: string;
  status: DeviceStatus;
  screenLabel: string | null;
  appVersion: string | null;
  lastSeenAt: string | null;
  lastIngestAt: string | null;
  lastSpoolDepth: number | null;
  createdAt: string;
  isOnline: boolean;
  site?: { id: number; name: string; code: string };
};

export type ApiKeyMetadata = {
  id: number;
  deviceId: number;
  keyPrefix: string;
  label: string | null;
  status: "ACTIVE" | "REVOKED";
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
};

export type OverviewKpis = {
  sessions: number;
  impressions: number;
  viewers: number;
  attentionRate: number;
  totalDwellSeconds: number;
  avgDwellSeconds: number;
  avgAge: number | null;
};

export type OverviewResponse = {
  current: OverviewKpis;
  previous: OverviewKpis;
  deltaPercent: Record<keyof OverviewKpis, number | null>;
};

export type TimeseriesPoint = {
  bucketStart: string;
  sessions: number;
  passed: number;
  looked: number;
  lookingSeconds: number;
  avgDwellSeconds: number;
  avgAge: number | null;
};

export type TimeseriesResponse = {
  granularity: "hour" | "day";
  points: TimeseriesPoint[];
};

export type BreakdownItem = {
  key: string;
  sessions: number;
  looked: number;
  lookingSeconds: number;
  share: number;
};

export type BreakdownResponse = {
  dimension: "gender" | "ageBucket" | "emotion";
  items: BreakdownItem[];
};

export type DeviceLeaderboardRow = {
  deviceId: number;
  name: string;
  code: string | null;
  siteName: string | null;
  sessions: number;
  impressions: number;
  viewers: number;
  attentionRate: number;
  lookingSeconds: number;
};

export type HeatmapResponse = { timeZone: string; grid: number[][] };

export type FunnelResponse = {
  attentionThresholdSec: number;
  steps: Array<{ key: string; label: string; value: number }>;
};

export type SessionRow = {
  sessionUuid: string;
  siteId: number;
  deviceId: number;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  personsPassed: number;
  personsLooked: number;
  lookingSeconds: string;
  ageEstimate: number | null;
  ageBucket: AgeBucket;
  gender: Gender;
  emotion: Emotion;
};

export type CursorPage<T> = { items: T[]; nextCursor: string | null };
