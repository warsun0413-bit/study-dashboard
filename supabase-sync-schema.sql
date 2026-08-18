-- Study Dashboard cloud sync schema for Supabase Postgres.
-- Run manually in a new Supabase project only after reviewing the project and RLS policies.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.study_sync_documents (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_key text not null check (char_length(document_key) between 1 and 120),
  payload text not null check (octet_length(payload) between 1 and 5242880),
  content_fingerprint text not null,
  revision bigint not null check (revision >= 1),
  updated_at timestamptz not null default now(),
  updated_by_device text not null check (char_length(updated_by_device) between 1 and 160),
  primary key (user_id, document_key)
);

create table if not exists public.study_sync_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id text not null check (char_length(operation_id) between 1 and 240),
  document_key text not null,
  result_status text not null check (result_status in ('applied', 'conflict', 'rejected')),
  remote_revision bigint not null check (remote_revision >= 0),
  remote_fingerprint text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

alter table public.study_sync_documents enable row level security;
alter table public.study_sync_operations enable row level security;

drop policy if exists "read own study sync documents" on public.study_sync_documents;
create policy "read own study sync documents"
on public.study_sync_documents for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "read own study sync operations" on public.study_sync_operations;
create policy "read own study sync operations"
on public.study_sync_operations for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.study_sync_documents from public, anon;
revoke all on public.study_sync_operations from public, anon;
revoke insert, update, delete on public.study_sync_documents from authenticated;
revoke insert, update, delete on public.study_sync_operations from authenticated;
grant select on public.study_sync_documents to authenticated;
grant select on public.study_sync_operations to authenticated;

-- SECURITY DEFINER is intentional: signed-in clients cannot write the tables
-- directly, and every write must pass the ownership, whitelist and revision checks below.
create or replace function public.apply_study_sync_operation(operation jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  v_operation_id text := trim(coalesce(operation->>'operationId', ''));
  v_device_id text := trim(coalesce(operation->>'deviceId', ''));
  v_document_key text := trim(coalesce(operation->>'key', ''));
  v_payload text := operation->>'payload';
  v_operation_kind text := trim(coalesce(operation->>'kind', ''));
  v_base_revision bigint;
  existing_document public.study_sync_documents%rowtype;
  existing_operation public.study_sync_operations%rowtype;
  next_revision bigint;
  next_fingerprint text;
  allowed_keys constant text[] := array[
    'review-history', 'studyDailyPlans', 'studyPlanPhaseTemplates', 'studyPlanWindowState',
    'studyFocusSeconds', 'studyTaskFocusSeconds', 'studyFocusSessions', 'studyManualTimeRecords',
    'studyDailyTargetSeconds', 'studyExamStatsConfig', 'studyAdmissionMockScores',
    'studyAdmissionAssessmentConfig', 'studyImportedPlan', 'reviewQueue', 'studyProfessionalResults',
    'studyEnglishWordRecords', 'studyEnglishReadingRecords', 'studyPoliticsRecords', 'studyOutputRecords',
    'studyAnkiCandidates', 'studyExecutionModes', 'studyDebtQueue', 'studyWeeklyImprovementRecords'
  ];
begin
  if caller is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if coalesce((operation->>'schemaVersion')::integer, 0) <> 1 or v_operation_kind <> 'replace-key' then
    raise exception 'unsupported sync operation' using errcode = '22023';
  end if;
  if v_operation_id = '' or char_length(v_operation_id) > 240 or v_device_id = '' or char_length(v_device_id) > 160 then
    raise exception 'invalid operation identity' using errcode = '22023';
  end if;
  if not (v_document_key = any(allowed_keys)) or v_payload is null or octet_length(v_payload) > 5242880 then
    raise exception 'invalid sync document' using errcode = '22023';
  end if;
  perform v_payload::jsonb;
  v_base_revision := coalesce((operation->>'baseRemoteRevision')::bigint, 0);
  if v_base_revision < 0 then raise exception 'invalid base revision' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(caller::text || ':' || v_document_key, 0));

  select * into existing_operation
  from public.study_sync_operations
  where user_id = caller and study_sync_operations.operation_id = v_operation_id;
  if found then
    return jsonb_build_object(
      'operationId', v_operation_id, 'key', existing_operation.document_key,
      'status', case when existing_operation.result_status = 'applied' then 'already-applied' else existing_operation.result_status end,
      'remoteRevision', existing_operation.remote_revision,
      'remoteFingerprint', existing_operation.remote_fingerprint
    );
  end if;

  select * into existing_document
  from public.study_sync_documents
  where user_id = caller and study_sync_documents.document_key = v_document_key
  for update;

  if found and existing_document.revision <> v_base_revision then
    insert into public.study_sync_operations(user_id, operation_id, document_key, result_status, remote_revision, remote_fingerprint)
    values (caller, v_operation_id, v_document_key, 'conflict', existing_document.revision, existing_document.content_fingerprint);
    return jsonb_build_object(
      'operationId', v_operation_id, 'key', v_document_key, 'status', 'conflict',
      'remoteRevision', existing_document.revision, 'remoteFingerprint', existing_document.content_fingerprint,
      'message', 'remote revision changed'
    );
  end if;
  if not found and v_base_revision <> 0 then
    insert into public.study_sync_operations(user_id, operation_id, document_key, result_status, remote_revision, remote_fingerprint)
    values (caller, v_operation_id, v_document_key, 'conflict', 0, '');
    return jsonb_build_object(
      'operationId', v_operation_id, 'key', v_document_key, 'status', 'conflict',
      'remoteRevision', 0, 'remoteFingerprint', '', 'message', 'remote document missing'
    );
  end if;

  next_revision := case when found then existing_document.revision + 1 else 1 end;
  next_fingerprint := encode(extensions.digest(convert_to(v_payload, 'UTF8'), 'sha256'), 'hex');
  insert into public.study_sync_documents(user_id, document_key, payload, content_fingerprint, revision, updated_at, updated_by_device)
  values (caller, v_document_key, v_payload, next_fingerprint, next_revision, now(), v_device_id)
  on conflict (user_id, document_key) do update set
    payload = excluded.payload,
    content_fingerprint = excluded.content_fingerprint,
    revision = excluded.revision,
    updated_at = excluded.updated_at,
    updated_by_device = excluded.updated_by_device;
  insert into public.study_sync_operations(user_id, operation_id, document_key, result_status, remote_revision, remote_fingerprint)
  values (caller, v_operation_id, v_document_key, 'applied', next_revision, next_fingerprint);
  return jsonb_build_object(
    'operationId', v_operation_id, 'key', v_document_key, 'status', 'applied',
    'remoteRevision', next_revision, 'remoteFingerprint', next_fingerprint
  );
end;
$$;

revoke all on function public.apply_study_sync_operation(jsonb) from public, anon;
grant execute on function public.apply_study_sync_operation(jsonb) to authenticated;
