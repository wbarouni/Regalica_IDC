/**
 * Hierarchical tenancy model per master document §3 pillar 7.
 * A tenant may inherit rules and overrides from a parent tenant.
 */
export interface Tenant {
  id: string;
  name: string;
  parentId: string | null;
  code: string;
  kind: 'GROUP' | 'SUBSIDIARY' | 'BRANCH';
  createdAt: string;
}

export interface TenantContext {
  tenantId: string;
  userId: string;
  roles: readonly string[];
}
