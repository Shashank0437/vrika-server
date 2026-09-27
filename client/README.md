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
bindings under **User management**. Invitations default to global Viewer.
Updates send `expected_version` to `/tenant/members/{id}/bindings`; a conflict
keeps the editor open and asks the operator to reopen refreshed bindings. Changing
your own bindings refreshes authentication immediately.

**Projects** supports creation (admin), renaming and membership changes (admin or
the corresponding project lead). Membership does **not** grant access or role
bindings. Leads use a minimal organization member picker without gaining access
to the administration directory. The page contains project details and membership
only, without web-session or cloud-provider assignment panels or requests.
Web and Cloud project pickers sit in their existing header rows. Project name and
membership are separate API updates; errors explain
that an earlier update may already have succeeded.

Project, member and role choices use `WorkspaceSelect`: a searchable custom
listbox with keyboard navigation, Escape dismissal and focus restoration.
Its popover stays inside the viewport and above modal content. Directory search,
human-readable role labels and explicit empty states keep raw IDs out of the UI.
These presentation changes do not change API authorization.

## Targeted validation

```sh
npx tsc --noEmit --incremental false
npx eslint src/lib/access.ts src/components/dashboard/RoleBindingsEditor.tsx tests/scoped-access.spec.ts
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3108 npx playwright test tests/scoped-access.spec.ts tests/dashboard-sessions.spec.ts tests/chat-recent-list.spec.ts
```

Run the UI at the specified URL before the Playwright command. The mocked suite
covers scope matching, canonical/legacy roles, no-access and cloud-only navigation,
read-only viewer controls, binding edits/conflicts, invitation defaults, self-role
refresh, project membership and project-scoped session creation. It does not
replace server authorization tests.
