let isCodeMode = false;
let codeMirrorInstance = null;
let currentTheme = 'light';
let autoSaveTimeout = null;
let tabs = [{ id: 0, name: 'Tab 1', content: '', font: "'Segoe UI', Arial, sans-serif", isCodeMode: false }];
let activeTabId = 0;
let nextTabId = 1;
let isLocked = false;
let passwordHash = null;
let isDataLoaded = false; // Guard against overwriting data before load

// Initialize
let tabHistory = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Always setup global listeners first (lock screen, etc.)
    setupGlobalListeners();

    await checkLockStatus();

    if (!isLocked) {
        initializeEditor();
    }
});

function initializeEditor() {
    loadSavedData();
    setupEditorListeners();
    updateWordCount();
}

async function checkLockStatus() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['passwordHash', 'isLocked'], (result) => {
            passwordHash = result.passwordHash || null;
            isLocked = result.isLocked || false;

            if (isLocked && passwordHash) {
                showLockedScreen();
                // Ensure app container is hidden
                document.getElementById('app-container').style.display = 'none';
            } else {
                // Unlock and show app container
                document.getElementById('app-container').style.display = 'flex';
            }
            resolve();
        });
    });
}

function setupGlobalListeners() {
    // Lock/Unlock Logic
    document.getElementById('lock-btn').addEventListener('click', tryLockEditor);
    document.getElementById('set-password-btn').addEventListener('click', setPassword);
    document.getElementById('remove-password-btn').addEventListener('click', removePassword);
    document.getElementById('unlock-btn').addEventListener('click', unlockFromModal);
    document.getElementById('cancel-lock').addEventListener('click', hideLockModal);
    document.getElementById('locked-unlock-btn').addEventListener('click', unlockFromLockedScreen);

    // Enter Key Support for Password Inputs
    const addEnterKey = (id, btnId) => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    document.getElementById(btnId).click();
                }
            });
        }
    };

    addEnterKey('password-confirm', 'set-password-btn');
    addEnterKey('unlock-input', 'unlock-btn');
    addEnterKey('locked-password-input', 'locked-unlock-btn');

    // Persistence Handlers - Save data when popup is about to close
    window.addEventListener('blur', () => {
        if (!isLocked) {
            updateActiveTabContent();
            const data = {
                tabs: tabs,
                activeTabId: activeTabId,
                theme: currentTheme,
                timestamp: new Date().toISOString()
            };
            chrome.storage.local.set({ editorData: data });
        }
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && !isLocked) {
            updateActiveTabContent();
            const data = {
                tabs: tabs,
                activeTabId: activeTabId,
                theme: currentTheme,
                timestamp: new Date().toISOString()
            };
            chrome.storage.local.set({ editorData: data });
        }
    });
    // Save before page unload (if possible)
    window.addEventListener('beforeunload', () => {
        if (!isLocked) {
            updateActiveTabContent();
            // Use synchronous storage for critical saves
            const data = {
                tabs: tabs,
                activeTabId: activeTabId,
                theme: currentTheme,
                timestamp: new Date().toISOString()
            };
            chrome.storage.local.set({ editorData: data });
        }
    });
}

