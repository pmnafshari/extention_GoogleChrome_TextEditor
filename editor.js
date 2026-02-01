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

    // Persistence Handlers - ALWAYS save data when popup is about to close
    window.addEventListener('blur', () => {
        // Always save, even if locked (content might have changed before lock)
        const currentContent = getCurrentEditorContent();
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
            tab.content = currentContent;
        }
        const data = {
            tabs: tabs.map(t => ({
                id: t.id,
                name: t.name,
                content: t.id === activeTabId ? currentContent : (t.content || ''),
                font: t.font || "'Segoe UI', Arial, sans-serif",
                isCodeMode: t.isCodeMode || false
            })),
            activeTabId: activeTabId,
            theme: currentTheme,
            timestamp: new Date().toISOString()
        };
        chrome.storage.local.set({ editorData: data });
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            // Always save when hiding
            const currentContent = getCurrentEditorContent();
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab) {
                tab.content = currentContent;
            }
            const data = {
                tabs: tabs.map(t => ({
                    id: t.id,
                    name: t.name,
                    content: t.id === activeTabId ? currentContent : (t.content || ''),
                    font: t.font || "'Segoe UI', Arial, sans-serif",
                    isCodeMode: t.isCodeMode || false
                })),
                activeTabId: activeTabId,
                theme: currentTheme,
                timestamp: new Date().toISOString()
            };
            chrome.storage.local.set({ editorData: data });
        }
    });
    // Save before page unload (if possible)
    window.addEventListener('beforeunload', () => {
        // Always save on unload
        const currentContent = getCurrentEditorContent();
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
            tab.content = currentContent;
        }
        const data = {
            tabs: tabs.map(t => ({
                id: t.id,
                name: t.name,
                content: t.id === activeTabId ? currentContent : (t.content || ''),
                font: t.font || "'Segoe UI', Arial, sans-serif",
                isCodeMode: t.isCodeMode || false
            })),
            activeTabId: activeTabId,
            theme: currentTheme,
            timestamp: new Date().toISOString()
        };
        chrome.storage.local.set({ editorData: data });
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
    // Check if we're in code mode with CodeMirror
    if (isCodeMode && codeMirrorInstance) {
        // Handle CodeMirror formatting - use markdown syntax
        const selection = codeMirrorInstance.getSelection();
        const cursor = codeMirrorInstance.getCursor();
        
        if (command === 'bullet' || command === 'number') {
            const lines = selection ? selection.split('\n') : [''];
            let formattedText = '';
            if (command === 'bullet') {
                formattedText = lines.map(line => line.trim() ? `• ${line.trim()}` : line).join('\n');
            } else if (command === 'number') {
                formattedText = lines.map((line, i) => line.trim() ? `${i + 1}. ${line.trim()}` : line).join('\n');
            }
            codeMirrorInstance.replaceSelection(formattedText);
        } else {
            if (selection) {
                let formattedText = '';
                switch (command) {
                    case 'bold':
                        formattedText = `**${selection}**`;
                        break;
                    case 'italic':
                        formattedText = `*${selection}*`;
                        break;
                    case 'underline':
                        formattedText = `__${selection}__`;
                        break;
                }
                codeMirrorInstance.replaceSelection(formattedText);
            } else {
                let markers = '';
                switch (command) {
                    case 'bold':
                        markers = '****';
                        break;
                    case 'italic':
                        markers = '**';
                        break;
                    case 'underline':
                        markers = '____';
                        break;
                }
                codeMirrorInstance.replaceSelection(markers);
                if (markers.length === 4) {
                    codeMirrorInstance.setCursor({ line: cursor.line, ch: cursor.ch + 2 });
                } else if (markers.length === 2) {
                    codeMirrorInstance.setCursor({ line: cursor.line, ch: cursor.ch + 1 });
                }
            }
        }
        codeMirrorInstance.focus();
        autoSave();
        return;
    }
    
    // Handle contenteditable editor formatting using execCommand
    const editor = document.getElementById('text-editor');
    if (!editor) return;
    
    // Check if editor is contenteditable (new version) or textarea (old version)
    const isContentEditable = editor.contentEditable === 'true' || editor.hasAttribute('contenteditable');
    
    if (isContentEditable) {
        // Use execCommand for actual formatting
        editor.focus();
        
        // Handle list formatting manually
        if (command === 'bullet' || command === 'number') {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const selectedText = range.toString();
                const lines = selectedText ? selectedText.split('\n') : [''];
                
                let formattedText = '';
                if (command === 'bullet') {
                    formattedText = lines.map(line => line.trim() ? `• ${line.trim()}` : line).join('\n');
                } else if (command === 'number') {
                    formattedText = lines.map((line, i) => line.trim() ? `${i + 1}. ${line.trim()}` : line).join('\n');
                }
                
                range.deleteContents();
                range.insertNode(document.createTextNode(formattedText));
            }
        } else {
            // Use execCommand for text formatting (bold, italic, underline)
            let execCommandName = '';
            switch (command) {
                case 'bold':
                    execCommandName = 'bold';
                    break;
                case 'italic':
                    execCommandName = 'italic';
                    break;
                case 'underline':
                    execCommandName = 'underline';
                    break;
            }
            
            if (execCommandName) {
                document.execCommand(execCommandName, false, null);
            }
        }
        
        editor.focus();
        autoSave();
    } else {
        // Fallback for textarea - use markdown syntax
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const selectedText = editor.value.substring(start, end);
        const before = editor.value.substring(0, start);
        const after = editor.value.substring(end);

        let formattedText = selectedText;
        
        if (command === 'bullet' || command === 'number') {
            const lines = selectedText ? selectedText.split('\n') : [''];
            if (command === 'bullet') {
                formattedText = lines.map(line => line.trim() ? `• ${line.trim()}` : line).join('\n');
            } else if (command === 'number') {
                formattedText = lines.map((line, i) => line.trim() ? `${i + 1}. ${line.trim()}` : line).join('\n');
            }
        } else {
            if (selectedText) {
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
            } else {
                switch (command) {
                    case 'bold':
                        formattedText = '****';
                        break;
                    case 'italic':
                        formattedText = '**';
                        break;
                    case 'underline':
                        formattedText = '____';
                        break;
                }
            }
        }

        editor.value = before + formattedText + after;
        
        if (selectedText) {
            editor.selectionStart = start;
            editor.selectionEnd = start + formattedText.length;
        } else {
            if (command === 'bold' || command === 'underline') {
                editor.selectionStart = start + 2;
                editor.selectionEnd = start + 2;
            } else if (command === 'italic') {
                editor.selectionStart = start + 1;
                editor.selectionEnd = start + 1;
            } else {
                editor.selectionStart = start + formattedText.length;
                editor.selectionEnd = start + formattedText.length;
            }
        }
        
        editor.focus();
        autoSave();
    }
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
        // Light theme uses dark monokai, dark theme uses light default
        const codeTheme = currentTheme === 'light' ? 'monokai' : 'default';
        codeMirrorInstance.setOption('theme', codeTheme);
        
        // Update background and text colors
        if (currentTheme === 'light') {
            codeMirrorInstance.getWrapperElement().style.background = '#272822';
            codeMirrorInstance.getWrapperElement().style.color = '#f8f8f2';
        } else {
            codeMirrorInstance.getWrapperElement().style.background = '#f8f8f2';
            codeMirrorInstance.getWrapperElement().style.color = '#272822';
        }
    }

    saveSettings();
}

