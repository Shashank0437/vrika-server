# Client access controls

`src/lib/access.ts` is the shared UI permission model. `/auth/me` supplies
`role_bindings` and `access_version`. An explicit empty binding list means no
workspace access, even when a legacy administrator role is present. Only accounts
without the bindings field use legacy compatibility: administrators map to global
admin; members map to Web Security and Cloud Security analysts.

| Role | Scope | UI permissions |
| --- | --- | --- |
| Viewer | Global (this organization) | Read, including members and settings |
| Analyst | One security module | Read, execute and edit that module |
| Lead | One project | Read, execute, edit and manage that project's membership |
| Admin | Global (this organization) | All actions, including role assignment |

Bindings combine only when their scopes match. Entering a module does not grant
permission to operate on unscoped resources. Project leads must choose an
authorized project before creating a scan. Session writes use the session's
`project_id`; new sessions send it to `/workspace/agent-chat/sessions`.
Standalone tools require Web Security module execution permission; project leads
execute tools inside their scoped chat sessions. Organization tool policies and
settings require global edit permission.

Viewers cannot create/delete chats, send messages, approve/run tools, generate
analysis/reports or change configuration. Existing reports remain downloadable.
Cloud iframe permissions are enforced by the embedded application; the parent
client gates module entry. All API authorization remains server-enforced.

## Managing access

Organization administrators can add/remove multiple constrained Role + Scope
bindings under **User management**. The role picker contains Viewer, Analyst and
Project Lead only; administrator access is a separate control. Scope menus list
actual projects only, with no module options or selectable placeholder. Invitations
and new bindings default to Viewer with no project selected; a project is required
before saving. Existing module bindings are identified in the closed control and
preserved unless explicitly changed or removed.
Administrator selection hides the role/scope editor and drops only incomplete
project drafts, so admin-only invitations do not require a project. Existing valid
bindings are retained and become visible again when administrator access is removed.
Updates send `expected_version` to `/tenant/members/{id}/bindings`; a conflict
keeps the editor open and asks the operator to reopen refreshed bindings. Changing
your own bindings refreshes authentication immediately.

**Projects** supports creation (admin), renaming and project-role changes (admin or
the corresponding project lead). Leads assign Viewer, Analyst or Lead for their
own project only. Changes are saved immediately with optimistic versions, and
preserve module, administrator and other-project bindings. Members with broader
access keep it; assigning a project Viewer does not demote an administrator.
Leads use a minimal organization member picker without gaining access
to the administration directory. The page contains project details and team access
only, without web-session or cloud-provider assignment panels or requests.
Web and Cloud project pickers sit in their existing header rows. Project name and
role changes are separate API updates; errors explain
that an earlier update may already have succeeded.

Project, member and role choices use `WorkspaceSelect`: a searchable custom
listbox with keyboard navigation, Escape dismissal and focus restoration.
Its popover stays inside the viewport and above modal content. Directory search,
human-readable role labels and explicit empty states keep raw IDs out of the UI.
These presentation changes do not change API authorization.

## Project workflow

`useProjectScope` shares Web project selection between history and chat. The
custom picker remains in the header, including when a chat is open. Selection is
stored per user, organization and module; the `project` URL parameter overrides
the saved value. `all` is an aggregate view, not a project ID. The Unassigned
option is removed; legacy `unassigned` URLs and saved preferences resolve to All
projects. Creating a new chat scan requires an actual project selection.
Cloud uses its own persisted selection.

History, its metrics and Recent Chats use project-filtered API queries.
Out-of-order responses cannot replace the current project's results, and routine
refreshes do not blank a loaded list. Permission errors clear cached results.
New scans inherit the selected project. Terminal links carry the session's
actual project and can load an older chat outside the recent-list limit.
Selecting a project never moves an existing session or changes role bindings.

## Targeted validation

```sh
npx tsc --noEmit --incremental false
npx eslint src/lib/access.ts src/components/dashboard/RoleBindingsEditor.tsx tests/scoped-access.spec.ts
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3108 npx playwright test tests/scoped-access.spec.ts tests/project-workflow.spec.ts tests/dashboard-sessions.spec.ts tests/chat-recent-list.spec.ts
```

Run the UI at the specified URL before the Playwright command. The mocked suite
uses DOM-ready navigation and rendered-state assertions rather than waiting for
all iframe assets. External base URLs allow 15 seconds for assertions and 60
seconds per test; local defaults remain 5 and 30 seconds.
The suite
covers scope matching, canonical/legacy roles, no-access and cloud-only navigation,
read-only viewer controls, binding edits/conflicts, invitation defaults, self-role
refresh, project membership and project-scoped session creation. It does not
replace server authorization tests.
