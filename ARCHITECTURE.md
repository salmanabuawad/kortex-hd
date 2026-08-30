# Architecture decisions

## Access model
- `user`: can log in, create tickets, see only their own tickets, comment, reopen resolved/rejected tickets.
- `resolver`: sees tickets assigned to them plus tickets they requested. Can update, transfer and create subtasks.
- `approver`: can decide approvals assigned to them.
- `admin`: full operational access.

## Ticket state machine
`new -> assigned -> viewed -> in_progress -> resolved|rejected`

Requester may move `resolved|rejected -> reopened`. A resolver transfer always moves the ticket to `assigned` so the new resolver has a clean acknowledgement/view event.

## External subtask security
- One cryptographically random token per external subtask.
- Token endpoint reveals only subtask data plus minimal parent-ticket context.
- No parent internal notes, approval details, user directory or other subtasks are exposed.
- Token remains usable while status is `open` or `in_progress`.
- Token immediately becomes invalid when status is `resolved` or `closed`.
- All external changes are written to the parent ticket audit log.

## Approval rules
Category UI/data contains:
- cost threshold
- work-hours threshold
- whether new service requires approval
- escalation/approver person

Creating a ticket evaluates these rules and creates one pending approval record with the triggering reasons.

## Notifications
The rebuild includes the data model and delivery-channel selection. Actual email/SMS/WhatsApp provider adapters should be added behind a notification service. Do not call providers directly from ticket routes in production.