function toggleEditorMode() {
    isCodeMode = !isCodeMode;
    const modeBtn = document.getElementById('mode-toggle');
    const textEditor = document.getElementById('text-editor');
    const textEditorTextarea = document.getElementById('text-editor-textarea');
    const editorContainer = document.getElementById('editor-container');

    if (isCodeMode) {
        modeBtn.textContent = '💻';
        modeBtn.classList.add('active');

        // Sync content from contenteditable to textarea for CodeMirror
        const currentContent = getEditorText();
        if (textEditorTextarea) {
            textEditorTextarea.value = currentContent;
        }

        // Hide contenteditable editor
        textEditor.style.display = 'none';

        // Initialize CodeMirror with theme based on current theme
        if (!codeMirrorInstance) {
            // Light theme uses dark monokai, dark theme uses light default
            const codeTheme = currentTheme === 'light' ? 'monokai' : 'default';
            
            // Use the hidden textarea for CodeMirror
            codeMirrorInstance = CodeMirror.fromTextArea(textEditorTextarea, {
                lineNumbers: true,
                mode: 'javascript',
                theme: codeTheme,
                indentUnit: 2,
                tabSize: 2,
                lineWrapping: true
            });

            // Apply styling based on theme
            if (currentTheme === 'light') {
                codeMirrorInstance.getWrapperElement().style.background = '#272822';
                codeMirrorInstance.getWrapperElement().style.color = '#f8f8f2';
            } else {
                codeMirrorInstance.getWrapperElement().style.background = '#f8f8f2';
                codeMirrorInstance.getWrapperElement().style.color = '#272822';
            }
            codeMirrorInstance.getWrapperElement().style.fontFamily = "'Ubuntu Mono', 'Consolas', 'Monaco', monospace";
            codeMirrorInstance.getWrapperElement().style.height = '100%';

            codeMirrorInstance.on('change', () => {
                updateWordCount();
                autoSave();
            });
        } else {
            // Update theme if CodeMirror already exists
            const codeTheme = currentTheme === 'light' ? 'monokai' : 'default';
            codeMirrorInstance.setOption('theme', codeTheme);
            
            // Update background and text colors
            if (currentTheme === 'light') {
                codeMirrorInstance.getWrapperElement().style.background = '#272822';
                codeMirrorInstance.getWrapperElement().style.color = '#f8f8f2';
            } else {
                codeMirrorInstance.getWrapperElement().style.background = '#f8f8f2';
                codeMirrorInstance.getWrapperElement().style.color = '#272822';
            }
            
            // Sync content to CodeMirror
            codeMirrorInstance.setValue(currentContent);
        }

        // Show CodeMirror
        codeMirrorInstance.getWrapperElement().style.display = 'block';
        
        // Focus CodeMirror after a small delay to ensure it's rendered
        setTimeout(() => {
            codeMirrorInstance.focus();
        }, 50);

    } else {
        modeBtn.textContent = '📝';
        modeBtn.classList.remove('active');

        // Remove code styling
        textEditor.classList.remove('code-mode');

        if (codeMirrorInstance) {
            // Get content from CodeMirror
            const codeContent = codeMirrorInstance.getValue();
            
            // Hide CodeMirror
            codeMirrorInstance.getWrapperElement().style.display = 'none';
            
            // Set content in contenteditable editor
            setEditorText(codeContent);
        }
        
        // Show contenteditable editor
        textEditor.style.display = 'block';
        
        // Focus editor
        setTimeout(() => {
            textEditor.focus();
        }, 50);
    }

    updateActiveTabContent();
    saveSettings();
}

