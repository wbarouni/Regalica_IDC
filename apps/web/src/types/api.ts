export interface ValidationRun {
  run_id: string;
  batch_label: string | null;
  primary_annexe_code: string | null;
  arrete_date: string;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  conformity_rate: number | null;
  total_rules_evaluated: number | null;
  total_pass: number | null;
  total_fail_severe: number | null;
  total_fail_rounding: number | null;
  execution_time_ms: number | null;
  step1_xsd_status: string | null;
  step2_embedded_status: string | null;
  step3_rdg_status: string | null;
  initiated_at: string;
  completed_at: string | null;
}

export interface AnnexeSummary {
  code: string;
  fail_severe: number;
  fail_rounding: number;
  total_fail: number;
}

export interface RunSummary {
  run: ValidationRun;
  annexes: AnnexeSummary[];
}

export interface FailDetail {
  id: string;
  ax_term: string;
  num_regle: number;
  operateur: string;
  regle_label: string;
  severity: 'severe' | 'rounding';
  expected_value: number | null;
  computed_value: number | null;
  gap_absolute: number | null;
  gap_relative: number | null;
  cluster_id: string | null;
  is_sentinel_iteration: boolean;
  iteration_index: number | null;
  created_at: string;
}

export interface Notification {
  id: string;
  event_type: string;
  urgency_level: 'info' | 'attention' | 'action_required';
  title: string;
  body: string;
  suggested_action: string | null;
  resource_link: string | null;
  produced_by_agent: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface Rule {
  id: string;
  ax_term: string;
  num_regle: number;
  operator: string;
  natural_language: string;
  terms_count: number;
  version: number;
  status: string;
  valid_from: string;
  type_ctrl_computed: string;
  is_inter_annexe: boolean;
}

export interface Referential {
  code: string;
  entry_count: number;
  last_valid_from: string | null;
  last_updated_at: string | null;
}

export interface Conversation {
  id: string;
  title: string | null;
  language: 'fr' | 'en' | 'ar';
  linked_validation_run_id: string | null;
  messages_count: number;
  tokens_total: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}
