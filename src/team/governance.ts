import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readAuditBundle } from "../audit.js";
import { isoNow, makeId } from "../core/ids.js";
import {
  DEFAULT_MODEL_REGISTRY,
  DEFAULT_TOOL_REGISTRY,
  validateGovernedRelease
} from "../governance/registry.js";

export const TEAM_GOVERNANCE_FILE = "team-governance.json";

export const TEAM_ROLES = [
  "owner",
  "lead_analyst",
  "risk_reviewer",
  "compliance_reviewer",
  "model_validator",
  "observer"
] as const;

export const REVIEW_TYPES = [
  "analysis_review",
  "risk_review",
  "compliance_review",
  "model_review"
] as const;

const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: [
    "manage_workspace",
    "manage_members",
    "assign_review",
    "comment",
    "approve_analysis_review",
    "approve_risk_review",
    "approve_compliance_review",
    "approve_model_review",
    "export_governance"
  ],
  lead_analyst: ["assign_review", "comment", "approve_analysis_review", "export_governance"],
  risk_reviewer: ["comment", "approve_risk_review"],
  compliance_reviewer: ["comment", "approve_compliance_review", "export_governance"],
  model_validator: ["comment", "approve_model_review", "export_governance"],
  observer: ["comment"]
};

const REVIEW_ROLE: Record<string, string> = {
  analysis_review: "lead_analyst",
  risk_review: "risk_reviewer",
  compliance_review: "compliance_reviewer",
  model_review: "model_validator"
};

const SOC2_CONTROLS = [
  {
    id: "CC1.1",
    name: "Control Environment",
    description: "Workspace owner and active role directory are configured."
  },
  {
    id: "CC2.1",
    name: "Communication And Information",
    description: "Review assignments, comments, and approvals are persisted as audit records."
  },
  {
    id: "CC3.1",
    name: "Risk Assessment",
    description: "Release readiness checks combine dossier validation with required human approvals."
  },
  {
    id: "CC6.1",
    name: "Logical Access",
    description: "Approval authority is role-bound by review type."
  },
  {
    id: "CC7.1",
    name: "Change Management",
    description: "Model/tool registry and validation status are included in release controls."
  },
  {
    id: "A1.1",
    name: "Availability And Audit Export",
    description: "A portable governance export can reconstruct team review state."
  }
] as const;

function governancePath(auditDir: string) {
  return path.join(auditDir, TEAM_GOVERNANCE_FILE);
}

async function readJsonIfExists(filePath: string, fallback: any) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error: any) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath: string, value: any) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeRole(role: string) {
  if (!TEAM_ROLES.includes(role as any)) {
    throw new Error(`Unknown team role: ${role}`);
  }
  return role;
}

function normalizeReviewType(reviewType: string) {
  if (!REVIEW_TYPES.includes(reviewType as any)) {
    throw new Error(`Unknown review type: ${reviewType}`);
  }
  return reviewType;
}

function defaultLedger({
  auditDir,
  workspaceName = "Parallax Team Workspace",
  now = isoNow()
}: {
  auditDir: string;
  workspaceName?: string;
  now?: string;
}) {
  return {
    schema_version: "0.1.0",
    audit_dir: auditDir,
    workspace: {
      id: makeId("team_ws", { auditDir, workspaceName, now }),
      name: workspaceName,
      created_at: now,
      product_boundary: "Research, watchlist, and paper-trade governance only; no live execution."
    },
    role_permissions: ROLE_PERMISSIONS,
    review_policy: {
      review_role_map: REVIEW_ROLE,
      paper_trade_candidate_required_reviews: REVIEW_TYPES,
      watchlist_required_reviews: ["analysis_review", "risk_review", "compliance_review"],
      no_trade_required_reviews: ["analysis_review", "compliance_review"],
      release_rule:
        "A dossier is team-release-ready only when registry validation passes, required approvals are present, and no review has requested changes or rejected the thesis."
    },
    soc2_readiness_program: SOC2_CONTROLS,
    members: [],
    assignments: [],
    comments: [],
    approvals: []
  };
}

export async function loadTeamGovernance(auditDir = "audits") {
  return readJsonIfExists(governancePath(auditDir), defaultLedger({ auditDir }));
}

