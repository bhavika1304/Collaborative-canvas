/**
 * Manages all Canvas 2D drawing logic for both the drawing
 * and cursor canvases. It does not hold any state, it just
 * provides methods to draw.
 */
class CanvasView {
  constructor(drawingCanvas, cursorCanvas) {
    this.drawCanvas = drawingCanvas;
    this.cursorCanvas = cursorCanvas;
    this.drawCtx = this.drawCanvas.getContext('2d');
    this.cursorCtx = this.cursorCanvas.getContext('2d');

    // Drawing state
    this.state = {
      color: '#000000',
      lineWidth: 5,
      tool: 'brush', // 'brush' or 'eraser'
    };

    // Drawing properties
    this.isDrawing = false;
    this.lastPos = { x: 0, y: 0 };
    
    // Callbacks for main.js to hook into
    this.onDraw = null; // (operation) => {}
    this.onCursorMove = null; // (pos) => {}
    this.onRequestHistory = null; // () => {}

    // Map of other users' cursors
    // Map<userId, { pos: [x, y], color: string }>
    this.otherUserCursors = new Map();

    // Animation frame management
    this.animationFrameId = null;
    this.isAnimating = false;

    this._initListeners();
    this.resizeCanvas();
    
    // Handle window resize
    window.addEventListener('resize', () => this.resizeCanvas());
    
    // Handle page visibility for performance
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this._stopCursorAnimation();
      } else {
        this._startCursorAnimation();
      }
    });

    // Start the cursor animation frame
    this._startCursorAnimation();
  }

  /**
   * Initialize all mouse event listeners on the drawing canvas
   */
  _initListeners() {
    this.drawCanvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this.drawCanvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.drawCanvas.addEventListener('mouseup', () => this._onMouseUp());
    this.drawCanvas.addEventListener('mouseout', () => this._onMouseUp());
    
    // Touch support for mobile
    this.drawCanvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      this.drawCanvas.dispatchEvent(mouseEvent);
    });
    
    this.drawCanvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      this.drawCanvas.dispatchEvent(mouseEvent);
    });
    
    this.drawCanvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      const mouseEvent = new MouseEvent('mouseup', {});
      this.drawCanvas.dispatchEvent(mouseEvent);
    });
  }

  /**
   * Resizes both canvases to fill the window.
   * This also clears the canvas, so a redraw is required.
   */
  resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const { innerWidth: width, innerHeight: height } = window;
    
    [this.drawCanvas, this.cursorCanvas].forEach(canvas => {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    });

    // Scale context for high-DPR displays
    this.drawCtx.scale(dpr, dpr);
    this.cursorCtx.scale(dpr, dpr);

    // Request history from server to redraw
    if (this.onRequestHistory) {
      console.log('Canvas resized - requesting history redraw');
      this.onRequestHistory();
    }
  }
  
  /**
   * Sets the current drawing tool state.
   * @param {{color?: string, lineWidth?: number, tool?: string}} newState
   */
  setState(newState) {
    Object.assign(this.state, newState);
  }

  // --- Mouse Event Handlers ---

  _getMousePos(e) {
    const rect = this.drawCanvas.getBoundingClientRect();
    return { 
      x: e.clientX - rect.left, 
      y: e.clientY - rect.top 
    };
  }

  _onMouseDown(e) {
    this.isDrawing = true;
    this.lastPos = this._getMousePos(e);
  }

  _onMouseMove(e) {
    const currentPos = this._getMousePos(e);
    
    if (this.isDrawing) {
      // Create a drawing operation
      const operation = {
        tool: this.state.tool,
        lineWidth: this.state.lineWidth,
        from: this.lastPos,
        to: currentPos,
      };
      
      // Only include color for brush tool
      if (this.state.tool === 'brush') {
        operation.color = this.state.color;
      }

      // 1. Draw locally immediately (client-side prediction)
      this.drawOperation(operation);

      // 2. Send the operation to the server
      if (this.onDraw) {
        this.onDraw(operation);
      }

      this.lastPos = currentPos;
    } else {
      // Not drawing, just moving the cursor
      if (this.onCursorMove) {
        this.onCursorMove(currentPos);
      }
    }
  }

  _onMouseUp() {
    this.isDrawing = false;
  }

  // --- Public Drawing Methods ---

  /**
   * Draws a single operation on the drawing canvas.
   * This is the core drawing function.
   * @param {object} op - The drawing operation
   */
  drawOperation(op) {
    const { from, to, color, lineWidth, tool } = op;
    this.drawCtx.beginPath();
    this.drawCtx.moveTo(from.x, from.y);
    this.drawCtx.lineTo(to.x, to.y);

    this.drawCtx.strokeStyle = color || '#000000';
    this.drawCtx.lineWidth = lineWidth;
    this.drawCtx.lineCap = 'round';
    this.drawCtx.lineJoin = 'round';

    // Handle eraser tool
    if (tool === 'eraser') {
      this.drawCtx.globalCompositeOperation = 'destination-out';
    } else {
      this.drawCtx.globalCompositeOperation = 'source-over';
    }

    this.drawCtx.stroke();
    
    // Reset composite operation
    this.drawCtx.globalCompositeOperation = 'source-over';
  }

  /**
   * Clears and redraws the *entire* drawing canvas from history.
   * @param {Array<object>} history - The complete array of drawing operations
   */
  redrawAll(history) {
    this.clear();
    if (history && Array.isArray(history)) {
      history.forEach(op => this.drawOperation(op));
    }
  }

  /**
   * Clears the drawing canvas.
   */
  clear() {
    this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
  }

  // --- Cursor Management ---

  /**
   * Updates the position of another user's cursor.
   * @param {string} id - The user's socket ID
   * @param {object} pos - The {x, y} position
   * @param {string} color - The user's assigned color
   */
  updateCursor(id, pos, color) {
    this.otherUserCursors.set(id, { pos, color });
  }

  /**
   * Removes a user's cursor when they disconnect.
   * @param {string} id - The user's socket ID
   */
  removeCursor(id) {
    this.otherUserCursors.delete(id);
  }

  /**
   * Starts the cursor animation loop.
   */
  _startCursorAnimation() {
    if (this.isAnimating) return;
    this.isAnimating = true;
    this._animationFrame();
  }

  /**
   * Stops the cursor animation loop.
   */
  _stopCursorAnimation() {
    this.isAnimating = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * The animation loop for drawing cursors.
   * This runs continuously on the cursor canvas.
   */
  _animationFrame() {
    if (!this.isAnimating) return;

    // Clear just the cursor canvas
    this.cursorCtx.clearRect(0, 0, this.cursorCanvas.width, this.cursorCanvas.height);

    // Draw all cursors
    this.otherUserCursors.forEach(({ pos, color }) => {
      this.cursorCtx.beginPath();
      this.cursorCtx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
      this.cursorCtx.fillStyle = color;
      this.cursorCtx.fill();
      
      this.cursorCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      this.cursorCtx.lineWidth = 2;
      this.cursorCtx.stroke();
    });

    this.animationFrameId = requestAnimationFrame(() => this._animationFrame());
  }

  /**
   * Cleanup method to be called when destroying the canvas
   */
  destroy() {
    this._stopCursorAnimation();
    window.removeEventListener('resize', this.resizeCanvas);
  }
}