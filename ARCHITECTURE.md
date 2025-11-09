Application Architecture

This document details the architecture of the Real-Time Collaborative Canvas, explaining the data flow, performance optimizations, and the strategy for handling the complex global undo/redo feature.

High-Level Overview

This is a client-server application. The Node.js/Socket.io server acts as the single source of truth. It is not just a message passer; it owns and manages the complete drawing state, including the undo/redo history for each room.

The Vanilla JS client acts as a "dumb" renderer and input handler. It sends user inputs to the server and renders the state it receives from the server. This server-authoritative model is key to preventing conflicts and ensuring all clients remain in sync.

🌊 Data Flow Diagram: A Single Drawing Operation

Here is the flow for a single drawing event, from one client to all others.

sequenceDiagram
    participant Client A
    participant Server
    participant Client B
    participant Client C

    Note over Client A: User draws a line.
    Client A->>Client A: 1. drawOperation() (Local Prediction)
    Client A->>Server: 2. 'DRAW' (operation)

    activate Server
    Server->>Server: 3. addOperation() (Save to history, clear redo stack)
    Server-->>Client B: 4. 'DRAW' (operation)
    Server-->>Client C: 4. 'DRAW' (operation)
    Server-->>Client A: 5. 'UNDO_REDO_STATE' (canUndo: true)
    Server-->>Client B: 5. 'UNDO_REDO_STATE' (canUndo: true)
    Server-->>Client C: 5. 'UNDO_REDO_STATE' (canUndo: true)
    deactivate Server

    activate Client B
    Client B->>Client B: 6. drawOperation()
    deactivate Client B

    activate Client C
    Client C->>Client C: 6. drawOperation()
    deactivate Client C


Step-by-Step Explanation:

Client A draws on the canvas. The canvas.js module immediately draws this line on Client A's local canvas. This is Client-Side Prediction.

Client A sends a DRAW event over Socket.io to the Server with the operation data (e.g., coordinates, color, width).

The Server receives the DRAW event. It validates the data and passes it to drawing-state.js, which appends the operation to the history array and clears the redoStack.

The Server broadcasts this DRAW event to all other clients in the room (Client B, Client C).

The Server also broadcasts an UNDO_REDO_STATE update to all clients (including Client A) to let them know that "Undo" is now available.

Client B and Client C receive the DRAW event and call drawOperation() to render the line on their canvases, ensuring they are synced with the new state.

🚀 Core Performance Optimizations (Performance Decisions)

Two key decisions were made to ensure the application feels fast and responsive.

1. Dual Canvas System

The client uses two <canvas> elements stacked on top of each other:

#drawing-canvas (z-index: 1): This is the main canvas where the artwork lives. It is only modified when a new line is drawn or when the entire canvas is redrawn for an undo/redo.

#cursor-canvas (z-index: 2): This is a transparent canvas layered on top with pointer-events: none. Its sole purpose is to render the cursors of other users. It is cleared and redrawn on every requestAnimationFrame (approx. 60fps).

Why? This separation is critical. If we drew cursors on the main canvas, we would have to redraw the entire drawing (potentially thousands of operations) 60 times per second just to move a cursor. By separating them, we achieve high-performance cursor rendering without touching the main artwork.

2. Client-Side Prediction

When a user draws, their line appears on their screen instantly. This is achieved through client-side prediction in client/canvas.js (Step 1 in the diagram above). This makes the application feel lag-free, even if the server takes 100ms+ to respond.

🔄 The Global Undo/Redo Strategy

This is the most complex part of the application. The state is managed entirely on the server in server/drawing-state.js.

history: An array of all operations currently on the canvas.

redoStack: An array of all operations that have been undone.

Undo Flow:

A client emits an UNDO event.

The server calls DrawingState.undo().

This function pops the last operation from history and pushes it onto redoStack.

The server then broadcasts the entire modified history array to all clients via the DRAW_HISTORY event.

All clients receive this new history, clear their canvases, and redraw everything from the new history array.

Redo Flow:

A client emits a REDO event.

The server calls DrawingState.redo().

This function pops from redoStack and pushes onto history.

The server broadcasts the new DRAW_HISTORY to all clients for a full redraw.

This server-authoritative, full-history-broadcast model is robust. It guarantees that all clients are always in perfect sync and that there are no "undo conflicts," as the server is the single source of truth.

📡 WebSocket Protocol (Events)

Client-to-Server

JOIN_ROOM (roomId): Sent on connect to join a room.

DRAW (operation): Sent when the user draws a line segment.

CURSOR_MOVE (pos): Sent (throttled) when the user's cursor moves.

UNDO: Sent to undo the last operation.

REDO: Sent to redo the last undone operation.

CLEAR: Sent to clear the entire canvas for all users.

REQUEST_HISTORY: Sent when the client needs the full history (e.g., after a resize).

Server-to-Client

USER_INIT ({ id, color, users }): Sent to the new client on join.

USER_JOINED (user): Broadcast to all others when a user joins.

USER_LEFT (id): Broadcast to all others when a user leaves.

DRAW_HISTORY (history): Sent to all clients after an undo, redo, or on request.

DRAW (operation): Broadcast to others when a user draws.

CURSOR_MOVE ({ id, pos, color }): Broadcast to others when a user moves their cursor.

CLEAR: Broadcast to all when the canvas is cleared.

UNDO_REDO_STATE ({ canUndo, canRedo }): Sent to all clients whenever the history changes.

ERROR ({ message }): Sent if something goes wrong.

⚖️ Conflict Resolution

Simultaneous Drawing: "Last write wins," processed sequentially by the server. Since the server appends operations to the history array as they arrive, there is no true conflict. The server's linear processing of events ensures a consistent order.

Undo/Redo: Handled perfectly by the server-authoritative model. It is impossible for clients to be in a conflicting state because they don't have any local state; they just render the history the server sends them.