export async function saveTeamGovernance(auditDir: string, ledger: any) {
  const next = {
    ...ledger,
    schema_version: "0.1.0",
    audit_dir: auditDir
  };
  await writeJson(governancePath(auditDir), next);
  return next;
}

function memberByName(ledger: any, name: string) {
  return (ledger.members ?? []).find((member: any) =>
    member.status !== "disabled" && member.name === name
  );
}

function permissionsForMember(ledger: any, name: string) {
  const member = memberByName(ledger, name);
  if (!member) return [];
  return ROLE_PERMISSIONS[member.role] ?? [];
}

function requirePermission(ledger: any, name: string, permission: string) {
  const permissions = permissionsForMember(ledger, name);
  if (!permissions.includes(permission)) {
    throw new Error(`${name} does not have permission ${permission}.`);
  }
}

function canApproveReview(ledger: any, approver: string, reviewType: string) {
  const permission = `approve_${reviewType}`;
  return permissionsForMember(ledger, approver).includes(permission);
}

function requiredReviewTypesForDossier(dossier: any) {
  const action = dossier.decision_packet?.action_class ?? dossier.action_class;
  if (action === "no_trade") return ["analysis_review", "compliance_review"];
  if (action === "paper_trade_candidate") return [...REVIEW_TYPES];
  return ["analysis_review", "risk_review", "compliance_review"];
}

export async function initializeTeamWorkspace({
  auditDir = "audits",
  workspaceName = "Parallax Team Workspace",
  owner = "workspace_owner",
  now = isoNow()
}: {
  auditDir?: string;
  workspaceName?: string;
  owner?: string;
  now?: string;
} = {}) {
  const existing = await readJsonIfExists(governancePath(auditDir), undefined);
  const ledger = existing ?? defaultLedger({ auditDir, workspaceName, now });
  ledger.workspace = {
    ...ledger.workspace,
    name: workspaceName || ledger.workspace?.name || "Parallax Team Workspace"
  };
  const existingOwner = memberByName(ledger, owner);
  if (!existingOwner) {
    ledger.members = [
      ...(ledger.members ?? []),
      {
        id: makeId("member", { workspace_id: ledger.workspace.id, name: owner, role: "owner" }),
        name: owner,
        role: "owner",
        email: "",
        status: "active",
        added_at: now
      }
    ];
  }
  const saved = await saveTeamGovernance(auditDir, ledger);
  return {
    ledger: saved,
    ledger_path: governancePath(auditDir),
    workspace: saved.workspace,
    member_count: saved.members.length
  };
}

export async function addTeamMember({
  auditDir = "audits",
  name,
  role,
  email = "",
  actor,
  now = isoNow()
}: {
  auditDir?: string;
  name: string;
  role: string;
  email?: string;
  actor?: string;
  now?: string;
}) {
  normalizeRole(role);
  const ledger = await loadTeamGovernance(auditDir);
  const hasActiveMembers = (ledger.members ?? []).some((member: any) => member.status !== "disabled");
  if (hasActiveMembers && !actor) {
    throw new Error("Adding a team member requires --actor once the workspace has active members.");
  }
  if (actor) requirePermission(ledger, actor, "manage_members");
  const existing = memberByName(ledger, name);
  const member = existing
    ? {
      ...existing,
      role,
      email,
      status: "active",
      updated_at: now
    }
    : {
      id: makeId("member", { workspace_id: ledger.workspace.id, name, role, email }),
      name,
      role,
      email,
      status: "active",
      added_at: now
    };
  ledger.members = existing
    ? ledger.members.map((item: any) => item.id === existing.id ? member : item)
    : [...ledger.members, member];
  const saved = await saveTeamGovernance(auditDir, ledger);
  return {
    member,
    permissions: ROLE_PERMISSIONS[role],
    ledger_path: governancePath(auditDir),
    member_count: saved.members.length
  };
}

