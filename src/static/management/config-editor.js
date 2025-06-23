// Configuration Editor Functions
let currentConfigType = 'proxy';
let currentConfigContent = '';

function switchConfigTab(type) {
  document.querySelectorAll('.config-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.config-tab-content').forEach(content => content.classList.remove('active'));

  document.getElementById(`config-tab-${type}`).classList.add('active');
  document.getElementById(`config-content-${type}`).classList.add('active');

  currentConfigType = type;
  loadConfig(type);
}

async function loadConfig(type) {
  try {
    const response = await fetch(`/api/config/${type}`);
    const data = await response.json();

    if (data.success) {
      const editor = document.getElementById(`${type}-config-editor`);
      const pathSpan = document.getElementById(`${type}-config-path`);
      const modifiedSpan = document.getElementById(`${type}-config-modified`);
      const validation = document.getElementById(`${type}-config-validation`);

      if (editor) editor.value = data.data.content;
      if (pathSpan) pathSpan.textContent = data.data.path;
      if (modifiedSpan) modifiedSpan.textContent = formatLocalTime(data.data.lastModified);
      if (validation) {
        validation.textContent = 'Configuration loaded successfully';
        validation.className = 'validation-message success';
      }
    } else {
      throw new Error(data.error || 'Failed to load configuration');
    }
  } catch (error) {
    console.error(`Failed to load ${type} configuration:`, error);
    const validation = document.getElementById(`${type}-config-validation`);
    if (validation) {
      validation.textContent = `Failed to load configuration: ${error.message}`;
      validation.className = 'validation-message error';
    }
  }
}

async function backupConfig(type) {
  try {
    const response = await fetch(`/api/config/${type}/backup`, { method: 'POST' });
    const data = await response.json();

    if (data.success) {
      showNotification('Configuration backup created successfully', 'success');
    } else {
      throw new Error(data.error || 'Failed to create backup');
    }
  } catch (error) {
    console.error(`Failed to backup ${type} configuration:`, error);
    showNotification(`Failed to create backup: ${error.message}`, 'error');
  }
}

async function saveConfig(type) {
  const editor = document.getElementById(`${type}-config-editor`);
  if (!editor) return;

  const content = editor.value;
  const createBackup = confirm('Create a backup before saving? (Recommended)');

  try {
    const response = await fetch(`/api/config/${type}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, createBackup })
    });

    const data = await response.json();

    if (data.success) {
      currentConfigContent = content;
      showNotification('Configuration saved successfully', 'success');

      const validation = document.getElementById(`${type}-config-validation`);
      if (validation) {
        validation.textContent = 'Configuration saved successfully';
        validation.className = 'validation-message success';
      }
    } else {
      throw new Error(data.error || 'Failed to save configuration');
    }
  } catch (error) {
    console.error(`Failed to save ${type} configuration:`, error);
    showNotification(`Failed to save configuration: ${error.message}`, 'error');

    const validation = document.getElementById(`${type}-config-validation`);
    if (validation) {
      validation.textContent = `Failed to save configuration: ${error.message}`;
      validation.className = 'validation-message error';
    }
  }
}

async function showBackups(type) {
  try {
    const response = await fetch(`/api/config/${type}/backups`);
    const data = await response.json();

    if (data.success) {
      const modal = document.getElementById('backup-modal');
      const backupList = document.getElementById('backup-list');

      if (backupList) {
        if (data.data.length === 0) {
          backupList.innerHTML = '<div class="loading">No backups found</div>';
        } else {
          backupList.innerHTML = data.data.map(backup => `
            <div class="backup-item">
              <div class="backup-info">
                <div class="backup-name">${backup.name}</div>
                <div class="backup-meta">
                  Size: ${formatBytes(backup.size)} | 
                  Modified: ${formatLocalTime(backup.lastModified)}
                </div>
              </div>
              <div class="backup-actions">
                <button onclick="restoreBackup('${type}', '${backup.path}')" class="btn btn-start">Restore</button>
              </div>
            </div>
          `).join('');
        }
      }

      if (modal) modal.style.display = 'block';
    } else {
      throw new Error(data.error || 'Failed to load backups');
    }
  } catch (error) {
    console.error(`Failed to load ${type} backups:`, error);
    showNotification(`Failed to load backups: ${error.message}`, 'error');
  }
}

function closeBackupModal() {
  const modal = document.getElementById('backup-modal');
  if (modal) modal.style.display = 'none';
}

async function restoreBackup(type, backupPath) {
  if (!confirm('Are you sure you want to restore this backup? This will overwrite the current configuration.')) {
    return;
  }

  try {
    const response = await fetch(`/api/config/${type}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupPath })
    });

    const data = await response.json();

    if (data.success) {
      showNotification('Configuration restored successfully', 'success');
      closeBackupModal();
      loadConfig(type);
    } else {
      throw new Error(data.error || 'Failed to restore backup');
    }
  } catch (error) {
    console.error(`Failed to restore ${type} backup:`, error);
    showNotification(`Failed to restore backup: ${error.message}`, 'error');
  }
}

// Close modal when clicking outside
window.onclick = function (event) {
  const modal = document.getElementById('backup-modal');
  if (event.target === modal) {
    closeBackupModal();
  }
}

// Override showTab function to handle config tab
const originalShowTab = showTab;
showTab = function (tab, pushState = true) {
  originalShowTab(tab, pushState);

  if (tab === 'config') {
    loadConfig(currentConfigType);
  }
}; 