function setupEditorListeners() {
    // Prevent duplicate listeners
    if (document.body.dataset.listenersAttached) return;
    document.body.dataset.listenersAttached = 'true';

    // Formatting buttons
    document.getElementById('bold-btn').addEventListener('click', () => formatText('bold'));
    document.getElementById('italic-btn').addEventListener('click', () => formatText('italic'));
    document.getElementById('underline-btn').addEventListener('click', () => formatText('underline'));
    document.getElementById('bullet-btn').addEventListener('click', () => formatText('bullet'));
    document.getElementById('number-btn').addEventListener('click', () => formatText('number'));

    // Font selection
    document.getElementById('font-select').addEventListener('change', (e) => {
        document.getElementById('text-editor').style.fontFamily = e.target.value;
        updateActiveTabContent();
        autoSave();
    });

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Mode toggle
    document.getElementById('mode-toggle').addEventListener('click', toggleEditorMode);

    // Download
    document.getElementById('download-btn').addEventListener('click', showDownloadModal);
    document.getElementById('confirm-download').addEventListener('click', downloadFile);
    document.getElementById('cancel-download').addEventListener('click', hideDownloadModal);

    // Cloud storage
    document.getElementById('cloud-btn').addEventListener('click', showCloudModal);
    document.getElementById('save-github').addEventListener('click', saveToGitHub);
    document.getElementById('save-pastebin').addEventListener('click', saveToPastebin);
    document.getElementById('save-github-token').addEventListener('click', saveGitHubToken);
    document.getElementById('copy-url').addEventListener('click', copyCloudUrl);
    document.getElementById('open-url').addEventListener('click', openCloudUrl);
    document.getElementById('cancel-cloud').addEventListener('click', hideCloudModal);

    // Tabs
    document.getElementById('new-tab-btn').addEventListener('click', createNewTab);
    document.addEventListener('click', (e) => {
        if (e.target.closest('.tab')) {
            const tab = e.target.closest('.tab');
            if (e.target.classList.contains('tab-close')) {
                closeTab(parseInt(tab.dataset.tabId));
            } else {
                switchTab(parseInt(tab.dataset.tabId));
            }
        }
    });

    // Text editor changes
    document.getElementById('text-editor').addEventListener('input', () => {
        updateWordCount();
        autoSave();
    });

    // Keydown handler (Undo, Shortcuts)
    document.addEventListener('keydown', handleGlobalKeydown);
    document.getElementById('text-editor').addEventListener('keydown', handleEditorKeydown);
}

function handleGlobalKeydown(e) {
    // Handle App Level Undo (Ctrl+Shift+Z or Ctrl+Z)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        // Simple Ctrl+Z
        // If we are NOT in an editor, or if editor is default textarea with no value?
        // Actually, user requested Ctrl+Z to undo tab close.
        // We will prioritize Tab Undo if the Focus is NOT in the Text Editor.
        // OR: We try to be smart.
        if (document.activeElement.id !== 'text-editor' && !document.activeElement.classList.contains('CodeMirror-textarea')) {
            // Check History
            if (tabHistory.length > 0) {
                e.preventDefault();
                restoreLastClosedTab();
                return;
            }
        }
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        // Explicit Ctrl+Shift+Z for Tab Restore
        if (tabHistory.length > 0) {
            e.preventDefault();
            restoreLastClosedTab();
        }
    }
}

function formatText(command) {
    const editor = document.getElementById('text-editor');
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedText = editor.value.substring(start, end);

    let formattedText = selectedText;
    const before = editor.value.substring(0, start);
    const after = editor.value.substring(end);

    // Handle list formatting
    if (command === 'bullet' || command === 'number') {
        const lines = selectedText ? selectedText.split('\n') : [''];
        if (command === 'bullet') {
            formattedText = lines.map(line => line.trim() ? `• ${line.trim()}` : line).join('\n');
        } else if (command === 'number') {
            formattedText = lines.map((line, i) => line.trim() ? `${i + 1}. ${line.trim()}` : line).join('\n');
        }
    } else if (selectedText) {
        // Simple markdown-style formatting
        switch (command) {
            case 'bold':
                formattedText = `**${selectedText}**`;
                break;
            case 'italic':
                formattedText = `*${selectedText}*`;
                break;
            case 'underline':
                formattedText = `__${selectedText}__`;
                break;
        }
    }

    editor.value = before + formattedText + after;
    editor.selectionStart = start;
    editor.selectionEnd = start + formattedText.length;
    editor.focus();
    autoSave();
}

function handleEditorKeydown(e) {
    // Handle keyboard shortcuts
    if (e.ctrlKey || e.metaKey) {
        // If it is 'z', allow bubble to global unless handled?
        // Note: CodeMirror handles its own events, this listener is for textarea.

        switch (e.key.toLowerCase()) {
            case 'b':
                e.preventDefault();
                formatText('bold');
                break;
            case 'i':
                e.preventDefault();
                formatText('italic');
                break;
            case 'u':
                e.preventDefault();
                formatText('underline');
                break;
            case 's':
                e.preventDefault();
                autoSave();
                showSaveIndicator();
                break;
            // We do NOT intercept 'z' here, letting it bubble or browser handle text undo.
        }
        return;
    }

    // Auto-continue numbered lists on Enter
    if (e.key === 'Enter') {
        const editor = document.getElementById('text-editor');
        const cursorPos = editor.selectionStart;
        const textBeforeCursor = editor.value.substring(0, cursorPos);
        const currentLine = textBeforeCursor.split('\n').pop();

        // Check if current line starts with a number
        const numberMatch = currentLine.match(/^(\d+)\.\s/);
        if (numberMatch) {
            e.preventDefault();
            const nextNumber = parseInt(numberMatch[1]) + 1;
            const textAfter = editor.value.substring(cursorPos);
            editor.value = textBeforeCursor + '\n' + nextNumber + '. ' + textAfter;
            editor.selectionStart = editor.selectionEnd = cursorPos + nextNumber.toString().length + 3;
            autoSave();
        }
    }
}

