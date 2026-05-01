import { makeId, isoNow } from "../core/ids.js";

export class KillSwitch {
  enabled: boolean;
  reason: string;

  constructor() {
    this.enabled = false;
    this.reason = "";
  }

  activate(reason = "manual") {
    this.enabled = true;
    this.reason = reason;
  }

  deactivate() {
    this.enabled = false;
    this.reason = "";
  }
}

export class ApprovalStore {
  approvals: Map<string, any>;

  constructor() {
    this.approvals = new Map();
  }

  approve(ticket: any, { approver, now = isoNow(), expiresAt }: any = {}) {
    const approval = {
      id: makeId("approval", { ticket: ticket.id, approver, now }),
      ticket_id: ticket.id,
      approver,
      approved_at: now,
      expires_at: expiresAt ?? new Date(new Date(now).getTime() + 15 * 60 * 1000).toISOString()
    };
    this.approvals.set(ticket.id, approval);
    return approval;
  }

  get(ticketId: string) {
    return this.approvals.get(ticketId);
  }
}

export function preTradeControls({ dossier, ticket, now = isoNow() }: any) {
  const problems = [];
  if (dossier.lifecycle.state !== "active") problems.push(`Thesis state is ${dossier.lifecycle.state}.`);
  if (dossier.decision_packet.vetoes.length > 0) problems.push("Decision packet has active vetoes.");
  if (new Date(now).getTime() > new Date(dossier.lifecycle.expires_at).getTime()) problems.push("Thesis lifecycle is expired.");
  if (ticket.status !== "created" && ticket.status !== "approved") problems.push(`Ticket status ${ticket.status} cannot be submitted.`);
  const exposure = dossier.tool_outputs.find((output) => output.tool_name === "portfolio_exposure_check").result;
  const maxNotional = exposure.total_equity * exposure.max_single_name_pct;
  if (ticket.notional > maxNotional) problems.push("Ticket notional breaches single-name limit.");
  return {
    passed: problems.length === 0,
    problems
  };
}

export class SandboxBroker {
  killSwitch: KillSwitch;
  approvalStore: ApprovalStore;
  submitted: any[];

  constructor({ killSwitch = new KillSwitch(), approvalStore = new ApprovalStore() } = {}) {
    this.killSwitch = killSwitch;
    this.approvalStore = approvalStore;
    this.submitted = [];
  }

  submit({ dossier, ticket, now = isoNow() }: any) {
    if (this.killSwitch.enabled) {
      throw new Error(`Kill switch active: ${this.killSwitch.reason}`);
    }
    const approval = this.approvalStore.get(ticket.id);
    if (!approval) throw new Error("Ticket has no approval.");
    if (new Date(now).getTime() > new Date(approval.expires_at).getTime()) {
      throw new Error("Approval has expired.");
    }
    const controls = preTradeControls({ dossier, ticket, now });
    if (!controls.passed) {
      throw new Error(`Pre-trade controls failed: ${controls.problems.join(" ")}`);
    }
    const submitted = {
      ...ticket,
      status: "submitted_to_sandbox",
      submitted_at: now,
      approval_id: approval.id,
      broker: "sandbox"
    };
    this.submitted.push(submitted);
    return submitted;
  }
}
