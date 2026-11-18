import { BACKUP_APPS, MAX_BACKUP_BYTES, createBackup, parseBackup, describeApp, captureRestoreState, restoreBackup } from './backup.mjs?v=development';

export function initBackup({ onRestore }) {
  const byId = id => document.getElementById(id);
  const dialog = byId('backup-dialog');
  const status = byId('backup-status');
  const fileInput = byId('backup-file');
  const preview = byId('backup-preview');
  const choices = byId('backup-app-choices');
  const restoreButton = byId('backup-restore');
  let pending = null;
  let expected = null;
  let recovery = null;
  let fileRequest = 0;

  function message(text, isError = false) {
    status.textContent = text;
    status.classList.toggle('is-error', isError);
  }

  function download(backup, prefix = 'lizard-dashboard-backup') {
    const content = JSON.stringify(backup, null, 2) + '\n';
    const blob = new Blob([content], { type: 'application/json' });
    if (blob.size > MAX_BACKUP_BYTES) throw new Error('This backup is larger than 32 MB and cannot be restored here.');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = prefix + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function refreshInventory() {
    const inventory = byId('backup-inventory');
    inventory.replaceChildren();
    try {
      const backup = createBackup(localStorage, { origin: location.origin });
      for (const app of BACKUP_APPS) {
        const row = document.createElement('li');
        const name = document.createElement('strong');
        name.textContent = app.name;
        const detail = document.createElement('span');
        detail.textContent = describeApp(app, backup.apps[app.id]);
        row.append(name, detail);
        inventory.append(row);
      }
      byId('backup-download').disabled = !Object.keys(backup.apps).length;
    } catch {
      byId('backup-download').disabled = true;
      message('Saved data could not be read in this browser.', true);
    }
  }

  function clearPreview() {
    pending = null;
    expected = null;
    preview.hidden = true;
    choices.replaceChildren();
    restoreButton.disabled = true;
  }

  function selectedIds() {
    return [...choices.querySelectorAll('input:checked')].map(input => input.value);
  }

  document.querySelectorAll('[data-open-backup]').forEach(button => button.addEventListener('click', () => {
    if (byId('card-settings').open) byId('card-settings').close();
    message('');
    refreshInventory();
    dialog.showModal();
  }));
  byId('backup-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    fileRequest++;
    clearPreview();
    fileInput.value = '';
  });
  byId('backup-download').addEventListener('click', () => {
    try {
      const backup = createBackup(localStorage, { origin: location.origin });
      if (!Object.keys(backup.apps).length) throw new Error('No saved Lizard data is available to back up yet.');
      download(backup);
      message('Backup downloaded. Keep the file to restore your saved data later.');
      refreshInventory();
    } catch (error) {
      message(error.message || 'The backup could not be downloaded.', true);
    }
  });
  byId('backup-choose').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    const request = ++fileRequest;
    clearPreview();
    message('');
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('Choose a backup smaller than 32 MB.');
      const backup = parseBackup(await file.text());
      if (request !== fileRequest || !dialog.open) return;
      const snapshot = captureRestoreState(localStorage, backup);
      for (const app of BACKUP_APPS.filter(app => Object.hasOwn(backup.apps, app.id))) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = app.id;
        input.checked = true;
        const copy = document.createElement('span');
        const name = document.createElement('strong');
        name.textContent = app.name;
        const detail = document.createElement('small');
        const incoming = describeApp(app, backup.apps[app.id]);
        const current = Object.fromEntries(app.keys.map(key => [key, localStorage.getItem(key)]));
        detail.textContent = 'Backup: ' + incoming + '. Here: ' + describeApp(app, current) + '.';
        copy.append(name, detail);
        label.append(input, copy);
        choices.append(label);
      }
      pending = backup;
      expected = snapshot;
      const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(backup.exportedAt));
      byId('backup-file-detail').textContent = file.name + ' · Saved ' + date;
      preview.hidden = false;
      restoreButton.disabled = false;
    } catch (error) {
      if (request === fileRequest && dialog.open) message(error.message || 'This backup could not be read.', true);
    }
  });
  choices.addEventListener('change', () => { restoreButton.disabled = !pending || !selectedIds().length; });
  restoreButton.addEventListener('click', () => {
    if (!pending || !selectedIds().length) return;
    const ids = selectedIds();
    let keys;
    try {
      keys = restoreBackup(localStorage, pending, ids, expected);
    } catch (error) {
      recovery = error.recovery || null;
      byId('backup-recovery').hidden = !recovery;
      message(error.message || 'Restore could not be completed.', true);
      return;
    }
    recovery = null;
    byId('backup-recovery').hidden = true;
    clearPreview();
    refreshInventory();
    message('Restored ' + ids.length + (ids.length === 1 ? ' app.' : ' apps.') + ' Reload other open Lizard tabs to use the restored data.');
    onRestore(keys);
  });
  byId('backup-recovery').addEventListener('click', () => {
    if (!recovery) return;
    try { download(recovery, 'lizard-dashboard-recovery'); }
    catch (error) { message(error.message || 'The recovery backup could not be downloaded.', true); }
  });
}
