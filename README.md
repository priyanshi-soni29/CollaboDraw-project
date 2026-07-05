# CollaboDraw

CollaboDraw is a full-stack real-time collaborative whiteboarding application. It provides an interactive canvas where multiple users can sketch, brainstorm, diagram, and manage tasks together.

## Features

### Workspace & Authentication
* **User Accounts:** Register and log in to manage your personal workspace.
* **Dashboard:** View your saved boards, create new ones, or join existing rooms via a unique room ID.
* **Access Control:** Set boards to be open for anyone to edit, or restricted to just the owner. Room owners can also assign specific roles (Owner, Editor, Viewer) to participants.

### Real-Time Collaboration
* **Live Sync:** See other participants' cursors moving in real-time along with their display names.
* **Spatial Voice Chat:** WebRTC-based peer-to-peer voice chat. The audio volume dynamically adjusts based on how close your cursor is to another user's cursor on the canvas.
* **Live Captions:** Browser-based speech recognition that converts voice to text and displays it as a bubble above the user's cursor.
* **Text Chat & Reactions:** A built-in chat panel for room-wide communication and temporary floating reaction animations.

### Canvas & Drawing Tools
* **Freehand & Flowcharts:** Standard pencil and eraser tools, alongside a dedicated flowchart toolset (rectangles, diamonds, terminals, arrows, etc.).
* **Smart Cleanup:** An AI-inspired tool that takes rough freehand sketches and automatically converts them into clean geometric shapes.
* **Insertions:** Add customizable sticky notes, code blocks, or upload images directly to the board.
* **Templates:** Start with a blank slate or use pre-built Kanban, Retrospective, or Mind Map layouts.
* **Minimap & Navigation:** Navigate large boards easily using the live minimap. Standard zoom and pan controls are included.

### Version Control & History
* **Branching & Merging:** Duplicate a canvas page to a new branch to experiment safely, then merge your changes back into the main board.
* **Time Machine:** Standard undo/redo functionality, plus a complete version history panel allowing you to restore the board to previous states. 
* **Replay:** Animate the board's entire drawing history from start to finish.

### Productivity Extras
* **Focus Timer:** A synchronized countdown timer for timed brainstorming or focus sessions.
* **Laser Pointer:** A temporary drawing tool to highlight areas of the board during presentations without leaving permanent marks.
* **Export:** Download the final canvas as a high-quality PNG or PDF document.
* **Theming:** Full support for both dark and light modes.
* **Focus Mode:** Hides the application UI for a distraction-free drawing experience.

## Tech Stack
* **Frontend:** React, Fabric.js (for HTML5 canvas rendering and manipulation), Socket.io-client.
* **Backend:** Node.js, Express, Socket.io.
* **Storage:** Local JSON file storage (db.json) acting as a lightweight database for users, boards, and room history.
