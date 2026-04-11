"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface PendingApproval {
  approvalId: string;
  toolName: string;
  title?: string;
  displayName?: string;
  input: Record<string, unknown>;
  decisionReason?: string;
}

interface Props {
  pending: PendingApproval | null;
  resolving: boolean;
  onApprove: () => void;
  onReject: (note?: string) => void;
}

export function ApprovalDialog({ pending, resolving, onApprove, onReject }: Props) {
  const [note, setNote] = useState("");

  // Reset the note when a new approval arrives
  useEffect(() => {
    setNote("");
  }, [pending?.approvalId]);

  const open = pending !== null;
  const formattedInput = pending ? JSON.stringify(pending.input, null, 2) : "";
  const titleText = pending
    ? (pending.title ?? pending.displayName ?? `Run ${pending.toolName}`)
    : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !resolving && pending) {
          // Treat dialog dismissal as rejection for safety
          onReject("Dismissed without decision");
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approval required</DialogTitle>
          <DialogDescription>
            The forge agent is paused on a tool call. Review the details and
            approve or reject.
          </DialogDescription>
        </DialogHeader>

        {pending && (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Tool</p>
              <p className="text-sm font-mono">{pending.toolName}</p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Action</p>
              <p className="text-sm">{titleText}</p>
            </div>

            {pending.decisionReason && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Reason</p>
                <p className="text-sm">{pending.decisionReason}</p>
              </div>
            )}

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Input</p>
              <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/50 rounded p-2 max-h-48 overflow-auto">
                {formattedInput}
              </pre>
            </div>

            <div className="space-y-1">
              <label htmlFor="approval-note" className="text-xs text-muted-foreground">
                Rejection note (optional — only used if you reject)
              </label>
              <Input
                id="approval-note"
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
                placeholder="e.g. use git log -n 5 instead"
                disabled={resolving}
                maxLength={500}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onReject(note.trim() || undefined)}
            disabled={resolving}
          >
            Reject
          </Button>
          <Button onClick={onApprove} disabled={resolving}>
            {resolving ? "Resolving…" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
