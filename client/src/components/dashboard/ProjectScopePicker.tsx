"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { WorkspaceSelect } from "@/components/ui/WorkspaceSelect";
import type { ProjectScope } from "@/lib/use-project-scope";

export function ProjectScopePicker({
  context,
  label,
  portal = false,
  disabled = false,
  onChange,
}: {
  context: ProjectScope;
  label: string;
  portal?: boolean;
  disabled?: boolean;
  onChange?: (scope: string) => void;
}) {
  const [toolbar, setToolbar] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (portal) setToolbar(document.getElementById("dashboard-header-actions"));
  }, [portal]);
  const picker = (
    <div className="flex min-w-0 items-center gap-3">
      {portal && (
        <span className="hidden shrink-0 text-xs font-semibold text-on-surface-variant lg:block">
          {label}
        </span>
      )}
      <WorkspaceSelect
        label={label}
        value={context.scope}
        onChange={onChange ?? context.setScope}
        options={context.options}
        disabled={disabled || !context.ready}
        className="w-full max-w-64"
      />
      {context.error && (
        <span role="alert" className="max-w-48 text-xs text-error">
          {context.error}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void context.reload()}
          >
            Retry
          </button>
        </span>
      )}
    </div>
  );
  return portal ? toolbar && createPortal(picker, toolbar) : picker;
}