function updateWordCount() {
    const text = getEditorText();
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    document.getElementById('word-count').textContent = `Words: ${words} | Characters: ${chars}`;
}

function autoSave() {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        if (!isDataLoaded) return;
        
        // Get fresh content from editor
        const currentContent = getCurrentEditorContent();
        
        // Update active tab
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
            tab.content = currentContent;
        }
        
        // Save if not locked
        if (!isLocked) {
            const data = {
                tabs: tabs.map(t => ({
                    id: t.id,
                    name: t.name,
                    content: t.id === activeTabId ? currentContent : (t.content || ''),
                    font: t.font || "'Segoe UI', Arial, sans-serif",
                    isCodeMode: t.isCodeMode || false
                })),
                activeTabId: activeTabId,
                theme: currentTheme,
                timestamp: new Date().toISOString()
            };
            chrome.storage.local.set({ editorData: data });
        }
        
        showSaveIndicator();
    }, 500);
}

// Helper function to get editor element
function getEditorElement() {
    return document.getElementById('text-editor');
}

// Helper function to check if editor is contenteditable
function isEditorContentEditable() {
    const editor = getEditorElement();
    if (!editor) return false;
    return editor.contentEditable === 'true' || editor.hasAttribute('contenteditable');
}

// Helper function to get text content (plain text) from editor
function getEditorText() {
    const editor = getEditorElement();
    if (!editor) return '';
    
    if (isCodeMode && codeMirrorInstance) {
        return codeMirrorInstance.getValue() || '';
    }
    
    if (isEditorContentEditable()) {
        // Get plain text from contenteditable
        return editor.textContent || editor.innerText || '';
    } else {
        // Get text from textarea
        return editor.value || '';
    }
}