function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.body.className = `${currentTheme}-mode`;

    if (codeMirrorInstance) {
        codeMirrorInstance.setOption('theme', currentTheme === 'dark' ? 'monokai' : 'default');
    }

    saveSettings();
}

function toggleEditorMode() {
    isCodeMode = !isCodeMode;
    const modeBtn = document.getElementById('mode-toggle');
    const textEditor = document.getElementById('text-editor');

    if (isCodeMode) {
        modeBtn.textContent = '💻';
        modeBtn.classList.add('active');

        // Add code styling to textarea
        textEditor.classList.add('code-mode');

        // Initialize CodeMirror with Ubuntu terminal theme
        if (!codeMirrorInstance) {
            codeMirrorInstance = CodeMirror.fromTextArea(textEditor, {
                lineNumbers: true,
                mode: 'javascript',
                theme: 'monokai',
                indentUnit: 2,
                tabSize: 2,
                lineWrapping: true
            });

            // Apply Ubuntu terminal styling
            codeMirrorInstance.getWrapperElement().style.background = '#300a24';
            codeMirrorInstance.getWrapperElement().style.fontFamily = "'Ubuntu Mono', 'Consolas', 'Monaco', monospace";

            codeMirrorInstance.on('change', () => {
                updateWordCount();
                autoSave();
            });
        }

        codeMirrorInstance.getWrapperElement().style.display = 'block';
        textEditor.style.display = 'none';

        // Focus CodeMirror
        codeMirrorInstance.focus();

    } else {
        modeBtn.textContent = '📝';
        modeBtn.classList.remove('active');

        // Remove code styling
        textEditor.classList.remove('code-mode');

        if (codeMirrorInstance) {
            textEditor.value = codeMirrorInstance.getValue();
            codeMirrorInstance.getWrapperElement().style.display = 'none';
            textEditor.style.display = 'block';
        }
        textEditor.focus();
    }

    updateActiveTabContent();
    saveSettings();
}

function updateWordCount() {
    let text = '';
    if (isCodeMode && codeMirrorInstance) {
        text = codeMirrorInstance.getValue();
    } else {
        text = document.getElementById('text-editor').value;
    }

    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;

    document.getElementById('word-count').textContent = `Words: ${words} | Characters: ${chars}`;
}

function autoSave() {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        // Always update content first
        updateActiveTabContent();
        // Save immediately
        if (!isLocked && isDataLoaded) {
            saveToStorage();
        } else if (isDataLoaded) {
            // Even if locked, we should save (but this shouldn't happen in normal flow)
            forceSaveToStorage();
        }
        showSaveIndicator();
    }, 500); // Reduced timeout for faster saves
}

// Force save function - saves regardless of lock status (used when locking)
function forceSaveToStorage() {
    // Always update content first, even if not loaded yet
    updateActiveTabContent();
    
    const data = {
        tabs: tabs,
        activeTabId: activeTabId,
        theme: currentTheme,
        timestamp: new Date().toISOString()
    };

    // Save immediately - don't wait for isDataLoaded when locking
    chrome.storage.local.set({ editorData: data }, () => {
        console.log('Data saved successfully', data);
        isDataLoaded = true; // Mark as loaded after successful save
    });
}

function saveToStorage() {
    // Critical: Do NOT save if we haven't loaded data yet (prevents overwriting with empty)
    if (!isDataLoaded) return;
    // Critical: Do not save if locked (prevents overwriting with hidden/empty state)
    if (isLocked) return;

    updateActiveTabContent();
    const data = {
        tabs: tabs,
        activeTabId: activeTabId,
        theme: currentTheme,
        timestamp: new Date().toISOString()
    };

    chrome.storage.local.set({ editorData: data });
}

