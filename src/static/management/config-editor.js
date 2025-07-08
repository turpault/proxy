// Configuration Editor Functions

// Global variables for real-time validation
let validationTimeouts = {};
let currentConfigContent = {};

function switchConfigTab(type) {
  document.querySelectorAll('.config-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.config-tab-content').forEach(content => content.classList.remove('active'));

  document.getElementById(`config-tab-${type}`).classList.add('active');
  document.getElementById(`config-content-${type}`).classList.add('active');

  // Update the global currentConfigType variable
  if (typeof currentConfigType !== 'undefined') {
    currentConfigType = type;
  }
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

      if (editor) {
        editor.value = data.data.content;
        currentConfigContent[type] = data.data.content;

        // Set up real-time validation
        setupRealTimeValidation(type, editor);

        // Perform initial validation
        validateYAMLContent(type, data.data.content);
      }
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

// Real-time YAML validation functions
function setupRealTimeValidation(type, editor) {
  // Remove existing event listeners to avoid duplicates
  editor.removeEventListener('input', editor._validationHandler);

  // Create debounced validation handler
  editor._validationHandler = debounce((content) => {
    validateYAMLContent(type, content);
  }, 500); // 500ms debounce

  // Add input event listener
  editor.addEventListener('input', (e) => {
    const content = e.target.value;
    currentConfigContent[type] = content;
    editor._validationHandler(content);
  });
}

// Line highlighting functions
function highlightErrorLine(editor, lineNumber) {
  // Remove any existing error highlighting
  clearErrorHighlighting(editor);

  if (!lineNumber || lineNumber < 1) return;

  const lines = editor.value.split('\n');
  if (lineNumber > lines.length) return;

  // Create a simple overlay for line highlighting
  const overlay = document.createElement('div');
  overlay.className = 'error-line-overlay';
  overlay.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    z-index: 10;
    font-family: 'Courier New', monospace;
    font-size: 0.9rem;
    line-height: 1.5;
    padding: 1rem;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow: hidden;
    background: transparent;
  `;

  // Calculate line height and position
  const lineHeight = 1.5 * 0.9; // line-height * font-size in rem
  const lineHeightPx = lineHeight * 16; // Convert to pixels
  const paddingTop = 16; // 1rem in pixels

  // Calculate the position of the error line
  const errorLineTop = paddingTop + (lineNumber - 1) * lineHeightPx;

  // Create the error line indicator
  const errorIndicator = document.createElement('div');
  errorIndicator.className = 'error-line-indicator';
  errorIndicator.style.cssText = `
    position: absolute;
    top: ${errorLineTop}px;
    left: 0;
    right: 0;
    height: ${lineHeightPx}px;
    background-color: #fed7d7;
    border-left: 3px solid #e53e3e;
    pointer-events: none;
    z-index: 11;
  `;

  // Add warning icon
  const warningIcon = document.createElement('span');
  warningIcon.textContent = '⚠';
  warningIcon.style.cssText = `
    position: absolute;
    left: -25px;
    top: 0;
    color: #e53e3e;
    font-weight: bold;
    font-size: 0.8rem;
    line-height: ${lineHeightPx}px;
    width: 20px;
    text-align: center;
  `;

  errorIndicator.appendChild(warningIcon);
  overlay.appendChild(errorIndicator);

  // Add the overlay to the editor container
  const container = editor.parentNode;
  container.style.position = 'relative';
  container.appendChild(overlay);

  // Store reference for cleanup
  editor._errorOverlay = overlay;

  // Scroll to the error line
  const errorLineElement = editor;
  const scrollTop = errorLineTop - container.offsetHeight / 2;
  editor.scrollTop = Math.max(0, scrollTop);
}

function clearErrorHighlighting(editor) {
  if (editor._errorOverlay) {
    editor._errorOverlay.remove();
    delete editor._errorOverlay;
  }
}

function debounce(func, wait) {
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(validationTimeouts[args[0]]);
      func(...args);
    };
    clearTimeout(validationTimeouts[args[0]]);
    validationTimeouts[args[0]] = setTimeout(later, wait);
  };
}

async function validateYAMLContent(type, content) {
  const validation = document.getElementById(`${type}-config-validation`);
  const editor = document.getElementById(`${type}-config-editor`);
  const statusIndicator = document.getElementById(`${type}-validation-status`);

  if (!validation) return;

  // Don't validate empty content
  if (!content || content.trim() === '') {
    validation.textContent = 'Enter YAML content to validate';
    validation.className = 'validation-message warning';
    updateValidationStatus(type, 'none');
    // Clear any error highlighting when content is empty
    if (editor) {
      clearErrorHighlighting(editor);
    }
    return;
  }

  try {
    // Show loading state
    validation.textContent = 'Validating...';
    validation.className = 'validation-message warning';
    updateValidationStatus(type, 'validating');
    // Clear any error highlighting when starting validation
    if (editor) {
      clearErrorHighlighting(editor);
    }

    const response = await fetch(`/api/config/${type}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });

    const data = await response.json();

    if (data.success) {
      validation.textContent = '✅ YAML is valid';
      validation.className = 'validation-message success';
      updateValidationStatus(type, 'valid');
      // Clear any error highlighting when validation passes
      if (editor) {
        clearErrorHighlighting(editor);
      }
    } else {
      // Format error message for display
      let errorMessage = data.error || 'Validation failed';

      if (data.line) {
        errorMessage = `Line ${data.line}: ${errorMessage}`;
        // Highlight the error line
        if (editor) {
          highlightErrorLine(editor, data.line);
        }
      }

      if (data.details) {
        errorMessage += `\n\n${data.details}`;
      }

      if (data.suggestions && data.suggestions.length > 0) {
        errorMessage += `\n\nSuggestions:\n${data.suggestions.map(s => `• ${s}`).join('\n')}`;
      }

      validation.textContent = errorMessage;
      validation.className = 'validation-message error';
      updateValidationStatus(type, 'invalid');
    }
  } catch (error) {
    console.error(`Failed to validate ${type} configuration:`, error);
    validation.textContent = `Validation error: ${error.message}`;
    validation.className = 'validation-message error';
    updateValidationStatus(type, 'invalid');
  }
}

function updateValidationStatus(type, status) {
  const editor = document.getElementById(`${type}-config-editor`);
  const statusIndicator = document.getElementById(`${type}-validation-status`);

  if (editor) {
    editor.classList.remove('validating', 'valid', 'invalid');
    if (status !== 'none') {
      editor.classList.add(status);
    }
  }

  if (statusIndicator) {
    statusIndicator.className = 'validation-status';
    if (status !== 'none') {
      statusIndicator.classList.add(status);
    }
  }
}

// Close modal when clicking outside
window.onclick = function (event) {
  const modal = document.getElementById('backup-modal');
  if (event.target === modal) {
    closeBackupModal();
  }
}

// Note: showTab override is handled in the main HTML file
// This ensures proper loading order and avoids reference errors 