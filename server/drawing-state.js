/**
 * Manages the drawing state (history, redo stack) for each room.
 * This is the core of the global undo/redo functionality.
 */
const roomStates = new Map(); // Map<roomId, { history: Array, redoStack: Array }>

// Maximum operations to keep in memory (prevent unbounded growth)
const MAX_HISTORY_SIZE = 10000;

class DrawingState {
  /**
   * Gets or creates the state for a room.
   * @param {string} roomId
   * @returns {{history: Array, redoStack: Array}}
   */
  _getRoomState(roomId) {
    if (!roomId || typeof roomId !== 'string') {
      throw new Error('Invalid roomId');
    }
    
    if (!roomStates.has(roomId)) {
      roomStates.set(roomId, {
        history: [],
        redoStack: [],
      });
    }
    return roomStates.get(roomId);
  }

  /**
   * Gets the full operation history for a room.
   * @param {string} roomId
   * @returns {Array}
   */
  getHistory(roomId) {
    return this._getRoomState(roomId).history;
  }

  /**
   * Adds a new drawing operation to the history.
   * This clears the redo stack.
   * @param {string} roomId
   * @param {object} operation - The drawing operation data
   */
  addOperation(roomId, operation) {
    // Validate operation
    if (!operation || typeof operation !== 'object') {
      throw new Error('Invalid operation');
    }
    
    const state = this._getRoomState(roomId);
    state.history.push(operation);
    state.redoStack = []; // A new operation clears the redo stack
    
    // Prevent unbounded memory growth
    if (state.history.length > MAX_HISTORY_SIZE) {
      state.history.shift(); // Remove oldest operation
    }
  }

  /**
   * Undoes the last operation in a room.
   * @param {string} roomId
   * @returns {Array} - The new history
   */
  undo(roomId) {
    const state = this._getRoomState(roomId);
    if (state.history.length === 0) {
      return state.history; // Nothing to undo
    }
    
    const lastOperation = state.history.pop();
    state.redoStack.push(lastOperation);
    
    return state.history;
  }

  /**
   * Redoes the last undone operation in a room.
   * @param {string} roomId
   * @returns {Array} - The new history
   */
  redo(roomId) {
    const state = this._getRoomState(roomId);
    if (state.redoStack.length === 0) {
      return state.history; // Nothing to redo
    }

    const nextOperation = state.redoStack.pop();
    state.history.push(nextOperation);
    
    return state.history;
  }

  /**
   * Checks if undo is available for a room.
   * @param {string} roomId
   * @returns {boolean}
   */
  canUndo(roomId) {
    const state = this._getRoomState(roomId);
    return state.history.length > 0;
  }

  /**
   * Checks if redo is available for a room.
   * @param {string} roomId
   * @returns {boolean}
   */
  canRedo(roomId) {
    const state = this._getRoomState(roomId);
    return state.redoStack.length > 0;
  }

  /**
   * Clears all drawing history for a room.
   * @param {string} roomId
   */
  clear(roomId) {
    const state = this._getRoomState(roomId);
    state.history = [];
    state.redoStack = [];
  }

  /**
   * Removes a room from memory (cleanup).
   * @param {string} roomId
   */
  deleteRoom(roomId) {
    roomStates.delete(roomId);
  }
}

// Export a singleton instance
module.exports = new DrawingState();