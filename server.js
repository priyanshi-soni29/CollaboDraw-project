import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, 'db.json');

const PALETTE = ['#ff6ec7', '#7ce8ff', '#ffd97d', '#c9a9ff', '#ff8f70', '#8fd6c4', '#ffb677', '#ff8fb3', '#a3e4ff', '#e2b8ff'];

const app = express();
app.use(cors());
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*", methods: ["GET", "POST"] } });

function loadDb() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
            for (const roomId in raw.rooms || {}) {
                raw.rooms[roomId].users = {};
                if (!Array.isArray(raw.rooms[roomId].extraPages)) {
                    raw.rooms[roomId].extraPages = [];
                }
                if (!Array.isArray(raw.rooms[roomId].pageNames)) {
                    raw.rooms[roomId].pageNames = ['Page 1'];
                }
                if (!Array.isArray(raw.rooms[roomId].chat)) {
                    raw.rooms[roomId].chat = [];
                }
            }
            const users = raw.users || {};
            for (const uname in users) {
                if (typeof users[uname] === 'string') {
                    users[uname] = {
                        password: users[uname],
                        createdAt: Date.now(),
                        color: PALETTE[Object.keys(users).indexOf(uname) % PALETTE.length]
                    };
                }
            }
            return { users, boards: raw.boards || {}, rooms: raw.rooms || {} };
        } catch (e) {
            console.error(e.message);
        }
    }
    return { users: {}, boards: {}, rooms: {} };
}

const db = loadDb();

let saveTimeout = null;
function persist() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        const serializable = {
            users: db.users,
            boards: db.boards,
            rooms: Object.fromEntries(
                Object.entries(db.rooms).map(([id, room]) => [id, {
                    history: room.history,
                    cursor: room.cursor,
                    permissions: room.permissions,
                    extraPages: room.extraPages || [],
                    pageNames: room.pageNames || ['Page 1'],
                    chat: room.chat || [],
                    accessType: room.accessType || 'open'
                }])
            )
        };
        fs.writeFile(DB_FILE, JSON.stringify(serializable), (err) => {
            if (err) console.error(err.message);
        });
    }, 300);
}

function buildTemplateJSON(template) {
    const col = (x, headerText, headerColor) => ([
        { type: 'rect', left: x, top: 40, width: 260, height: 46, rx: 10, ry: 10, fill: headerColor, stroke: null, selectable: false, evented: false, hoverCursor: 'default' },
        { type: 'textbox', left: x + 14, top: 53, width: 232, fontSize: 20, fontWeight: '700', fill: '#241333', fontFamily: 'Quicksand, sans-serif', text: headerText, selectable: false, evented: false, hoverCursor: 'default' },
        { type: 'rect', left: x, top: 96, width: 260, height: 430, rx: 14, ry: 14, fill: 'rgba(255,255,255,0.06)', stroke: headerColor, strokeWidth: 2, strokeDashArray: [8, 6], selectable: false, evented: false, hoverCursor: 'default' }
    ]);

    if (template === 'kanban') {
        return JSON.stringify({
            objects: [
                ...col(40, '📋 To Do', '#7ce8ff'),
                ...col(340, '🚧 In Progress', '#ffd97d'),
                ...col(640, '✅ Done', '#c9a9ff')
            ]
        });
    }
    if (template === 'retro') {
        return JSON.stringify({
            objects: [
                ...col(40, '😀 Went Well', '#8fd6c4'),
                ...col(340, '🤔 To Improve', '#ff8fb3'),
                ...col(640, '🎯 Action Items', '#ffb677')
            ]
        });
    }
    if (template === 'mindmap') {
        const branch = (x1, y1, x2, y2, label, lx, ly, fill) => ([
            { type: 'line', x1, y1, x2, y2, left: Math.min(x1, x2), top: Math.min(y1, y2), stroke: '#c9a9ff', strokeWidth: 3, selectable: false, evented: false, hoverCursor: 'default' },
            { type: 'rect', left: lx, top: ly, width: 160, height: 60, rx: 30, ry: 30, fill, selectable: false, evented: false, hoverCursor: 'default' },
            { type: 'textbox', left: lx + 12, top: ly + 18, width: 136, fontSize: 15, fontWeight: '700', fill: '#241333', fontFamily: 'Quicksand, sans-serif', textAlign: 'center', text: label, selectable: false, evented: false, hoverCursor: 'default' }
        ]);
        const cx = 460, cy = 260;
        return JSON.stringify({
            objects: [
                { type: 'rect', left: cx - 100, top: cy - 40, width: 200, height: 80, rx: 40, ry: 40, fill: '#ff6ec7', selectable: false, evented: false, hoverCursor: 'default' },
                { type: 'textbox', left: cx - 88, top: cy - 14, width: 176, fontSize: 18, fontWeight: '700', fill: '#241333', fontFamily: 'Quicksand, sans-serif', textAlign: 'center', text: '💡 Main Idea', selectable: false, evented: false, hoverCursor: 'default' },
                ...branch(cx - 100, cy - 20, cx - 280, cy - 160, 'Idea 1', cx - 380, cy - 190, '#7ce8ff'),
                ...branch(cx + 100, cy - 20, cx + 280, cy - 160, 'Idea 2', cx + 220, cy - 190, '#ffd97d'),
                ...branch(cx - 100, cy + 20, cx - 280, cy + 160, 'Idea 3', cx - 380, cy + 130, '#c9a9ff'),
                ...branch(cx + 100, cy + 20, cx + 280, cy + 160, 'Idea 4', cx + 220, cy + 130, '#8fd6c4')
            ]
        });
    }
    return null; 
}