export async function assignGovernanceReview({
  auditPath,
  auditDir = path.dirname(auditPath),
  reviewType,
  assignee,
  requester = "",
  dueAt = "",
  note = "",
  now = isoNow()
}: {
  auditPath: string;
  auditDir?: string;
  reviewType: string;
  assignee: string;
  requester?: string;
  dueAt?: string;
  note?: string;
  now?: string;
}) {
  const normalizedType = normalizeReviewType(reviewType);
  const ledger = await loadTeamGovernance(auditDir);
  if (!requester) throw new Error("Assigning a governance review requires a requester.");
  requirePermission(ledger, requester, "assign_review");
  const member = memberByName(ledger, assignee);
  if (!member) throw new Error(`Assignee ${assignee} is not an active team member.`);
  if (member.role !== REVIEW_ROLE[normalizedType] && member.role !== "owner") {
    throw new Error(`${assignee} has role ${member.role}, but ${normalizedType} requires ${REVIEW_ROLE[normalizedType]}.`);
  }

  const bundle = await readAuditBundle(auditPath);
  const dossier = bundle.dossier;
  const assignment = {
    id: makeId("review", {
      dossier_id: dossier.id,
      reviewType: normalizedType,
      assignee,
      requester,
      now,
      note
    }),
    dossier_id: dossier.id,
    symbol: dossier.symbol,
    action_class: dossier.decision_packet.action_class,
    audit_path: auditPath,
    review_type: normalizedType,
    assignee,
    requester,
    due_at: dueAt,
    note,
    status: "open",
    created_at: now
  };
  ledger.assignments = [...(ledger.assignments ?? []), assignment];
  await saveTeamGovernance(auditDir, ledger);
  return {
    assignment,
    ledger_path: governancePath(auditDir)
  };
}

export async function recordGovernanceComment({
  auditPath,
  auditDir = path.dirname(auditPath),
  author,
  body,
  tags = [],
  visibility = "team",
  now = isoNow()
}: {
  auditPath: string;
  auditDir?: string;
  author: string;
  body: string;
  tags?: string[];
  visibility?: string;
  now?: string;
}) {
  const ledger = await loadTeamGovernance(auditDir);
  if (!memberByName(ledger, author)) throw new Error(`Author ${author} is not an active team member.`);
  requirePermission(ledger, author, "comment");
  const bundle = await readAuditBundle(auditPath);
  const dossier = bundle.dossier;
  const comment = {
    id: makeId("comment", { dossier_id: dossier.id, author, body, tags, now }),
    dossier_id: dossier.id,
    symbol: dossier.symbol,
    audit_path: auditPath,
    author,
    body,
    tags,
    visibility,
    created_at: now
  };
  ledger.comments = [...(ledger.comments ?? []), comment];
  await saveTeamGovernance(auditDir, ledger);
  return {
    comment,
    ledger_path: governancePath(auditDir)
  };
}

export async function approveGovernanceReview({
  auditDir = "audits",
  assignmentId,
  approver,
  decision = "approved",
  rationale = "",
  now = isoNow()
}: {
  auditDir?: string;
  assignmentId: string;
  approver: string;
  decision?: string;
  rationale?: string;
  now?: string;
}) {
  if (!["approved", "changes_requested", "rejected"].includes(decision)) {
    throw new Error(`Unknown review decision: ${decision}`);
  }
  const ledger = await loadTeamGovernance(auditDir);
  const assignment = (ledger.assignments ?? []).find((item: any) => item.id === assignmentId);
  if (!assignment) throw new Error(`Review assignment ${assignmentId} was not found.`);
  if (!canApproveReview(ledger, approver, assignment.review_type)) {
    throw new Error(`${approver} cannot approve ${assignment.review_type}.`);
  }
  if (assignment.assignee !== approver && memberByName(ledger, approver)?.role !== "owner") {
    throw new Error(`${approver} is not assigned to ${assignment.review_type}.`);
  }

  const approval = {
    id: makeId("gov_approval", { assignmentId, approver, decision, rationale, now }),
    assignment_id: assignmentId,
    dossier_id: assignment.dossier_id,
    symbol: assignment.symbol,
    audit_path: assignment.audit_path,
    review_type: assignment.review_type,
    approver,
    decision,
    rationale,
    created_at: now
  };
  ledger.assignments = ledger.assignments.map((item: any) => {
    if (item.id !== assignmentId) return item;
    return {
      ...item,
      status: decision,
      resolved_at: now,
      approval_id: approval.id
    };
  });
  ledger.approvals = [...(ledger.approvals ?? []), approval];
  await saveTeamGovernance(auditDir, ledger);
  return {
    approval,
    assignment: ledger.assignments.find((item: any) => item.id === assignmentId),
    ledger_path: governancePath(auditDir)
  };
}

