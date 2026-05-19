create table if not exists workspace_profiles (
  workspace_scope varchar(50) primary key,
  workspace_path text not null,
  dominant_stacks text,
  guardrail_packs text,
  notes text,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists repo_contexts (
  context_id varchar(240) primary key,
  workspace_scope varchar(50) not null,
  repo_family varchar(200) not null,
  repo_path text not null,
  worktree_path text,
  base_repo_path text,
  branch varchar(300),
  current_commit varchar(80),
  bead_id varchar(200),
  spec_path text,
  dominant_stack text,
  guardrail_pack text,
  environment_risk varchar(50),
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists agent_runs (
  run_id varchar(240) primary key,
  context_id varchar(240),
  workspace_scope varchar(50) not null,
  repo_family varchar(200),
  task_shape varchar(100),
  circle_of_competence varchar(20),
  expected_tokens int,
  maximum_tokens int,
  actual_tokens int,
  accepted_state_transitions int,
  completed boolean,
  outcome varchar(50),
  estimate_error double,
  progress_density double,
  primary_error_source varchar(100),
  reusable_lesson text,
  trace_ref text,
  started_at timestamp,
  completed_at timestamp,
  created_at timestamp default current_timestamp
);

create table if not exists run_goals (
  run_id varchar(240) primary key,
  goal text not null,
  success_criteria text,
  stop_condition text,
  expected_process text,
  risk_class varchar(80),
  created_at timestamp default current_timestamp
);

create table if not exists run_execution_contexts (
  run_id varchar(240) primary key,
  task_shape varchar(100),
  functional_axis varchar(200),
  domain_axis varchar(200),
  stack text,
  tools_used text,
  files_touched text,
  commands_run text,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists run_models (
  run_id varchar(240) not null,
  model varchar(120) not null,
  role varchar(100) not null,
  reasoning_effort varchar(50),
  input_tokens int,
  output_tokens int,
  total_tokens int,
  routing_fit varchar(50),
  notes text,
  primary key (run_id, model, role)
);

create table if not exists run_model_usage (
  usage_id varchar(300) primary key,
  run_id varchar(240) not null,
  model varchar(120) not null,
  provider varchar(120),
  role varchar(100),
  reasoning_effort varchar(50),
  local_or_remote varchar(50),
  input_tokens int,
  output_tokens int,
  total_tokens int,
  estimated_cost double,
  latency_ms int,
  escalated_from varchar(120),
  escalated_to varchar(120),
  routing_reason text,
  routing_fit varchar(50),
  created_at timestamp default current_timestamp
);

create table if not exists run_state_transitions (
  run_id varchar(240) not null,
  transition_index int not null,
  from_state varchar(100),
  to_state varchar(100) not null,
  evidence text,
  accepted boolean default false,
  created_at timestamp default current_timestamp,
  primary key (run_id, transition_index)
);

create table if not exists run_trace_events (
  event_id varchar(300) primary key,
  run_id varchar(240) not null,
  event_index int not null,
  event_type varchar(80) not null,
  summary text not null,
  from_state varchar(100),
  to_state varchar(100),
  evidence text,
  created_at timestamp default current_timestamp
);

create table if not exists run_reviews (
  review_id varchar(240) primary key,
  run_id varchar(240) not null,
  review_type varchar(50) not null,
  reviewer varchar(200),
  verdict varchar(50),
  defects text,
  business_outcome text,
  functional_outcome text,
  created_at timestamp default current_timestamp
);

create table if not exists run_verification_results (
  run_id varchar(240) primary key,
  tests_run text,
  checks_run text,
  verification_passed boolean,
  review_verdict varchar(100),
  defects text,
  human_corrections text,
  missing_ingredients text,
  guardrail_result text,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists run_guardrails (
  run_id varchar(240) primary key,
  plan_path text,
  verifier_command text,
  verifier_ok boolean,
  environment varchar(100),
  risk_level varchar(100),
  approval_required boolean,
  approval_granted boolean,
  blocked_findings text,
  missing_policy_coverage text,
  created_at timestamp default current_timestamp
);

create table if not exists run_missing_ingredients (
  run_id varchar(240) not null,
  ingredient varchar(200) not null,
  source varchar(100),
  impact varchar(100),
  created_at timestamp default current_timestamp,
  primary key (run_id, ingredient)
);

create table if not exists functional_broadcasts (
  broadcast_id varchar(240) primary key,
  run_id varchar(240),
  workspace_scope varchar(50) not null,
  target_layer varchar(80) not null,
  target_artifact text not null,
  lesson text not null,
  encoded_artifact_type varchar(80),
  encoded_change text,
  propagation_rule text,
  evaluation_metric text,
  status varchar(40) default 'encoded',
  change_commit varchar(80),
  created_at timestamp default current_timestamp
);

create table if not exists broadcast_deliveries (
  delivery_id varchar(300) primary key,
  broadcast_id varchar(240) not null,
  run_id varchar(240),
  context_id varchar(240),
  workspace_scope varchar(50) not null,
  delivery_surface varchar(120) not null,
  matched_context text,
  agent_seen boolean,
  delivery_result varchar(80),
  delivered_at timestamp default current_timestamp
);

create table if not exists broadcast_effect_evaluations (
  evaluation_id varchar(300) primary key,
  broadcast_id varchar(240) not null,
  evaluator_run_id varchar(240),
  workspace_scope varchar(50) not null,
  evaluation_window_runs int,
  effect_verdict varchar(50) not null,
  metric_before double,
  metric_after double,
  evidence text,
  recommended_action varchar(80),
  evaluated_at timestamp default current_timestamp
);

create table if not exists workflow_artifact_versions (
  artifact_id varchar(240) primary key,
  workspace_scope varchar(50) not null,
  artifact_path text not null,
  commit_sha varchar(80),
  source_template_commit varchar(80),
  notes text,
  recorded_at timestamp default current_timestamp
);

create table if not exists learning_recommendations (
  recommendation_id varchar(240) primary key,
  workspace_scope varchar(50) not null,
  pattern_type varchar(120) not null,
  pattern_key varchar(240) not null,
  supporting_run_count int not null,
  confidence varchar(20) not null,
  evidence_query text,
  recommendation text not null,
  target_layer varchar(80) not null,
  target_artifact text not null,
  expected_metric_change text,
  followup_metric text,
  review_after_runs int,
  status varchar(40) default 'proposed',
  implementation_commit varchar(80),
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);