function getPageStore(room, pageIndex) {
    const idx = Number(pageIndex) || 0;
    if (idx <= 0) return room;
    if (!room.extraPages) room.extraPages = [];
    while (room.extraPages.length < idx) {
        room.extraPages.push({ history: [], cursor: -1 });
    }
    return room.extraPages[idx - 1];
}

io.on('connection', (socket) => {
    socket.on('register', ({ username, password }, cb) => {
        if (db.users[username]) return cb({ success: false, message: 'Username taken' });
        db.users[username] = {
            password,
            createdAt: Date.now(),
            color: PALETTE[Object.keys(db.users).length % PALETTE.length]
        };
        db.boards[username] = []; 
        persist();
        cb({ success: true });
    });
    
    socket.on('login', ({ username, password }, cb) => {
        const user = db.users[username];
        if (user && user.password === password) {
            cb({
                success: true,
                boards: db.boards[username],
                profile: {
                    username,
                    createdAt: user.createdAt,
                    color: user.color,
                    totalBoards: db.boards[username].length
                }
            });
        }
        else cb({ success: false, message: 'Invalid credentials' });
    });

    socket.on('create-board', ({ username, boardName, template, accessType }, cb) => {
        const id = crypto.randomBytes(4).toString('hex');
        db.boards[username].push({ id, name: boardName });

        const templateJSON = buildTemplateJSON(template);
        db.rooms[id] = { 
            history: templateJSON ? [templateJSON] : [], 
            cursor: templateJSON ? 0 : -1, 
            users: {}, 
            permissions: { [username]: 'owner' },
            extraPages: [],
            pageNames: ['Page 1'],
            chat: [],
            timerEndsAt: null,
            accessType: accessType || 'open'
        };
        persist();
        cb({ success: true, boards: db.boards[username] });
    });
    
    socket.on('delete-board', ({ username, boardId }, cb) => {
        db.boards[username] = db.boards[username].filter(b => b.id !== boardId);
        delete db.rooms[boardId];
        persist();
        cb({ success: true, boards: db.boards[username] });
    });

    socket.on('get-profile', (targetUsername, cb) => {
        const user = db.users[targetUsername];
        if (!user) return cb(null);
        cb({
            username: targetUsername,
            createdAt: user.createdAt,
            color: user.color,
            totalBoards: (db.boards[targetUsername] || []).length
        });
    });

    socket.on('join-room', ({ roomId, username }, cb) => {
        socket.join(roomId);
        if (!db.rooms[roomId]) return cb({ error: 'Room not found' });

        if (!db.rooms[roomId].permissions[username]) {
            const defaultRole = db.rooms[roomId].accessType === 'restricted' ? 'viewer' : 'editor';
            db.rooms[roomId].permissions[username] = defaultRole;
            persist();
        }
        
        const role = db.rooms[roomId].permissions[username];
        db.rooms[roomId].users[socket.id] = { 
            username, 
            color: db.users[username]?.color || ('#' + Math.floor(Math.random()*16777215).toString(16)), 
            role,
            x: -100, y: -100,
            socketId: socket.id 
        };
        
        io.to(roomId).emit('presence-update', db.rooms[roomId].users);
        if (db.rooms[roomId].cursor >= 0) {
            socket.emit('canvas-sync', { pageIndex: 0, canvasJSON: db.rooms[roomId].history[db.rooms[roomId].cursor] });
        }
        socket.emit('history-update', { pageIndex: 0, totalVersions: db.rooms[roomId].history.length, currentIndex: db.rooms[roomId].cursor });

        socket.emit('pages-update', { pageNames: db.rooms[roomId].pageNames || ['Page 1'] });
        socket.emit('chat-history', db.rooms[roomId].chat || []);
        
        if (db.rooms[roomId].timerEndsAt) {
            socket.emit('timer-sync', { endsAt: db.rooms[roomId].timerEndsAt });
        }

        cb({ role });
    });

    socket.on('change-role', ({ roomId, targetUser, newRole }) => {
        const sender = db.rooms[roomId].users[socket.id];
        if (sender && sender.role === 'owner') {
            db.rooms[roomId].permissions[targetUser] = newRole;
            persist();
            for (let sid in db.rooms[roomId].users) {
                if (db.rooms[roomId].users[sid].username === targetUser) {
                    db.rooms[roomId].users[sid].role = newRole;
                    io.to(sid).emit('role-changed', newRole);
                }
            }
            io.to(roomId).emit('presence-update', db.rooms[roomId].users);
        }
    });

    socket.on('cursor-move', ({ roomId, x, y }) => {
        if (db.rooms[roomId] && db.rooms[roomId].users[socket.id]) {
            db.rooms[roomId].users[socket.id].x = x;
            db.rooms[roomId].users[socket.id].y = y;
            socket.to(roomId).emit('cursor-update', { id: socket.id, x, y });
        }
    });

    socket.on('laser-move', ({ roomId, x, y }) => {
        const user = db.rooms[roomId]?.users[socket.id];
        if (!user) return;
        socket.to(roomId).emit('laser-update', { id: socket.id, x, y, color: user.color, username: user.username });
    });
    socket.on('laser-off', ({ roomId }) => {
        socket.to(roomId).emit('laser-off', { id: socket.id });
    });

    socket.on('reaction', ({ roomId, emoji }) => {
        const user = db.rooms[roomId]?.users[socket.id];
        if (!user || !emoji) return;
        io.to(roomId).emit('reaction', { id: socket.id, emoji, username: user.username, color: user.color });
    });

    socket.on('chat-message', ({ roomId, username: sender, message }) => {
        const room = db.rooms[roomId];
        if (!room || !message || !message.trim()) return;
        const entry = { username: sender, message: message.trim().slice(0, 500), timestamp: Date.now() };
        if (!room.chat) room.chat = [];
        room.chat.push(entry);
        if (room.chat.length > 200) room.chat = room.chat.slice(-200);
        persist();
        io.to(roomId).emit('chat-message', entry);
    });

    socket.on('add-page', ({ roomId, name }, cb) => {
        const room = db.rooms[roomId];
        if (!room) return cb && cb({ error: 'Room not found' });
        if (!room.extraPages) room.extraPages = [];
        if (!room.pageNames) room.pageNames = ['Page 1'];
        room.extraPages.push({ history: [], cursor: -1 });
        const newIndex = room.extraPages.length; 
        room.pageNames.push(name || `Page ${newIndex + 1}`);
        persist();
        io.to(roomId).emit('pages-update', { pageNames: room.pageNames });
        cb && cb({ success: true, pageIndex: newIndex, pageNames: room.pageNames });
    });

    socket.on('branch-canvas', ({ roomId, sourcePageIndex, branchName }, cb) => {
        const room = db.rooms[roomId];
        if (!room) return;
        const sourceStore = getPageStore(room, sourcePageIndex);
        
        if (!room.extraPages) room.extraPages = [];
        if (!room.pageNames) room.pageNames = ['Page 1'];
        
        const historyCopy = JSON.parse(JSON.stringify(sourceStore.history));
        
        room.extraPages.push({ history: historyCopy, cursor: sourceStore.cursor });
        const newIndex = room.extraPages.length;
        room.pageNames.push(branchName || `🌿 Branch ${newIndex}`);
        persist();
        
        io.to(roomId).emit('pages-update', { pageNames: room.pageNames });
        cb && cb({ success: true, pageIndex: newIndex, pageNames: room.pageNames });
    });

    socket.on('merge-branch', ({ roomId, branchPageIndex, targetPageIndex }, cb) => {
        const room = db.rooms[roomId];
        if (!room) return;
        
        const branchStore = getPageStore(room, branchPageIndex);
        const targetStore = getPageStore(room, targetPageIndex);
        
        if (branchStore.cursor >= 0) {
            const branchState = branchStore.history[branchStore.cursor];
            if (targetStore.cursor < targetStore.history.length - 1) {
                targetStore.history = targetStore.history.slice(0, targetStore.cursor + 1);
            }
            targetStore.history.push(branchState);
            targetStore.cursor++;
            persist();
            
            socket.to(roomId).emit('canvas-sync', { pageIndex: Number(targetPageIndex) || 0, canvasJSON: branchState });
            io.to(roomId).emit('history-update', { pageIndex: Number(targetPageIndex) || 0, totalVersions: targetStore.history.length, currentIndex: targetStore.cursor });
        }
        cb && cb({ success: true });
    });

    socket.on('switch-page', ({ roomId, pageIndex }, cb) => {
        const room = db.rooms[roomId];
        if (!room) return cb && cb({ error: 'Room not found' });
        const store = getPageStore(room, pageIndex);
        const json = store.cursor >= 0 ? store.history[store.cursor] : null;
        cb && cb({
            success: true,
            canvasJSON: json,
            historyData: { pageIndex: Number(pageIndex) || 0, totalVersions: store.history.length, currentIndex: store.cursor }
        });
    });

    socket.on('push-state', ({ roomId, canvasJSON, pageIndex }) => {
        const user = db.rooms[roomId]?.users[socket.id];
        if (!user || user.role === 'viewer') return; 
        
        const room = db.rooms[roomId];
        const store = getPageStore(room, pageIndex);
        if (store.cursor < store.history.length - 1) store.history = store.history.slice(0, store.cursor + 1);
        store.history.push(canvasJSON);
        store.cursor++;
        persist();
        
        socket.to(roomId).emit('canvas-sync', { pageIndex: Number(pageIndex) || 0, canvasJSON });
        io.to(roomId).emit('history-update', { pageIndex: Number(pageIndex) || 0, totalVersions: store.history.length, currentIndex: store.cursor });
    });

    socket.on('undo', (payload) => {
        const roomId = typeof payload === 'string' ? payload : payload.roomId;
        const pageIndex = typeof payload === 'string' ? 0 : payload.pageIndex;
        const user = db.rooms[roomId]?.users[socket.id];
        if (!user || user.role === 'viewer') return; 
        
        const room = db.rooms[roomId];
        const store = getPageStore(room, pageIndex);
        if (store.cursor > 0) {
            store.cursor--;
            persist();
            io.to(roomId).emit('canvas-sync', { pageIndex: Number(pageIndex) || 0, canvasJSON: store.history[store.cursor] });
            io.to(roomId).emit('history-update', { pageIndex: Number(pageIndex) || 0, totalVersions: store.history.length, currentIndex: store.cursor });
        }
    });

    socket.on('redo', (payload) => {
        const roomId = typeof payload === 'string' ? payload : payload.roomId;
        const pageIndex = typeof payload === 'string' ? 0 : payload.pageIndex;
        const user = db.rooms[roomId]?.users[socket.id];
        if (!user || user.role === 'viewer') return; 
        
        const room = db.rooms[roomId];
        const store = getPageStore(room, pageIndex);
        if (store.cursor < store.history.length - 1) {
            store.cursor++;
            persist();
            io.to(roomId).emit('canvas-sync', { pageIndex: Number(pageIndex) || 0, canvasJSON: store.history[store.cursor] });
            io.to(roomId).emit('history-update', { pageIndex: Number(pageIndex) || 0, totalVersions: store.history.length, currentIndex: store.cursor });
        }
    });

    socket.on('clear', (payload) => {
        const roomId = typeof payload === 'string' ? payload : payload.roomId;
        const pageIndex = typeof payload === 'string' ? 0 : payload.pageIndex;
        const user = db.rooms[roomId]?.users[socket.id];
        if (!user || user.role === 'viewer') return; 
        
        const room = db.rooms[roomId];
        const store = getPageStore(room, pageIndex);
        store.history.push(JSON.stringify({ objects: [] }));
        store.cursor++;
        persist();
        io.to(roomId).emit('clear-canvas', { pageIndex: Number(pageIndex) || 0 });
        io.to(roomId).emit('history-update', { pageIndex: Number(pageIndex) || 0, totalVersions: store.history.length, currentIndex: store.cursor });
    });

    socket.on('restore-version', ({ roomId, versionIndex, pageIndex }) => {
        const user = db.rooms[roomId]?.users[socket.id];
        if (!user || user.role === 'viewer') return; 
        
        const room = db.rooms[roomId];
        const store = getPageStore(room, pageIndex);
        if (versionIndex >= 0 && versionIndex < store.history.length) {
            store.cursor = versionIndex;
            persist();
            io.to(roomId).emit('canvas-sync', { pageIndex: Number(pageIndex) || 0, canvasJSON: store.history[store.cursor] });
            io.to(roomId).emit('history-update', { pageIndex: Number(pageIndex) || 0, totalVersions: store.history.length, currentIndex: store.cursor });
        }
    });

    socket.on('start-timer', ({ roomId, minutes }) => {
        const room = db.rooms[roomId];
        if (room) {
            room.timerEndsAt = Date.now() + (minutes * 60000);
            io.to(roomId).emit('timer-sync', { endsAt: room.timerEndsAt });
        }
    });

    socket.on('stop-timer', ({ roomId }) => {
        const room = db.rooms[roomId];
        if (room) {
            room.timerEndsAt = null;
            io.to(roomId).emit('timer-sync', { endsAt: null });
        }
    });

    socket.on('caption', ({ roomId, text }) => {
        const user = db.rooms[roomId]?.users[socket.id];
        if (!user || !text) return;
        socket.to(roomId).emit('caption', { id: socket.id, text, username: user.username, color: user.color });
    });

    socket.on('webrtc-signal', ({ targetId, signal }) => {
        io.to(targetId).emit('webrtc-signal', { fromId: socket.id, signal });
    });

    socket.on('disconnect', () => {
        for (const roomId in db.rooms) {
            if (db.rooms[roomId].users[socket.id]) {
                delete db.rooms[roomId].users[socket.id];
                io.to(roomId).emit('presence-update', db.rooms[roomId].users);
                socket.to(roomId).emit('laser-off', { id: socket.id });
                socket.to(roomId).emit('peer-disconnected', socket.id);
            }
        }
    });
});
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Pro Server running on ${PORT}`));