// Helper function to set text content in editor
function setEditorText(text) {
    const editor = getEditorElement();
    if (!editor) return;
    
    if (isCodeMode && codeMirrorInstance) {
        codeMirrorInstance.setValue(text || '');
        return;
    }
    
    if (isEditorContentEditable()) {
        // Set text in contenteditable (as plain text)
        editor.textContent = text || '';
    } else {
        // Set text in textarea
        editor.value = text || '';
    }
}

// Helper function to set HTML content in editor
function setEditorHTML(html) {
    const editor = getEditorElement();
    if (!editor) return;
    
    if (isEditorContentEditable()) {
        editor.innerHTML = html || '';
    } else {
        // For textarea, extract text from HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html || '';
        editor.value = tempDiv.textContent || tempDiv.innerText || '';
    }
}

// Get current content from editor - ALWAYS reads fresh content
function getCurrentEditorContent() {
    let content = '';
    try {
        if (isCodeMode && codeMirrorInstance) {
            content = codeMirrorInstance.getValue() || '';
        } else {
            const editor = getEditorElement();
            if (editor) {
                if (isEditorContentEditable()) {
                    // Get HTML content from contenteditable
                    content = editor.innerHTML || '';
                } else {
                    // Get text from textarea
                    content = editor.value || '';
                }
            }
        }
    } catch (e) {
        console.error('Error reading editor content:', e);
    }
    return content;
}

// Force save function - saves regardless of lock status (used when locking)
function forceSaveToStorage() {
    // CRITICAL: Get fresh content directly from editor
    const currentContent = getCurrentEditorContent();
    
    // Update the active tab with current content
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) {
        tab.content = currentContent;
    } else if (tabs.length === 0) {
        // Create default tab if none exists
        tabs.push({ 
            id: 0, 
            name: 'Tab 1', 
            content: currentContent, 
            font: "'Segoe UI', Arial, sans-serif", 
            isCodeMode: false 
        });
        activeTabId = 0;
    }
    
    // Prepare data with current content
    const dataToSave = {
        tabs: tabs.map(t => ({
            id: t.id,
            name: t.name,
            content: t.id === activeTabId ? currentContent : (t.content || ''),
            font: t.font || "'Segoe UI', Arial, sans-serif",
            isCodeMode: t.isCodeMode || false
        })),
        activeTabId: activeTabId,
        theme: currentTheme,
        timestamp: new Date().toISOString()
    };

    // Save immediately
    chrome.storage.local.set({ editorData: dataToSave }, () => {
        isDataLoaded = true;
    });
}

function saveToStorage() {
    // Critical: Do NOT save if we haven't loaded data yet (prevents overwriting with empty)
    if (!isDataLoaded) return;
    // Critical: Do not save if locked (prevents overwriting with hidden/empty state)
    if (isLocked) return;

    // Get fresh content from editor
    const currentContent = getCurrentEditorContent();
    
    // Update active tab
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) {
        tab.content = currentContent;
    }
    
    const data = {
        tabs: tabs.map(t => ({
            id: t.id,
            name: t.name,
            content: t.id === activeTabId ? currentContent : (t.content || ''),
            font: t.font || "'Segoe UI', Arial, sans-serif",
            isCodeMode: t.isCodeMode || false
        })),
        activeTabId: activeTabId,
        theme: currentTheme,
        timestamp: new Date().toISOString()
    };

    chrome.storage.local.set({ editorData: data });
}

