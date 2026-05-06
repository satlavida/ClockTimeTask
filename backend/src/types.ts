export type Permission =
  | 'view_tasks'
  | 'edit_tasks'
  | 'reorder_tasks'
  | 'view_notes'
  | 'edit_notes'
  | 'edit_budget'
  | 'manage_share';

export type ShareCodeEntry = {
  permissions: Permission[];
  createdAt: string;
};

export type SessionRecord = {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  lastAccess: string;
  encryptedData: string;
  shareCodes: Record<string, ShareCodeEntry>;
};

export type MetaRecord = {
  sessionCount: number;
  lastSweep: string;
};

export type Env = {
  SESSIONS: KVNamespace;
  SESSION_DO: DurableObjectNamespace;
  ENVIRONMENT: string;
};
