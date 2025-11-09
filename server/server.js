const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const DrawingState = require('./drawing-state');
const RoomManager = require('./rooms');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files from the 'client' directory
const clientPath = path.join(__dirname, '../client');
app.use(express.static(clientPath));

// Fallback to index.html for any other request (for client-side routing, if any)
app.get('*', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

// --- Helper Functions ---

/**
 * Validates a drawing operation object
 */
function isValidOperation(op) {
  if (!op || typeof op !== 'object') return false;
  
  // Check required fields
  if (!op.from || !op.to || typeof op.from !== 'object' || typeof op.to !== 'object') {
    return false;
  }
  
  if (typeof op.from.x !== 'number' || typeof op.from.y !== 'number') {
    return false;
  }
  
  if (typeof op.to.x !== 'number' || typeof op.to.y !== 'number') {
    return false;
  }
  
  if (!op.tool || (op.tool !== 'brush' && op.tool !== 'eraser')) {
    return false;
  }
  
  if (typeof op.lineWidth !== 'number' || op.lineWidth < 1 || op.lineWidth > 100) {
    return false;
  }
  
  // Only validate color for brush tool
  if (op.tool === 'brush' && (!op.color || typeof op.color !== 'string')) {
    return false;
  }
  
  return true;
}

/**
 * Validates cursor position data
 */
function isValidCursorData(data) {
  if (!data || typeof data !== 'object') return false;
  if (!data.pos || typeof data.pos !== 'object') return false;
  if (typeof data.pos.x !== 'number' || typeof data.pos.y !== 'number') return false;
  return true;
}

/**
 * Sanitizes a room ID
 */
function sanitizeRoomId(roomId) {
  if (!roomId || typeof roomId !== 'string') {
    return 'default-room';
  }
  // Only allow alphanumeric and hyphens
  return roomId.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 50) || 'default-room';
}

// --- Socket.io Logic ---

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  let currentRoom = null;
  let userColor = null;

  socket.on('JOIN_ROOM', (roomId) => {
    try {
      // Sanitize and validate room ID
      const room = sanitizeRoomId(roomId);
      currentRoom = room;
      
      socket.join(room);

      // Add user to our room manager and get their assigned color/user list
      const { color, users } = RoomManager.addUser(room, socket.id);
      userColor = color;
      
      console.log(`User ${socket.id} joined room ${room} with color ${color}`);
      
      // Send the new user their assigned color and the current user list
      socket.emit('USER_INIT', { 
        id: socket.id, 
        color,
        users 
      });

      // Send the complete drawing history to the new user
      const history = DrawingState.getHistory(room);
      socket.emit('DRAW_HISTORY', history);
      
      // Send undo/redo state
      socket.emit('UNDO_REDO_STATE', {
        canUndo: DrawingState.canUndo(room),
        canRedo: DrawingState.canRedo(room)
      });

      // Notify all *other* users in the room about the new user
      socket.broadcast.to(room).emit('USER_JOINED', { 
        id: socket.id, 
        color 
      });
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('ERROR', { message: 'Failed to join room' });
    }
  });

  // --- Drawing Events ---

  socket.on('DRAW', (data) => {
    if (!currentRoom) {
      console.error('DRAW event received before joining room');
      return;
    }
    
    try {
      // Validate operation
      if (!isValidOperation(data)) {
        console.error('Invalid DRAW operation:', data);
        return;
      }
      
      // Add operation to server state
      DrawingState.addOperation(currentRoom, data);
      
      // Broadcast the draw operation to all *other* clients
      socket.broadcast.to(currentRoom).emit('DRAW', data);
      
      // Update undo/redo state for all clients
      io.to(currentRoom).emit('UNDO_REDO_STATE', {
        canUndo: DrawingState.canUndo(currentRoom),
        canRedo: DrawingState.canRedo(currentRoom)
      });
    } catch (error) {
      console.error('Error processing DRAW:', error);
    }
  });

  socket.on('CURSOR_MOVE', (data) => {
    if (!currentRoom) return;
    
    try {
      // Validate cursor data
      if (!isValidCursorData(data)) {
        return;
      }
      
      // Broadcast cursor position to *other* clients
      socket.broadcast.to(currentRoom).emit('CURSOR_MOVE', {
        id: socket.id,
        pos: data.pos,
        color: userColor // Send the user's assigned color
      });
    } catch (error) {
      console.error('Error processing CURSOR_MOVE:', error);
    }
  });

  // --- State Management Events ---

  socket.on('UNDO', () => {
    if (!currentRoom) return;
    
    try {
      const newHistory = DrawingState.undo(currentRoom);
      // Broadcast the *entire updated history* to *all* clients
      io.to(currentRoom).emit('DRAW_HISTORY', newHistory);
      
      // Update undo/redo state
      io.to(currentRoom).emit('UNDO_REDO_STATE', {
        canUndo: DrawingState.canUndo(currentRoom),
        canRedo: DrawingState.canRedo(currentRoom)
      });
    } catch (error) {
      console.error('Error processing UNDO:', error);
    }
  });

  socket.on('REDO', () => {
    if (!currentRoom) return;
    
    try {
      const newHistory = DrawingState.redo(currentRoom);
      // Broadcast the *entire updated history* to *all* clients
      io.to(currentRoom).emit('DRAW_HISTORY', newHistory);
      
      // Update undo/redo state
      io.to(currentRoom).emit('UNDO_REDO_STATE', {
        canUndo: DrawingState.canUndo(currentRoom),
        canRedo: DrawingState.canRedo(currentRoom)
      });
    } catch (error) {
      console.error('Error processing REDO:', error);
    }
  });

  socket.on('CLEAR', () => {
    if (!currentRoom) return;
    
    try {
      DrawingState.clear(currentRoom);
      // Broadcast the clear event to *all* clients
      io.to(currentRoom).emit('CLEAR');
      
      // Update undo/redo state
      io.to(currentRoom).emit('UNDO_REDO_STATE', {
        canUndo: false,
        canRedo: false
      });
    } catch (error) {
      console.error('Error processing CLEAR:', error);
    }
  });

  socket.on('REQUEST_HISTORY', () => {
    if (!currentRoom) return;
    
    try {
      const history = DrawingState.getHistory(currentRoom);
      socket.emit('DRAW_HISTORY', history);
      
      socket.emit('UNDO_REDO_STATE', {
        canUndo: DrawingState.canUndo(currentRoom),
        canRedo: DrawingState.canRedo(currentRoom)
      });
    } catch (error) {
      console.error('Error processing REQUEST_HISTORY:', error);
    }
  });

  // --- Disconnect ---

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    if (currentRoom) {
      try {
        RoomManager.removeUser(currentRoom, socket.id);
        // Notify all users that this user has left
        io.to(currentRoom).emit('USER_LEFT', socket.id);
        
        // Clean up empty rooms
        if (RoomManager.getUserCount(currentRoom) === 0) {
          DrawingState.deleteRoom(currentRoom);
        }
      } catch (error) {
        console.error('Error during disconnect:', error);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});