function loadSavedData() {
    chrome.storage.local.get(['editorData'], (result) => {
        console.log('Loading saved data:', result);
        isDataLoaded = true; // Allow saving from now on
        
        if (result.editorData) {
            const data = result.editorData;
            console.log('Found saved data:', data);

            if (data.tabs && data.tabs.length > 0) {
                // Restore tabs from saved data
                tabs = data.tabs.map(tab => ({
                    ...tab,
                    content: tab.content || '' // Ensure content is never undefined
                }));
                activeTabId = data.activeTabId !== undefined ? data.activeTabId : tabs[0].id;
                nextTabId = Math.max(...tabs.map(t => t.id), 0) + 1;
                
                console.log('Restored tabs:', tabs);
                console.log('Active tab ID:', activeTabId);
                
                renderTabs();
                switchTab(activeTabId);
            } else {
                // If no tabs in saved data, keep existing tabs or create default
                if (tabs.length === 0) {
                    tabs = [{ id: 0, name: 'Tab 1', content: '', font: "'Segoe UI', Arial, sans-serif", isCodeMode: false }];
                    renderTabs();
                }
            }

            if (data.theme) {
                currentTheme = data.theme;
                document.body.className = `${currentTheme}-mode`;
            }
        } else {
            // No saved data - keep existing tabs if any, otherwise create default
            console.log('No saved data found, using default');
            if (tabs.length === 0) {
                tabs = [{ id: 0, name: 'Tab 1', content: '', font: "'Segoe UI', Arial, sans-serif", isCodeMode: false }];
                renderTabs();
            }
        }
    });
}

// Tab management functions
function createNewTab() {
    const newTab = {
        id: nextTabId++,
        name: `Tab ${nextTabId}`,
        content: '',
        font: "'Segoe UI', Arial, sans-serif",
        isCodeMode: false
    };
    tabs.push(newTab);
    renderTabs();
    switchTab(newTab.id);
    autoSave();
}

function closeTab(tabId) {
    if (tabs.length === 1) {
        alert('Cannot close the last tab!');
        return;
    }

    const tabIndex = tabs.findIndex(t => t.id === tabId);
    const tabToClose = tabs[tabIndex];

    // Push to history for Undo
    tabHistory.push({
        tab: tabToClose,
        index: tabIndex
    });

    // Limit history stack
    if (tabHistory.length > 20) tabHistory.shift();

    tabs.splice(tabIndex, 1);

    if (activeTabId === tabId) {
        activeTabId = tabs[Math.max(0, tabIndex - 1)].id;
        switchTab(activeTabId);
    }

    renderTabs();
    autoSave();
}

function restoreLastClosedTab() {
    if (tabHistory.length === 0) return;

    const lastClosed = tabHistory.pop();
    const tab = lastClosed.tab;
    const index = Math.min(lastClosed.index, tabs.length);

    // Restore tab
    tabs.splice(index, 0, tab);

    renderTabs();
    switchTab(tab.id);
    autoSave();
}

function switchTab(tabId) {
    // Save current tab content before switching
    updateActiveTabContent();
    // Save immediately when switching tabs
    if (isDataLoaded && !isLocked) {
        forceSaveToStorage();
    }
    
    activeTabId = tabId;
    const tab = tabs.find(t => t.id === tabId);

    if (!tab) return;

    const textEditor = document.getElementById('text-editor');
    textEditor.value = tab.content || '';
    textEditor.style.fontFamily = tab.font;
    document.getElementById('font-select').value = tab.font;

    // Update CodeMirror if in code mode
    if (isCodeMode && codeMirrorInstance) {
        codeMirrorInstance.setValue(tab.content || '');
    }

    if (tab.isCodeMode !== isCodeMode) {
        toggleEditorMode();
    }

    renderTabs();
    updateWordCount();
}

function updateActiveTabContent() {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) {
        // If tab doesn't exist, create it
        if (tabs.length === 0) {
            tabs.push({ id: 0, name: 'Tab 1', content: '', font: "'Segoe UI', Arial, sans-serif", isCodeMode: false });
            activeTabId = 0;
        }
        return;
    }

    // Get content from editor (CodeMirror or textarea)
    let content = '';
    if (isCodeMode && codeMirrorInstance) {
        content = codeMirrorInstance.getValue() || '';
    } else {
        const textEditor = document.getElementById('text-editor');
        content = textEditor ? (textEditor.value || '') : '';
    }
    
    tab.content = content;
    const fontSelect = document.getElementById('font-select');
    tab.font = fontSelect ? fontSelect.value : "'Segoe UI', Arial, sans-serif";
    tab.isCodeMode = isCodeMode;
}

