Real-Time Collaborative Canvas

This is a multi-user, real-time drawing application built with Node.js and vanilla JavaScript. It allows multiple users to draw on the same canvas simultaneously, see each other's cursors, and share a global undo/redo history.

This project was built to demonstrate mastery of vanilla JavaScript, the HTML5 Canvas API, and real-time state synchronization with WebSockets.

🚀 Core Features

Real-Time Sync: Drawings appear on all clients' screens instantly.

Drawing Tools: Brush and eraser tools are available.

Tool Properties: Users can select custom colors and adjust stroke width.

Live User Cursors: See where other users are on the canvas, complete with their assigned color.

User List: An "Online" list shows all currently connected users.

Global Undo/Redo: The most complex feature. Undo/redo is global and server-authoritative, so all users share the same drawing history.

Mobile/Touch Support: The canvas supports drawing via touch events (touchstart, touchmove).

🔧 Tech Stack

Backend: Node.js, Express, Socket.io

Frontend: Vanilla JavaScript (ES6 Classes), HTML5 Canvas, CSS

Development: nodemon for live server reload.

📦 Setup & Running

Install Dependencies:

npm install


Run in Development Mode:
(Uses nodemon to auto-restart on file changes)

npm run dev


Run in Production Mode:

npm start


Access the Application:
Open http://localhost:3000 in your browser.

🧪 How to Test Multi-User Features

Start the server using one of the commands above.

Open http://localhost:3000 in two or more separate browser windows (or tabs).

Observe:

The "Online" list in both windows should show "You" and "User XXXX".

Drawing in one window will appear in the other in real-time.

You will see the colored cursor of the other user moving on your canvas.

Clicking Undo in one window will undo the last operation for all windows.

Clicking Redo will also redo the action for all windows.

⚠️ Known Limitations

Single Room: The application is hard-coded to use a single default-room. The backend architecture supports multiple rooms, but the client does not provide a way to select or create them.

No Persistence: The drawing history is stored in server memory. If the server restarts, all drawings are lost.

Clear is Final: The "Clear" button is not an undoable operation. It wipes the server's history completely for that room.

⏱️ Time Spent on Project

"Approximately 12 hours"