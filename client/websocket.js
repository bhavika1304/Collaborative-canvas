/**
 * Manages all Socket.io communication.
 * It acts as the controller between the server and the
 * CanvasView and UIManager (main.js).
 */
class WebSocketClient {
  constructor(canvasView) {
    this.canvasView = canvasView;
    this.socket = io();

    // Callbacks for main.js to hook into
    this.onUserInit = null; // (id, color) => {}
    this.onUserListUpdate = null; // (users) => {}
    this.onUndoRedoState = null; // (canUndo, canRedo) => {}
    this.onError = null; // (message) => {}

    // Cursor throttling
    this.lastCursorSend = 0;
    this.cursorThrottleMs = 50; // Max 20 updates/sec

    // Connection state
    this.isConnected = false;
    this.reconnectAttempts = 0;

    this._initListeners();
  }

  _initListeners() {
    // --- Connection & User Management ---
    this.socket.on('connect', () => {
      console.log('Connected to server!');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // Join the default room once connected
      this.socket.emit('JOIN_ROOM', 'default-room');
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`Reconnected after ${attemptNumber} attempts`);
      this.reconnectAttempts = attemptNumber;
      
      // Rejoin room and request fresh state
      this.socket.emit('JOIN_ROOM', 'default-room');
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`Reconnection attempt ${attemptNumber}`);
      this.reconnectAttempts = attemptNumber;
    });

    this.socket.on('reconnect_failed', () => {
      console.error('Reconnection failed');
      if (this.onError) {
        this.onError('Failed to reconnect to server');
      }
    });

    this.socket.on('USER_INIT', ({ id, color, users }) => {
      console.log(`I am ${id} with color ${color}`);
      if (this.onUserInit) {
        this.onUserInit(id, color);
      }
      if (this.onUserListUpdate) {
        this.onUserListUpdate(users);
      }
    });

    this.socket.on('USER_JOINED', (user) => {
      console.log(`User joined: ${user.id}`);
      if (this.onUserListUpdate) {
        this.onUserListUpdate(null, user); // 'null' means we append
      }
    });

    this.socket.on('USER_LEFT', (id) => {
      console.log(`User left: ${id}`);
      this.canvasView.removeCursor(id); // Remove their cursor
      if (this.onUserListUpdate) {
        this.onUserListUpdate(null, null, id); // 'null, null' means we remove
      }
    });

    // --- Drawing Events ---
    
    // Server sends the *full history* (on join, or after undo/redo)
    this.socket.on('DRAW_HISTORY', (history) => {
      console.log('Receiving full draw history:', history.length, 'operations');
      this.canvasView.redrawAll(history);
    });

    // Server sends a *single operation* (from another user)
    this.socket.on('DRAW', (op) => {
      this.canvasView.drawOperation(op);
    });

    // Another user's cursor moved
    this.socket.on('CURSOR_MOVE', (data) => {
      this.canvasView.updateCursor(data.id, data.pos, data.color);
    });

    // Server broadcasted a full clear
    this.socket.on('CLEAR', () => {
      this.canvasView.clear();
    });

    // Server sends undo/redo state
    this.socket.on('UNDO_REDO_STATE', ({ canUndo, canRedo }) => {
      if (this.onUndoRedoState) {
        this.onUndoRedoState(canUndo, canRedo);
      }
    });

    // --- Error Handling ---
    this.socket.on('ERROR', ({ message }) => {
      console.error('Server error:', message);
      if (this.onError) {
        this.onError(message);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      this.isConnected = false;
      
      if (reason === 'io server disconnect') {
        // Server forcibly disconnected, need to reconnect manually
        this.socket.connect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      if (this.onError) {
        this.onError('Connection error - retrying...');
      }
    });
  }

  // --- Public Emitter Methods ---

  /**
   * Send a drawing operation to the server.
   * @param {object} op
   */
  sendDraw(op) {
    if (!this.isConnected) {
      console.warn('Cannot send draw - not connected');
      return;
    }
    
    this.socket.emit('DRAW', op);
  }

  /**
   * Send this client's cursor position to the server (throttled).
   * @param {object} pos - {x, y}
   */
  sendCursor(pos) {
    if (!this.isConnected) return;
    
    // Throttle cursor updates
    const now = Date.now();
    if (now - this.lastCursorSend < this.cursorThrottleMs) {
      return; // Skip this update
    }
    this.lastCursorSend = now;
    
    this.socket.emit('CURSOR_MOVE', { pos });
  }

  sendUndo() {
    if (!this.isConnected) {
      console.warn('Cannot undo - not connected');
      return;
    }
    this.socket.emit('UNDO');
  }

  sendRedo() {
    if (!this.isConnected) {
      console.warn('Cannot redo - not connected');
      return;
    }
    this.socket.emit('REDO');
  }

  sendClear() {
    if (!this.isConnected) {
      console.warn('Cannot clear - not connected');
      return;
    }
    
    // Confirmation dialog
    if (!confirm('Are you sure you want to clear the entire canvas? This cannot be undone.')) {
      return;
    }
    
    this.socket.emit('CLEAR');
  }

  /**
   * Request the current drawing history from the server
   */
  requestHistory() {
    if (!this.isConnected) {
      console.warn('Cannot request history - not connected');
      return;
    }
    this.socket.emit('REQUEST_HISTORY');
  }

  /**
   * Get connection state
   */
  isSocketConnected() {
    return this.isConnected;
  }
}