async function readAuditBundlesFromDir(auditDir: string) {
  const bundles: any[] = [];
  try {
    const files = await readdir(auditDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      if ([TEAM_GOVERNANCE_FILE, "library.json", "paper-ledger.json", "lifecycle-checks.json", "lifecycle-overrides.json", "alert-preferences.json"].includes(file)) {
        continue;
      }
      try {
        const auditPath = path.join(auditDir, file);
        const bundle = await readAuditBundle(auditPath);
        if (bundle?.dossier?.id) bundles.push({ auditPath, bundle });
      } catch {
        // Governance reports skip non-audit JSON in the workspace.
      }
    }
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
  }
  return bundles.sort((a, b) =>
    String(b.bundle.dossier.created_at).localeCompare(String(a.bundle.dossier.created_at))
  );
}

function latestApprovalsByType(ledger: any, dossierId: string) {
  const approvals = (ledger.approvals ?? [])
    .filter((approval: any) => approval.dossier_id === dossierId)
    .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));
  const byType = new Map<string, any>();
  for (const approval of approvals) byType.set(approval.review_type, approval);
  return byType;
}

function buildReleaseControl({ dossier, auditPath, ledger }: { dossier: any; auditPath: string; ledger: any }) {
  const releaseValidation = validateGovernedRelease({ dossier });
  const requiredReviewTypes = requiredReviewTypesForDossier(dossier);
  const approvalsByType = latestApprovalsByType(ledger, dossier.id);
  const approvedReviewTypes = requiredReviewTypes.filter((reviewType) =>
    approvalsByType.get(reviewType)?.decision === "approved"
  );
  const missingReviewTypes = requiredReviewTypes.filter((reviewType) => !approvedReviewTypes.includes(reviewType));
  const blockingReviews = (ledger.assignments ?? []).filter((assignment: any) =>
    assignment.dossier_id === dossier.id &&
    ["changes_requested", "rejected"].includes(assignment.status)
  );
  const openAssignments = (ledger.assignments ?? []).filter((assignment: any) =>
    assignment.dossier_id === dossier.id && assignment.status === "open"
  );
  const releaseReady =
    releaseValidation.passed &&
    missingReviewTypes.length === 0 &&
    blockingReviews.length === 0;
  const status = releaseReady
    ? "release_ready"
    : releaseValidation.passed
      ? "needs_review"
      : "blocked";
  return {
    dossier_id: dossier.id,
    symbol: dossier.symbol,
    action_class: dossier.decision_packet.action_class,
    thesis_state: dossier.lifecycle.state,
    audit_path: auditPath,
    council_model_ref: dossier.council_run?.provider?.model_registry_ref ?? "rule_council_v0",
    tool_count: dossier.tool_outputs?.length ?? 0,
    registry_validation: releaseValidation,
    required_review_types: requiredReviewTypes,
    approved_review_types: approvedReviewTypes,
    missing_review_types: missingReviewTypes,
    open_assignment_count: openAssignments.length,
    blocking_review_count: blockingReviews.length,
    status,
    release_ready: releaseReady
  };
}

