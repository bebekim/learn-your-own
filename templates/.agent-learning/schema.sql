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
  change_commit varchar(80),
  created_at timestamp default current_timestamp
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