function renderTabs() {
    const container = document.querySelector('.tabs-container');
    const existingTabs = container.querySelectorAll('.tab');
    existingTabs.forEach(t => t.remove());

    tabs.forEach(tab => {
        const tabEl = document.createElement('div');
        tabEl.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
        tabEl.dataset.tabId = tab.id;
        tabEl.innerHTML = `
      <span class="tab-name">${tab.name}</span>
      <span class="tab-close">×</span>
    `;
        container.insertBefore(tabEl, document.getElementById('new-tab-btn'));
    });
}

function saveSettings() {
    const settings = {
        theme: currentTheme,
        isCodeMode: isCodeMode
    };
    chrome.storage.local.set({ editorSettings: settings });
}

function showSaveIndicator() {
    const indicator = document.getElementById('save-indicator');
    indicator.classList.add('show');
    setTimeout(() => {
        indicator.classList.remove('show');
    }, 2000);
}

// Download functionality
function showDownloadModal() {
    document.getElementById('download-modal').classList.add('show');
    document.getElementById('filename-input').value = `document_${Date.now()}`;
}

function hideDownloadModal() {
    document.getElementById('download-modal').classList.remove('show');
}

function downloadFile() {
    const format = document.getElementById('format-select').value;
    const filename = document.getElementById('filename-input').value || 'document';

    // Get content from active tab only
    const activeTab = tabs.find(t => t.id === activeTabId);
    const content = activeTab ? activeTab.content : '';

    if (format === 'pdf') {
        generatePDF(content, filename);
        hideDownloadModal();
        return;
    }

    let blob, finalFilename;

    switch (format) {
        case 'txt':
            blob = new Blob([content], { type: 'text/plain' });
            finalFilename = `${filename}.txt`;
            break;

        case 'html':
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${filename}</title>
  <style>
    body { font-family: ${document.getElementById('font-select').value}; padding: 20px; line-height: 1.6; }
  </style>
</head>
<body>
  <pre>${content}</pre>
</body>
</html>`;
            blob = new Blob([htmlContent], { type: 'text/html' });
            finalFilename = `${filename}.html`;
            break;

        case 'md':
            blob = new Blob([content], { type: 'text/markdown' });
            finalFilename = `${filename}.md`;
            break;

        case 'rtf':
            const rtfContent = `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}\\f0\\fs24 ${content.replace(/\n/g, '\\par ')}}`;
            blob = new Blob([rtfContent], { type: 'application/rtf' });
            finalFilename = `${filename}.rtf`;
            break;
    }

    // Create download link and trigger it
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = finalFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    hideDownloadModal();
}

function generatePDF(content, filename) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const lines = doc.splitTextToSize(content, 180);
    doc.text(lines, 15, 15);

    doc.save(`${filename}.pdf`);
}

// Cloud storage functionality
function showCloudModal() {
    document.getElementById('cloud-modal').classList.add('show');
    document.getElementById('cloud-result').style.display = 'none';
    document.getElementById('github-setup').style.display = 'none';
}

function hideCloudModal() {
    document.getElementById('cloud-modal').classList.remove('show');
    document.getElementById('cloud-result').style.display = 'none';
    document.getElementById('github-setup').style.display = 'none';
}

function saveGitHubToken() {
    const token = document.getElementById('github-token').value.trim();
    if (!token) {
        alert('Please enter a valid GitHub token');
        return;
    }

    // Encrypt the token before saving
    const encrypted = CryptoJS.AES.encrypt(token, 'cloudwrite-secure-key-2024').toString();

    chrome.storage.local.set({ githubToken: encrypted }, () => {
        alert('✅ Token saved securely! Now you can save to GitHub Gist.');
        document.getElementById('github-setup').style.display = 'none';
        document.getElementById('github-token').value = '';
    });
}

async function saveToGitHub() {
    updateActiveTabContent();
    const activeTab = tabs.find(t => t.id === activeTabId);
    const content = activeTab ? activeTab.content : '';
    const filename = `CloudWrite_${new Date().toISOString().slice(0, 10)}.txt`;

    // Check if token exists
    chrome.storage.local.get(['githubToken'], async (result) => {
        if (!result.githubToken) {
            document.getElementById('github-setup').style.display = 'block';
            return;
        }

        // Decrypt the token
        const decrypted = CryptoJS.AES.decrypt(result.githubToken, 'cloudwrite-secure-key-2024').toString(CryptoJS.enc.Utf8);

        try {
            const response = await fetch('https://api.github.com/gists', {
                method: 'POST',
                headers: {
                    'Authorization': `token ${decrypted}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    description: 'CloudWrite Editor Document',
                    public: false,
                    files: {
                        [filename]: {
                            content: content
                        }
                    }
                })
            });

            if (!response.ok) {
                throw new Error('Failed to create gist. Please check your token.');
            }

            const data = await response.json();
            showCloudResult(data.html_url);
        } catch (error) {
            alert('❌ Error: ' + error.message + '\n\nPlease check your GitHub token.');
            document.getElementById('github-setup').style.display = 'block';
        }
    });
}

