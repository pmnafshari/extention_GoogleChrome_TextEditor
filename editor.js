let isCodeMode = false;
let codeMirrorInstance = null;
let currentTheme = 'light';
let autoSaveTimeout = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    loadSavedData();
    setupEventListeners();
    updateWordCount();
});

function setupEventListeners() {
    // Formatting buttons
    document.getElementById('bold-btn').addEventListener('click', () => formatText('bold'));
    document.getElementById('italic-btn').addEventListener('click', () => formatText('italic'));
    document.getElementById('underline-btn').addEventListener('click', () => formatText('underline'));

    // Font selection
    document.getElementById('font-select').addEventListener('change', (e) => {
        document.getElementById('text-editor').style.fontFamily = e.target.value;
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
    document.getElementById('save-gdrive').addEventListener('click', saveToGoogleDrive);
    document.getElementById('save-dropbox').addEventListener('click', saveToDropbox);
    document.getElementById('cancel-cloud').addEventListener('click', hideCloudModal);

    // Text editor changes
    document.getElementById('text-editor').addEventListener('input', () => {
        updateWordCount();
        autoSave();
    });

    // Keyboard shortcuts
    document.getElementById('text-editor').addEventListener('keydown', handleKeyboardShortcuts);
}

function formatText(command) {
    const editor = document.getElementById('text-editor');
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedText = editor.value.substring(start, end);

    if (selectedText) {
        let formattedText = selectedText;
        const before = editor.value.substring(0, start);
        const after = editor.value.substring(end);

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

        editor.value = before + formattedText + after;
        editor.selectionStart = start;
        editor.selectionEnd = start + formattedText.length;
        autoSave();
    }
}

function handleKeyboardShortcuts(e) {
    if (e.ctrlKey || e.metaKey) {
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
    const container = document.getElementById('editor-container');
    const textEditor = document.getElementById('text-editor');

    if (isCodeMode) {
        modeBtn.textContent = '💻 Code';
        modeBtn.classList.add('active');

        // Initialize CodeMirror
        if (!codeMirrorInstance) {
            codeMirrorInstance = CodeMirror.fromTextArea(textEditor, {
                lineNumbers: true,
                mode: 'javascript',
                theme: currentTheme === 'dark' ? 'monokai' : 'default',
                indentUnit: 2,
                tabSize: 2,
                lineWrapping: true
            });

            codeMirrorInstance.on('change', () => {
                updateWordCount();
                autoSave();
            });
        }

        codeMirrorInstance.getWrapperElement().style.display = 'block';
        textEditor.style.display = 'none';
    } else {
        modeBtn.textContent = '📝 Text';
        modeBtn.classList.remove('active');

        if (codeMirrorInstance) {
            textEditor.value = codeMirrorInstance.getValue();
            codeMirrorInstance.getWrapperElement().style.display = 'none';
            textEditor.style.display = 'block';
        }
    }

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
        saveToStorage();
        showSaveIndicator();
    }, 1000);
}

function saveToStorage() {
    const data = {
        content: isCodeMode && codeMirrorInstance ? codeMirrorInstance.getValue() : document.getElementById('text-editor').value,
        font: document.getElementById('font-select').value,
        theme: currentTheme,
        isCodeMode: isCodeMode,
        timestamp: new Date().toISOString()
    };

    chrome.storage.local.set({ editorData: data });
}

function loadSavedData() {
    chrome.storage.local.get(['editorData', 'editorSettings'], (result) => {
        if (result.editorData) {
            const data = result.editorData;
            document.getElementById('text-editor').value = data.content || '';
            document.getElementById('font-select').value = data.font || "'Segoe UI', Arial, sans-serif";
            document.getElementById('text-editor').style.fontFamily = data.font || "'Segoe UI', Arial, sans-serif";

            if (data.theme) {
                currentTheme = data.theme;
                document.body.className = `${currentTheme}-mode`;
            }

            if (data.isCodeMode) {
                isCodeMode = false; // Reset first
                toggleEditorMode(); // Then toggle to code mode
            }
        }
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
    const content = isCodeMode && codeMirrorInstance ? codeMirrorInstance.getValue() : document.getElementById('text-editor').value;

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
}

function hideCloudModal() {
    document.getElementById('cloud-modal').classList.remove('show');
}

function saveToGoogleDrive() {
    hideCloudModal();

    // First, download the file
    const content = isCodeMode && codeMirrorInstance ? codeMirrorInstance.getValue() : document.getElementById('text-editor').value;
    const filename = `CloudWrite_${new Date().toISOString().slice(0, 10)}_${Date.now()}`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Show a helpful message
    setTimeout(() => {
        if (confirm('File downloaded! Click OK to open Google Drive and upload it.')) {
            window.open('https://drive.google.com/drive/my-drive', '_blank');
        }
    }, 500);
}

function saveToDropbox() {
    // Note: Dropbox requires OAuth setup and access token
    alert('Dropbox integration requires OAuth setup. Please configure your Dropbox API credentials.');
    // This is a placeholder - actual implementation would require Dropbox API setup
    hideCloudModal();
}