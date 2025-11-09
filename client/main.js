/**
 * Main application entry point.
 * Initializes all modules and wires up event listeners.
 * Also acts as the "UIManager" for handling DOM elements
 * outside of the canvas.
 */
document.addEventListener('DOMContentLoaded', () => {
  try {
    // --- 1. Initialize Modules ---
    
    const drawingCanvas = document.getElementById('drawing-canvas');
    const cursorCanvas = document.getElementById('cursor-canvas');
    
    if (!drawingCanvas || !cursorCanvas) {
      throw new Error('Canvas elements not found');
    }
    
    const canvasView = new CanvasView(drawingCanvas, cursorCanvas);
    const wsClient = new WebSocketClient(canvasView);

    // --- 2. Wire up Canvas -> WebSocket ---
    
    // When the canvas locally draws, send it to the server
    canvasView.onDraw = (op) => {
      wsClient.sendDraw(op);
    };

    // When the local cursor moves, send it to the server
    canvasView.onCursorMove = (pos) => {
      wsClient.sendCursor(pos);
    };

    // When canvas needs history (e.g., after resize)
    canvasView.onRequestHistory = () => {
      wsClient.requestHistory();
    };

    // --- 3. Wire up WebSocket -> UI (User List) ---

    const userListEl = document.getElementById('users');
    const connectionStatusEl = document.getElementById('connection-status');
    let usersMap = new Map();
    let myId = '';

    const updateUserListDOM = () => {
      userListEl.innerHTML = ''; // Clear list
      usersMap.forEach((user, id) => {
        const li = document.createElement('li');
        li.style.color = user.color;
        
        const swatch = document.createElement('span');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = user.color;
        
        li.appendChild(swatch);
        li.appendChild(document.createTextNode(id === myId ? 'You' : `User ${id.substring(0, 4)}`));
        userListEl.appendChild(li);
      });
    };

    wsClient.onUserInit = (id, color) => {
      myId = id;
      updateConnectionStatus('Connected');
    };

    wsClient.onUserListUpdate = (users, userJoined, userLeftId) => {
      if (users) {
        // Full list update
        usersMap = new Map(users.map(u => [u.id, u]));
      }
      if (userJoined) {
        // Add one
        usersMap.set(userJoined.id, userJoined);
      }
      if (userLeftId) {
        // Remove one
        usersMap.delete(userLeftId);
      }
      updateUserListDOM();
    };

    wsClient.onError = (message) => {
      updateConnectionStatus(`Error: ${message}`, true);
    };

    // --- 4. Wire up Toolbar -> (CanvasView + WebSocket) ---

    const colorPicker = document.getElementById('color-picker');
    const lineWidth = document.getElementById('line-width');
    const lineWidthValue = document.getElementById('line-width-value');
    const brushBtn = document.getElementById('brush-btn');
    const eraserBtn = document.getElementById('eraser-btn');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const clearBtn = document.getElementById('clear-btn');

    // Tool state changes
    colorPicker.addEventListener('change', (e) => {
      canvasView.setState({ color: e.target.value });
      // Visual feedback
      colorPicker.style.borderColor = e.target.value;
    });

    lineWidth.addEventListener('input', (e) => {
      const value = parseInt(e.target.value, 10);
      canvasView.setState({ lineWidth: value });
      if (lineWidthValue) {
        lineWidthValue.textContent = value;
      }
    });

    brushBtn.addEventListener('click', () => {
      canvasView.setState({ tool: 'brush' });
      brushBtn.classList.add('active');
      eraserBtn.classList.remove('active');
    });

    eraserBtn.addEventListener('click', () => {
      canvasView.setState({ tool: 'eraser' });
      eraserBtn.classList.add('active');
      brushBtn.classList.remove('active');
    });

    // Action events
    undoBtn.addEventListener('click', () => {
      wsClient.sendUndo();
    });

    redoBtn.addEventListener('click', () => {
      wsClient.sendRedo();
    });

    clearBtn.addEventListener('click', () => {
      wsClient.sendClear();
    });

    // --- 5. Undo/Redo Button State Management ---

    wsClient.onUndoRedoState = (canUndo, canRedo) => {
      undoBtn.disabled = !canUndo;
      redoBtn.disabled = !canRedo;
      
      // Visual feedback
      if (canUndo) {
        undoBtn.classList.remove('disabled');
      } else {
        undoBtn.classList.add('disabled');
      }
      
      if (canRedo) {
        redoBtn.classList.remove('disabled');
      } else {
        redoBtn.classList.add('disabled');
      }
    };

    // --- 6. Connection Status UI ---

    function updateConnectionStatus(message, isError = false) {
      if (!connectionStatusEl) return;
      
      connectionStatusEl.textContent = message;
      connectionStatusEl.className = isError ? 'error' : 'connected';
      
      // Auto-hide success messages after 3 seconds
      if (!isError) {
        setTimeout(() => {
          if (connectionStatusEl.textContent === message) {
            connectionStatusEl.textContent = '';
          }
        }, 3000);
      }
    }

    // --- 7. Keyboard Shortcuts ---

    document.addEventListener('keydown', (e) => {
      // Ctrl+Z or Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        wsClient.sendUndo();
      }
      
      // Ctrl+Shift+Z or Cmd+Shift+Z for redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        wsClient.sendRedo();
      }
      
      // B for brush
      if (e.key === 'b' || e.key === 'B') {
        brushBtn.click();
      }
      
      // E for eraser
      if (e.key === 'e' || e.key === 'E') {
        eraserBtn.click();
      }
    });

    // --- 8. Loading State ---

    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
      // Hide loading screen after initialization
      setTimeout(() => {
        loadingEl.style.opacity = '0';
        setTimeout(() => {
          loadingEl.style.display = 'none';
        }, 300);
      }, 500);
    }

    // --- 9. Initialize UI State ---

    // Set initial line width display
    if (lineWidthValue) {
      lineWidthValue.textContent = lineWidth.value;
    }

    // Set initial color border
    colorPicker.style.borderColor = colorPicker.value;

    // Initial button states
    undoBtn.disabled = true;
    redoBtn.disabled = true;
    undoBtn.classList.add('disabled');
    redoBtn.classList.add('disabled');

    console.log('App initialized successfully');

  } catch (error) {
    console.error('Failed to initialize app:', error);
    document.body.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column; font-family: sans-serif;">
        <h1>Failed to Load Application</h1>
        <p>Please check the console for error details.</p>
        <button onclick="location.reload()">Reload Page</button>
      </div>
    `;
  }
});