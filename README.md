# lizard-dashboard

The dashboard reads saved Lizard app data from the same browser and origin.

Use **Cards** to show, hide and reorder the four cards. The arrow buttons work
with a keyboard or on a phone. Card choices and order are remembered locally.

Use **Backup & restore** in Cards or the footer to download a JSON snapshot.
Choose a dashboard backup to preview the apps it contains, select which apps
to restore, and press **Restore selected apps**. Selected apps' included storage
entries replace current values; unchecked apps and unrelated site data are left
alone. Reload other open Lizard app tabs after restoring.

Backups include saved dashboard preferences, To Do tasks and settings, Time Until
events and clock color, the quiz library/settings/history, Weather's location,
Format v1/v2 workspaces, Compare's workspace and Delim's input/settings. Unsaved
edits and Format v2's large-file sessions are not stored by those apps. Mock,
Duplicate and DateTime currently have no saved workspace to include.

The backup is a local download and is not uploaded by the dashboard. It contains
the saved inputs and other app data you choose to keep in your browser.

## Development

No dependencies are required. Run node --check dashboard.js, then
node --test tests/*.test.mjs, then node scripts/build-pages.mjs.

The build writes dist/, stamps HTML and JavaScript import URLs with the release
time in YYYYMMDD-HHMM Eastern time, and preserves the source's development
markers. GitHub Actions runs the checks and publishes dist/ to GitHub Pages.

## Backup format maintenance

backup.mjs contains the audited storage keys, readers' shape requirements,
preview summaries and restore logic. Keep these contracts in sync when an app
changes how it stores data. Exported values retain their original strings,
including fields the dashboard does not display. A null value explicitly means
a key was absent in the saved snapshot; an omitted key is not changed on restore.

Only catalogued keys are included or accepted. An unknown app/key, unsupported
schema or invalid app value rejects the file before writing. A restore checks
that selected data has not changed since preview, and rolls back completed
writes if saving fails. If browser storage also prevents rollback, the dialog
offers a recovery download of the selected apps' previous values.