function loadSavedData() {
    chrome.storage.local.get(['editorData'], (result) => {
        isDataLoaded = true; // Allow saving from now on
        
        if (result.editorData && result.editorData.tabs && result.editorData.tabs.length > 0) {
            const data = result.editorData;
            
            // CRITICAL: Completely replace tabs array with saved data
            tabs = data.tabs.map(tab => ({
                id: tab.id || 0,
                name: tab.name || 'Tab 1',
                content: tab.content !== undefined ? tab.content : '', // Preserve empty strings
                font: tab.font || "'Segoe UI', Arial, sans-serif",
                isCodeMode: tab.isCodeMode || false
            }));
            
            activeTabId = data.activeTabId !== undefined ? data.activeTabId : (tabs.length > 0 ? tabs[0].id : 0);
            nextTabId = tabs.length > 0 ? Math.max(...tabs.map(t => t.id), 0) + 1 : 1;
            
            // Restore theme
            if (data.theme) {
                currentTheme = data.theme;
                document.body.className = `${currentTheme}-mode`;
            }
            
            // Render and switch to active tab
            renderTabs();
            
            // Ensure DOM is ready before switching
            setTimeout(() => {
                const activeTab = tabs.find(t => t.id === activeTabId);
                if (activeTab) {
                    // Set content directly in editor (HTML if contenteditable)
                    setEditorHTML(activeTab.content || '');
                    
                    const editor = getEditorElement();
                    if (editor) {
                        editor.style.fontFamily = activeTab.font || "'Segoe UI', Arial, sans-serif";
                    }
                    
                    const fontSelect = document.getElementById('font-select');
                    if (fontSelect) {
                        fontSelect.value = activeTab.font || "'Segoe UI', Arial, sans-serif";
                    }
                    
                    // Update CodeMirror if in code mode
                    if (activeTab.isCodeMode && codeMirrorInstance) {
                        codeMirrorInstance.setValue(activeTab.content || '');
                    } else if (activeTab.isCodeMode !== isCodeMode) {
                        // Toggle mode if needed
                        toggleEditorMode();
                    }
                    
                    updateWordCount();
                }
            }, 100);
        } else {
            // No saved data - ensure we have at least one tab
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

    if (!tab) {
        return;
    }
    
    // Set content in editor (HTML if contenteditable, text if textarea)
    setEditorHTML(tab.content || '');
    
    const editor = getEditorElement();
    if (editor) {
        editor.style.fontFamily = tab.font || "'Segoe UI', Arial, sans-serif";
    }
    
    const fontSelect = document.getElementById('font-select');
    if (fontSelect) {
        fontSelect.value = tab.font || "'Segoe UI', Arial, sans-serif";
    }

    // Update CodeMirror if in code mode
    if (isCodeMode && codeMirrorInstance) {
        codeMirrorInstance.setValue(tab.content || '');
    }

    // Switch mode if needed
    if (tab.isCodeMode !== isCodeMode) {
        // Temporarily set mode to match tab
        const wasCodeMode = isCodeMode;
        isCodeMode = tab.isCodeMode;
        
        if (tab.isCodeMode && !wasCodeMode) {
            // Need to switch to code mode
            toggleEditorMode();
        } else if (!tab.isCodeMode && wasCodeMode) {
            // Need to switch to text mode
            toggleEditorMode();
        }
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

    // Get content from editor (CodeMirror or textarea) - ALWAYS get fresh content
    let content = '';
    try {
        if (isCodeMode && codeMirrorInstance) {
            content = codeMirrorInstance.getValue() || '';
        } else {
            const textEditor = document.getElementById('text-editor');
            if (textEditor) {
                content = textEditor.value || '';
            }
        }
    } catch (e) {
        console.error('Error reading editor content:', e);
        content = tab.content || ''; // Fallback to existing content
    }
    
    // Always update the tab content
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
        // Clear any pending autosave
        clearTimeout(autoSaveTimeout);
        
        // CRITICAL: Save content IMMEDIATELY before locking
        forceSaveToStorage();
        
        // Set locked state
        chrome.storage.local.set({ isLocked: true }, () => {
            isLocked = true;
            document.getElementById('app-container').style.display = 'none';
            showLockedScreen();
            hideLockModal();
            updateLockButton();
        });
    } else {
        alert('❌ Wrong password!');
    }
}

// New Direct Lock Function
function tryLockEditor() {
    if (passwordHash) {
        // Clear any pending autosave
        clearTimeout(autoSaveTimeout);
        
        // CRITICAL: Save content IMMEDIATELY before locking
        forceSaveToStorage();
        
        // Set locked state - use callback to ensure save completes first
        chrome.storage.local.set({ isLocked: true }, () => {
            isLocked = true;
            document.getElementById('app-container').style.display = 'none';
            showLockedScreen();
            updateLockButton();
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