function buildSoc2Readiness(ledger: any, releaseControls: any[]) {
  const activeMembers = (ledger.members ?? []).filter((member: any) => member.status !== "disabled");
  const hasOwner = activeMembers.some((member: any) => member.role === "owner");
  const unauthorizedApprovals = (ledger.approvals ?? []).filter((approval: any) =>
    !canApproveReview(ledger, approval.approver, approval.review_type)
  );
  const modelToolRegistryReady =
    Object.keys(DEFAULT_MODEL_REGISTRY).length > 0 &&
    Object.keys(DEFAULT_TOOL_REGISTRY).length > 0;
  const controlStatus: Record<string, any> = {
    "CC1.1": {
      status: hasOwner && activeMembers.length > 0 ? "passed" : "needs_attention",
      evidence: [`active_members=${activeMembers.length}`, `owner_present=${hasOwner}`]
    },
    "CC2.1": {
      status: (ledger.assignments?.length ?? 0) + (ledger.comments?.length ?? 0) + (ledger.approvals?.length ?? 0) > 0
        ? "passed"
        : "needs_attention",
      evidence: [
        `assignments=${ledger.assignments?.length ?? 0}`,
        `comments=${ledger.comments?.length ?? 0}`,
        `approvals=${ledger.approvals?.length ?? 0}`
      ]
    },
    "CC3.1": {
      status: releaseControls.length > 0 && releaseControls.every((control) => control.registry_validation)
        ? "passed"
        : "needs_attention",
      evidence: [
        `release_controls=${releaseControls.length}`,
        `release_ready=${releaseControls.filter((control) => control.release_ready).length}`
      ]
    },
    "CC6.1": {
      status: unauthorizedApprovals.length === 0 ? "passed" : "needs_attention",
      evidence: [`unauthorized_approvals=${unauthorizedApprovals.length}`]
    },
    "CC7.1": {
      status: modelToolRegistryReady ? "passed" : "needs_attention",
      evidence: [
        `models=${Object.keys(DEFAULT_MODEL_REGISTRY).length}`,
        `tools=${Object.keys(DEFAULT_TOOL_REGISTRY).length}`
      ]
    },
    "A1.1": {
      status: "passed",
      evidence: [`governance_file=${TEAM_GOVERNANCE_FILE}`]
    }
  };

  const controls = SOC2_CONTROLS.map((control) => ({
    ...control,
    ...controlStatus[control.id]
  }));
  const passed = controls.every((control: any) => control.status === "passed");
  return {
    status: passed ? "ready" : "needs_attention",
    passed_control_count: controls.filter((control: any) => control.status === "passed").length,
    control_count: controls.length,
    controls
  };
}

export async function buildGovernanceReport(auditDir = "audits") {
  const ledger = await loadTeamGovernance(auditDir);
  const auditBundles = await readAuditBundlesFromDir(auditDir);
  const releaseControls = auditBundles.map(({ auditPath, bundle }) =>
    buildReleaseControl({ dossier: bundle.dossier, auditPath, ledger })
  );
  const activeMembers = (ledger.members ?? []).filter((member: any) => member.status !== "disabled");
  const assignments = ledger.assignments ?? [];
  const comments = ledger.comments ?? [];
  const approvals = ledger.approvals ?? [];
  const summary = {
    audit_dir: auditDir,
    workspace_id: ledger.workspace?.id ?? "uninitialized",
    workspace_name: ledger.workspace?.name ?? "Uninitialized",
    member_count: activeMembers.length,
    dossier_count: releaseControls.length,
    assignment_count: assignments.length,
    open_assignment_count: assignments.filter((item: any) => item.status === "open").length,
    comment_count: comments.length,
    approval_count: approvals.length,
    release_ready_count: releaseControls.filter((control) => control.release_ready).length,
    blocked_release_count: releaseControls.filter((control) => control.status === "blocked").length
  };
  return {
    schema_version: "0.1.0",
    generated_at: isoNow(),
    summary,
    workspace: ledger.workspace,
    members: activeMembers,
    role_permissions: ROLE_PERMISSIONS,
    review_policy: ledger.review_policy,
    assignments,
    comments,
    approvals,
    release_controls: releaseControls,
    model_registry: DEFAULT_MODEL_REGISTRY,
    tool_registry: DEFAULT_TOOL_REGISTRY,
    soc2_readiness: buildSoc2Readiness(ledger, releaseControls)
  };
}

export async function exportGovernancePackage({
  auditDir = "audits",
  out
}: {
  auditDir?: string;
  out: string;
}) {
  const report = await buildGovernanceReport(auditDir);
  const auditBundles = await readAuditBundlesFromDir(auditDir);
  const body = {
    schema_version: "0.1.0",
    exported_at: isoNow(),
    audit_dir: auditDir,
    governance_ledger: await loadTeamGovernance(auditDir),
    report,
    audit_bundle_refs: auditBundles.map(({ auditPath, bundle }) => ({
      dossier_id: bundle.dossier.id,
      symbol: bundle.dossier.symbol,
      action_class: bundle.dossier.decision_packet.action_class,
      audit_path: auditPath,
      bundle_hash: bundle.hash
    }))
  };
  await writeJson(out, body);
  return {
    out,
    workspace_name: report.summary.workspace_name,
    dossier_count: report.summary.dossier_count,
    release_ready_count: report.summary.release_ready_count,
    assignment_count: report.summary.assignment_count,
    comment_count: report.summary.comment_count,
    approval_count: report.summary.approval_count,
    soc2_status: report.soc2_readiness.status
  };
}