async function saveToPastebin() {
    updateActiveTabContent();
    const activeTab = tabs.find(t => t.id === activeTabId);
    const content = activeTab ? activeTab.content : '';
    const filename = `CloudWrite_${new Date().toISOString().slice(0, 10)}`;

    try {
        // Using dpaste.com (no API key needed, free service)
        const formData = new FormData();
        formData.append('content', content);
        formData.append('title', filename);
        formData.append('syntax', 'text');
        formData.append('expiry_days', '365');

        const response = await fetch('https://dpaste.com/api/', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to save to Pastebin');
        }

        const url = await response.text();
        showCloudResult(url.trim());
    } catch (error) {
        alert('❌ Error saving to Pastebin: ' + error.message);
    }
}

function showCloudResult(url) {
    document.getElementById('cloud-result').style.display = 'block';
    document.getElementById('cloud-url').value = url;
    document.getElementById('github-setup').style.display = 'none';
}

function copyCloudUrl() {
    const urlInput = document.getElementById('cloud-url');
    urlInput.select();
    document.execCommand('copy');
    alert('✅ Link copied to clipboard!');
}

function openCloudUrl() {
    const url = document.getElementById('cloud-url').value;
    if (url) {
        window.open(url, '_blank');
    }
}

// Security / Lock Functions
function showLockModal() {
    document.getElementById('lock-modal').classList.add('show');

    if (passwordHash) {
        document.getElementById('lock-modal-title').textContent = '🔒 Lock Editor';
        document.getElementById('lock-setup').style.display = 'none';
        document.getElementById('lock-unlock').style.display = 'block';
        document.getElementById('remove-password-btn').style.display = 'block';

        setTimeout(() => document.getElementById('unlock-input').focus(), 100);
    } else {
        document.getElementById('lock-modal-title').textContent = '🔒 Set Password Protection';
        document.getElementById('lock-setup').style.display = 'block';
        document.getElementById('lock-unlock').style.display = 'none';
        document.getElementById('remove-password-btn').style.display = 'none';

        setTimeout(() => document.getElementById('password-input').focus(), 100);
    }
}

function hideLockModal() {
    document.getElementById('lock-modal').classList.remove('show');
    document.getElementById('password-input').value = '';
    document.getElementById('password-confirm').value = '';
    document.getElementById('unlock-input').value = '';
}

function setPassword() {
    const password = document.getElementById('password-input').value;
    const confirm = document.getElementById('password-confirm').value;

    if (!password || password.length < 4) {
        alert('⚠️ Password must be at least 4 characters long!');
        return;
    }

    if (password !== confirm) {
        alert('⚠️ Passwords do not match!');
        return;
    }

    // Hash the password
    passwordHash = CryptoJS.SHA256(password).toString();

    chrome.storage.local.set({ passwordHash: passwordHash, isLocked: false }, () => {
        alert('✅ Password protection enabled!\n\nClick the 🔒 button to lock your editor.');
        hideLockModal();
        updateLockButton();
    });
}

