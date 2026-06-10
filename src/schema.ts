import type { LearningKernel } from './ledger.ts';

export function initLedger(kernel: LearningKernel): LearningKernel {
  kernel.db.exec(`
    create table if not exists runs (
      run_id text primary key,
      task_shape text not null,
      channel text not null,
      status text not null,
      token_cost integer default 0,
      created_at text not null
    );

    create table if not exists gaps (
      gap_id text primary key,
      run_id text not null references runs(run_id),
      kind text not null,
      summary text not null,
      evidence_ref text not null,
      status text not null check (status in ('observed', 'inferred', 'unknown', 'contradicted')),
      created_at text not null
    );

    create table if not exists protocols (
      protocol_id text primary key,
      title text not null,
      scope_kind text not null check (scope_kind in ('worktree', 'repository', 'channel')),
      scope_value text not null,
      action text not null,
      proposed_by text,
      promoted_by text,
      status text not null check (status in ('candidate', 'active', 'demoted')),
      proposed_at text not null,
      promoted_at text
    );

    create table if not exists protocol_evidence (
      protocol_id text not null references protocols(protocol_id),
      gap_id text not null references gaps(gap_id),
      attached_at text not null,
      primary key (protocol_id, gap_id)
    );

    create table if not exists learning_traces (
      trace_id text primary key,
      run_id text,
      kind text not null check (kind in ('behavior', 'protocol_application', 'agent_response', 'tool_use', 'other')),
      summary text not null,
      ref text,
      payload_json text,
      created_at text not null
    );

    create table if not exists preference_pairs (
      preference_id text primary key,
      context_hash text not null,
      chosen_trace_id text not null references learning_traces(trace_id),
      rejected_trace_id text not null references learning_traces(trace_id),
      reason text not null,
      evidence_ref text not null,
      recorded_by text,
      confidence text not null check (confidence in ('low', 'medium', 'high')),
      created_at text not null,
      check (chosen_trace_id <> rejected_trace_id)
    );

    create table if not exists protocol_preferences (
      protocol_id text not null references protocols(protocol_id),
      preference_id text not null references preference_pairs(preference_id),
      attached_at text not null,
      primary key (protocol_id, preference_id)
    );

    create table if not exists deliveries (
      delivery_id text primary key,
      protocol_id text not null references protocols(protocol_id),
      run_id text,
      task_shape text not null,
      channel text not null,
      delivered_at text not null
    );

    create table if not exists outcomes (
      outcome_id text primary key,
      delivery_id text not null references deliveries(delivery_id),
      run_id text,
      followed integer not null check (followed in (0, 1)),
      defect_repeated integer not null check (defect_repeated in (0, 1)),
      verified integer not null check (verified in (0, 1)),
      cost_band text not null check (cost_band in ('low', 'medium', 'high')),
      credit_delta integer not null,
      recorded_at text not null
    );

    create table if not exists hook_events (
      event_id text primary key,
      session_id text not null,
      turn_id text,
      event_name text not null,
      cwd text not null,
      model text,
      lyo_version text,
      payload_json text not null,
      created_at text not null
    );

    create table if not exists hook_normalizations (
      event_id text primary key references hook_events(event_id),
      job_id text not null,
      normalized_at text not null
    );

    create table if not exists agent_sessions (
      session_id text primary key,
      workspace_scope text not null default 'local',
      repo_path text,
      branch text,
      platform text not null default 'agent',
      model text,
      started_at text not null,
      ended_at text,
      updated_at text not null
    );

    create table if not exists session_prompts (
      prompt_id text primary key,
      session_id text not null references agent_sessions(session_id),
      run_id text,
      turn_id text,
      prompt_index integer not null,
      prompt_role text not null,
      prompt_kind text not null,
      prompt_sha256 text,
      prompt_ref text,
      prompt_summary text,
      response_summary text,
      model text,
      recorded_at text not null
    );

    create table if not exists model_calls (
      call_id text primary key,
      session_id text,
      run_id text,
      provider text not null,
      model text not null,
      model_lane text not null,
      prompt_ref text,
      prompt_sha256 text,
      prompt_summary text,
      input_tokens integer,
      output_tokens integer,
      total_tokens integer,
      estimated_cost real,
      latency_ms integer,
      status text not null check (status in ('started', 'completed', 'failed')),
      error_summary text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists run_goals (
      run_id text primary key,
      goal text not null,
      success_criteria text,
      stop_condition text,
      expected_process text,
      risk_class text,
      created_at text not null
    );

    create table if not exists run_tape_cells (
      cell_id text primary key,
      run_id text not null,
      cell_index integer not null,
      kind text not null check (
        kind in (
          'run_goal',
          'verifier_spec',
          'worker_action',
          'assistant_claim',
          'verifier_result',
          'gap',
          'outcome_completed',
          'blocked'
        )
      ),
      summary text not null,
      evidence_ref text not null,
      passed integer check (passed in (0, 1)),
      state_before text not null,
      state_after text not null,
      payload_json text,
      created_at text not null,
      unique (run_id, cell_index)
    );

    create table if not exists run_execution_contexts (
      run_id text primary key,
      task_shape text,
      functional_axis text,
      domain_axis text,
      stack text,
      tools_used text,
      files_touched text,
      commands_run text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists run_verification_results (
      run_id text primary key,
      tests_run text,
      checks_run text,
      verification_passed integer check (verification_passed in (0, 1)),
      review_verdict text,
      defects text,
      human_corrections text,
      missing_ingredients text,
      guardrail_result text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists exercise_attempts (
      attempt_id text primary key,
      exercise_id text not null,
      run_id text not null,
      track text not null,
      language text not null,
      stage text not null,
      status text not null check (
        status in ('started', 'working', 'failed', 'passed', 'claimed_without_pass', 'blocked')
      ),
      score integer not null default 0,
      last_failure_class text,
      started_at text not null,
      updated_at text not null,
      unique (exercise_id, run_id)
    );

    create table if not exists workspaces (
      workspace_id text primary key,
      root_path text not null unique,
      name text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists zones (
      zone_id text primary key,
      workspace_id text not null references workspaces(workspace_id),
      parent_zone_id text references zones(zone_id),
      zone_kind text not null,
      path_glob text,
      name text not null,
      description text,
      created_at text not null,
      updated_at text not null,
      unique (workspace_id, name)
    );

    create table if not exists jobs (
      job_id text primary key,
      workspace_id text not null references workspaces(workspace_id),
      run_id text,
      task_shape text,
      summary text,
      source_ref text,
      status text not null check (status in ('started', 'completed', 'failed', 'cancelled', 'unknown')),
      created_at text not null,
      completed_at text,
      updated_at text not null
    );

    create table if not exists path_activations (
      activation_id text primary key,
      job_id text not null references jobs(job_id),
      run_id text,
      path text not null,
      activation_kind text not null check (
        activation_kind in (
          'file_read',
          'file_written',
          'file_created',
          'file_deleted',
          'file_diffed',
          'directory_listed',
          'unknown'
        )
      ),
      evidence_ref text,
      confidence text not null check (confidence in ('low', 'medium', 'high')),
      phase text not null default 'unknown',
      created_at text not null
    );

    create table if not exists command_activations (
      command_id text primary key,
      job_id text not null references jobs(job_id),
      run_id text,
      command_name text not null,
      command_family text,
      working_directory text,
      argv_hash text,
      argv_summary text,
      classification text not null check (
        classification in (
          'test',
          'build',
          'lint',
          'format',
          'deploy',
          'database',
          'cloud',
          'package',
          'git',
          'inspect',
          'local_dev',
          'unknown'
        )
      ),
      evidence_ref text,
      status text not null check (status in ('planned', 'attempted', 'succeeded', 'failed', 'unknown')),
      phase text not null default 'unknown',
      output_size integer not null default 0,
      occurrence_count integer not null default 1,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists deployment_actions (
      deployment_id text primary key,
      job_id text not null references jobs(job_id),
      command_id text not null references command_activations(command_id),
      provider text,
      environment text,
      target text,
      status text not null check (status in ('attempted', 'succeeded', 'failed', 'unknown')),
      evidence_ref text,
      created_at text not null,
      completed_at text
    );

    create table if not exists zone_activations (
      activation_id text primary key,
      job_id text not null references jobs(job_id),
      run_id text,
      zone_id text not null references zones(zone_id),
      activation_kind text not null,
      source_kind text not null check (
        source_kind in ('path', 'command', 'deployment', 'manual', 'inferred')
      ),
      source_id text,
      evidence_ref text,
      strength real not null default 1.0,
      confidence text not null check (confidence in ('low', 'medium', 'high')),
      created_at text not null,
      unique (job_id, zone_id, source_kind, source_id)
    );

    create table if not exists zone_coactivations (
      coactivation_id text primary key,
      job_id text not null references jobs(job_id),
      left_zone_id text not null references zones(zone_id),
      right_zone_id text not null references zones(zone_id),
      reason text,
      strength real not null default 1.0,
      created_at text not null,
      check (left_zone_id <> right_zone_id),
      unique (job_id, left_zone_id, right_zone_id)
    );

    create table if not exists zone_associations (
      association_id text primary key,
      left_zone_id text not null references zones(zone_id),
      right_zone_id text not null references zones(zone_id),
      association_kind text not null,
      weight real not null default 0,
      support_count integer not null default 0,
      positive_outcomes integer not null default 0,
      negative_outcomes integer not null default 0,
      last_observed_at text,
      created_at text not null,
      updated_at text not null,
      check (left_zone_id <> right_zone_id),
      unique (left_zone_id, right_zone_id, association_kind)
    );

    create table if not exists zone_association_observations (
      association_id text not null references zone_associations(association_id),
      job_id text not null references jobs(job_id),
      outcome text not null check (outcome in ('positive', 'negative', 'unknown')),
      observed_at text not null,
      primary key (association_id, job_id)
    );
  `);
  ensureColumn(kernel, 'path_activations', 'phase', "text not null default 'unknown'");
  ensureColumn(kernel, 'hook_events', 'lyo_version', 'text');
  ensureColumn(kernel, 'command_activations', 'phase', "text not null default 'unknown'");
  ensureColumn(kernel, 'command_activations', 'output_size', 'integer not null default 0');
  ensureColumn(kernel, 'command_activations', 'occurrence_count', 'integer not null default 1');
  return kernel;
}

function ensureColumn(kernel: LearningKernel, tableName: string, columnName: string, definition: string): void {
  const columns = kernel.db.prepare(`pragma table_info(${tableName})`).all() as { name: string }[];
  if (columns.some((column) => column.name === columnName)) return;
  kernel.db.exec(`alter table ${tableName} add column ${columnName} ${definition}`);
}