function removePassword() {
    const password = document.getElementById('unlock-input').value;

    if (!password) {
        alert('⚠️ Please enter your password to remove protection!');
        return;
    }

    const hash = CryptoJS.SHA256(password).toString();

    if (hash !== passwordHash) {
        alert('❌ Wrong password!');
        return;
    }

    chrome.storage.local.remove(['passwordHash', 'isLocked'], () => {
        passwordHash = null;
        isLocked = false;
        alert('✅ Password protection removed!');
        hideLockModal();
        updateLockButton();
    });
}

function unlockFromModal() {
    const password = document.getElementById('unlock-input').value;

    if (!password) {
        alert('⚠️ Please enter a password!');
        return;
    }

    const hash = CryptoJS.SHA256(password).toString();

    if (hash === passwordHash) {
        // Lock the editor - Save data BEFORE setting isLocked
        // Clear any pending autosave
        clearTimeout(autoSaveTimeout);
        // Update content immediately - get current content from editor
        updateActiveTabContent();
        
        // Prepare data to save
        const data = {
            tabs: tabs,
            activeTabId: activeTabId,
            theme: currentTheme,
            timestamp: new Date().toISOString()
        };
        
        // Save immediately with callback to ensure it completes
        chrome.storage.local.set({ editorData: data }, () => {
            console.log('Data saved before locking:', data);
            // Now set locked state after save completes
            isLocked = true;
            chrome.storage.local.set({ isLocked: true }, () => {
                document.getElementById('app-container').style.display = 'none';
                showLockedScreen();
                hideLockModal();
                updateLockButton();
            });
        });
    } else {
        alert('❌ Wrong password!');
    }
}

// New Direct Lock Function
function tryLockEditor() {
    if (passwordHash) {
        // Direct Lock - Save data BEFORE setting isLocked
        // Clear any pending autosave
        clearTimeout(autoSaveTimeout);
        // Update content immediately - get current content from editor
        updateActiveTabContent();
        
        // Prepare data to save
        const data = {
            tabs: tabs,
            activeTabId: activeTabId,
            theme: currentTheme,
            timestamp: new Date().toISOString()
        };
        
        // Save immediately with callback to ensure it completes
        chrome.storage.local.set({ editorData: data }, () => {
            console.log('Data saved before locking:', data);
            // Now set locked state after save completes
            isLocked = true;
            chrome.storage.local.set({ isLocked: true }, () => {
                document.getElementById('app-container').style.display = 'none';
                showLockedScreen();
                updateLockButton();
            });
        });
    } else {
        // Show Setup Helper
        showLockModal();
    }
}

function unlockFromLockedScreen() {
    const password = document.getElementById('locked-password-input').value;

    if (!password) {
        alert('⚠️ Please enter your password!');
        return;
    }

    const hash = CryptoJS.SHA256(password).toString();

    if (hash === passwordHash) {
        isLocked = false;
        chrome.storage.local.set({ isLocked: false }, () => {
            // Animation Out
            const lockScreen = document.getElementById('locked-screen');
            lockScreen.classList.remove('visible');

            setTimeout(() => {
                lockScreen.style.display = 'none';
                document.getElementById('app-container').style.display = 'flex';
                // Reset isDataLoaded to false before loading to ensure fresh load
                isDataLoaded = false;
                initializeEditor(); // This will load saved data
                updateLockButton();
            }, 300); // 300ms match CSS transition
        });
    } else {
        alert('❌ Wrong password! Try again.');
        document.getElementById('locked-password-input').value = '';
    }
}

function showLockedScreen() {
    const lockScreen = document.getElementById('locked-screen');
    lockScreen.style.display = 'flex';
    // Force reflow
    void lockScreen.offsetWidth;
    lockScreen.classList.add('visible');

    // Auto-focus the input
    setTimeout(() => {
        const input = document.getElementById('locked-password-input');
        if (input) {
            input.value = ''; // Clear previous attempt
            input.focus();
        }
    }, 100);
}

function updateLockButton() {
    const lockBtn = document.getElementById('lock-btn');
    if (passwordHash && isLocked) {
        lockBtn.textContent = '🔒';
        lockBtn.title = 'Locked';
    } else if (passwordHash) {
        lockBtn.textContent = '🔓';
        lockBtn.title = 'Click to lock';
    } else {
        lockBtn.textContent = '🔒';
        lockBtn.title = 'Set password protection';
    }
}