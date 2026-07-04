import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { fabric } from 'fabric';
import jsPDF from 'jspdf';
import throttle from 'lodash/throttle';
import './App.css';


let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  return audioCtx;
}
function playTone(freq = 440, duration = 0.12, type = 'sine', gain = 0.08, delay = 0) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g); g.connect(ctx.destination);
  const startAt = ctx.currentTime + delay;
  g.gain.setValueAtTime(gain, startAt);
  g.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}
const SFX = {
  click: () => playTone(700, 0.05, 'square', 0.04),
  success: () => { playTone(523, 0.1, 'sine', 0.07); playTone(784, 0.14, 'sine', 0.07, 0.1); },
  error: () => playTone(150, 0.25, 'sawtooth', 0.06),
  join: () => { playTone(660, 0.08, 'sine', 0.06); playTone(880, 0.1, 'sine', 0.06, 0.08); },
  leave: () => { playTone(500, 0.09, 'sine', 0.05); playTone(350, 0.12, 'sine', 0.05, 0.07); },
  tick: () => playTone(300, 0.04, 'sine', 0.025),
  undo: () => playTone(400, 0.08, 'triangle', 0.05),
  redo: () => playTone(500, 0.08, 'triangle', 0.05),
  clear: () => { playTone(300, 0.15, 'sawtooth', 0.05); playTone(200, 0.2, 'sawtooth', 0.04, 0.05); },
  role: () => { playTone(600, 0.1, 'sine', 0.06); playTone(900, 0.12, 'sine', 0.06, 0.09); },
  message: () => { playTone(880, 0.06, 'sine', 0.05); playTone(1046, 0.07, 'sine', 0.04, 0.05); },
  sticky: () => { playTone(740, 0.07, 'triangle', 0.05); },
  page: () => { playTone(500, 0.06, 'sine', 0.05); playTone(700, 0.08, 'sine', 0.05, 0.06); },
  laser: () => playTone(1200, 0.03, 'sine', 0.02),
  theme: () => { playTone(600, 0.07, 'sine', 0.05); playTone(950, 0.09, 'sine', 0.05, 0.07); },
  timerDone: () => { playTone(880, 0.4, 'sine', 0.08); playTone(1046, 0.4, 'sine', 0.08, 0.5); } 
};
function useSound(mutedRef) {
  return (name) => { if (!mutedRef.current && SFX[name]) SFX[name](); };
}

const socket = io('http://localhost:3001');

const STICKY_COLORS = ['#fff6a3', '#ffd6e8', '#c6f7d0', '#c6e6ff', '#ffe0c2'];

export default function App() {
  const [view, setView] = useState('landing'); 
  const [isPopping, setIsPopping] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);

  const quotes = [
    '"Every child is an artist. The problem is how to remain an artist once we grow up." – Pablo Picasso',
    '"Art is not what you see, but what you make others see." – Edgar Degas',
    '"Drawing is the honesty of the art. There is no possibility of cheating." – Salvador Dalí',
    '"Creativity takes courage." – Henri Matisse'
  ];

  useEffect(() => {
    if (view !== 'landing') return;
    const interval = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % quotes.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [view, quotes.length]);
  
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  
  const [myBoards, setMyBoards] = useState([]);
  const [newBoardName, setNewBoardName] = useState('');
  const [joinBoardId, setJoinBoardId] = useState('');
  
  const [activeRoomId, setActiveRoomId] = useState('');
  const [activeUsers, setActiveUsers] = useState({});
  const [myRole, setMyRole] = useState('editor'); 
  const [canvas, setCanvas] = useState(null);
  
  const [tool, setTool] = useState('select');
  const [color, setColor] = useState('#00ffcc');
  const [lineWidth, setLineWidth] = useState(3);
  const [showDrawTools, setShowDrawTools] = useState(false);
  const [showFlowchartTools, setShowFlowchartTools] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [reactions, setReactions] = useState([]);
  
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState({ totalVersions: 0, currentIndex: -1 });
  const [focusMode, setFocusMode] = useState(false);

  const [showMinimap, setShowMinimap] = useState(true);
  const minimapStaticRef = useRef(null); 
  const [viewportBox, setViewportBox] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const MINIMAP_W = 170, MINIMAP_H = 120;

  const [boardTemplate, setBoardTemplate] = useState('blank');
  const [isReplaying, setIsReplaying] = useState(false);
  const replayStopRef = useRef(false);
  const [captions, setCaptions] = useState({}); 
  const speechRecognitionRef = useRef(null);
  const [showQR, setShowQR] = useState(false);
  const isUpdatingFromServer = useRef(false);
  const hasLoadedCanvasOnce = useRef(false);
  const prevUserCount = useRef(null);
  const suppressNextTick = useRef(false);

  const [profile, setProfile] = useState(null); 
  const [viewingProfile, setViewingProfile] = useState(null); 
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem('collabodraw_muted') === 'true');
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const [toasts, setToasts] = useState([]);
  const sound = useSound(mutedRef);

  const toggleMute = () => {
    setMuted(prev => {
      localStorage.setItem('collabodraw_muted', String(!prev));
      return !prev;
    });
  };

  const handleLandingClick = () => {
    if (isPopping) return;
    setIsPopping(true);
    sound('success'); 
    setTimeout(() => {
      setView('auth');
      setIsPopping(false);
    }, 800); 
  };
  
  const showToast = (message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200);
  };

  const openProfile = (targetUsername) => {
    if (targetUsername === username && profile) { setViewingProfile(profile); return; }
    socket.emit('get-profile', targetUsername, (data) => {
      if (data) setViewingProfile(data);
    });
  };

  const findActiveRole = (targetUsername) => {
    const entry = Object.values(activeUsers).find(u => u.username === targetUsername);
    return entry ? entry.role : null;
  };

  const toggleFocusMode = () => {
    setFocusMode(prev => {
      sound('click');
      showToast(prev ? 'Focus Mode off' : '🎯 Focus Mode on — press again to bring back your tools', 'info');
      return !prev;
    });
  };

  const [theme, setTheme] = useState(() => localStorage.getItem('collabodraw_theme') || 'dark');
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('collabodraw_theme', next);
      sound('theme');
      return next;
    });
  };

  
  useEffect(() => {
    if (!canvas) return;
    canvas.backgroundColor = 'transparent';
    canvas.renderAll();
  }, [theme, canvas]);

  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
      const timer = setInterval(() => setCurrentTime(new Date()), 1000);
      return () => clearInterval(timer);
  }, []);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadChat, setUnreadChat] = useState(0);
  const chatEndRef = useRef(null);
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;

  const sendChatMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('chat-message', { roomId: activeRoomId, username, message: chatInput });
    setChatInput('');
  };

  useEffect(() => {
    if (chatOpen && chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatOpen]);

  
  const [pageNames, setPageNames] = useState(['Page 1']);
  const [activePage, setActivePage] = useState(0);
  const activePageRef = useRef(0);
  activePageRef.current = activePage;

  const addPage = () => {
    if (myRole === 'viewer') return;
    const name = `Page ${pageNames.length + 1}`;
    socket.emit('add-page', { roomId: activeRoomId, name }, (res) => {
      if (res && res.success) {
        sound('page');
        setPageNames(res.pageNames);
        switchPage(res.pageIndex);
      }
    });
  };

  const branchCanvas = () => {
    if (myRole === 'viewer') return;
    const branchName = prompt("Name your new branch:", `🌿 Branch of ${pageNames[activePage]}`);
    if (!branchName) return;
    socket.emit('branch-canvas', { roomId: activeRoomId, sourcePageIndex: activePage, branchName }, (res) => {
      if (res && res.success) {
        sound('success');
        showToast(`Branched to ${branchName}`, 'success');
        setPageNames(res.pageNames);
        switchPage(res.pageIndex);
      }
    });
  };

  const mergeBranch = () => {
    if (myRole === 'viewer' || activePage === 0) return;
    if (window.confirm(`Merge this branch back to the Main Board (Page 1)?`)) {
        socket.emit('merge-branch', { roomId: activeRoomId, branchPageIndex: activePage, targetPageIndex: 0 }, (res) => {
            if (res && res.success) {
                sound('success');
                showToast(`Branch merged to Main Board!`, 'success');
                switchPage(0); 
            }
        });
    }
  };

  const switchPage = (idx) => {
    if (!canvas || idx === activePageRef.current) { setActivePage(idx); return; }
    sound('page');
    socket.emit('switch-page', { roomId: activeRoomId, pageIndex: idx }, (res) => {
      if (!res || !res.success) return;
      setActivePage(idx);
      isUpdatingFromServer.current = true;
      if (res.canvasJSON) {
        
        canvas.loadFromJSON(res.canvasJSON, () => { canvas.backgroundColor = 'transparent'; canvas.renderAll(); isUpdatingFromServer.current = false; });
      } else {
        canvas.clear();
        canvas.backgroundColor = 'transparent'; 
        canvas.renderAll();
        isUpdatingFromServer.current = false;
      }
      setHistoryData(res.historyData);
    });
  };

  const [laserPoints, setLaserPoints] = useState({}); 
  useEffect(() => {
    const interval = setInterval(() => {
      setLaserPoints(prev => {
        const now = Date.now();
        const next = {};
        let changed = false;
        for (const id in prev) {
          if (now - prev[id].ts < 1500) next[id] = prev[id];
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 400);
    return () => clearInterval(interval);
  }, []);

  const [timerEndsAt, setTimerEndsAt] = useState(null);
  const [timeLeftStr, setTimeLeftStr] = useState('00:00');

  useEffect(() => {
    if (!timerEndsAt) { setTimeLeftStr('00:00'); return; }
    const interval = setInterval(() => {
        const remaining = Math.max(0, timerEndsAt - Date.now());
        if (remaining === 0) {
            setTimeLeftStr('00:00');
            setTimerEndsAt(null);
            sound('timerDone');
            showToast("Focus Timer Complete!", "success");
            clearInterval(interval);
            return;
        }
        const m = Math.floor(remaining / 60000).toString().padStart(2, '0');
        const s = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
        setTimeLeftStr(`${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerEndsAt]);

  const startTimer = (minutes) => {
      socket.emit('start-timer', { roomId: activeRoomId, minutes });
  };
  const stopTimer = () => socket.emit('stop-timer', { roomId: activeRoomId });

  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const localStreamRef = useRef(null);
  const peersRef = useRef({}); 
  const activeUsersRef = useRef(activeUsers);
  activeUsersRef.current = activeUsers; 

  const stopVoice = () => {
      setVoiceEnabled(false);
      if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => t.stop());
          localStreamRef.current = null;
      }
      Object.values(peersRef.current).forEach(pc => pc.close());
      peersRef.current = {};
      document.querySelectorAll('.remote-audio').forEach(el => el.remove());
      stopCaptions(); 
  };

  const startVoice = async () => {
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          localStreamRef.current = stream;
          setVoiceEnabled(true);
          showToast('Voice Chat Enabled! Move closer to others to hear them.', 'success');
          startCaptions(); 

          Object.values(activeUsersRef.current).forEach(user => {
              if (user.socketId && user.socketId !== socket.id) {
                  createPeerConnection(user.socketId, true);
              }
          });
      } catch (err) {
          showToast('Microphone access denied', 'error');
      }
  };

  const createPeerConnection = (targetId, isInitiator) => {
      if (peersRef.current[targetId]) return peersRef.current[targetId];

      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      peersRef.current[targetId] = pc;

      if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
      }

      pc.onicecandidate = (event) => {
          if (event.candidate) {
              socket.emit('webrtc-signal', { targetId, signal: { type: 'ice', candidate: event.candidate } });
          }
      };

      pc.ontrack = (event) => {
          let audioEl = document.getElementById(`audio-${targetId}`);
          if (!audioEl) {
              audioEl = document.createElement('audio');
              audioEl.id = `audio-${targetId}`;
              audioEl.className = 'remote-audio';
              audioEl.autoplay = true;
              document.body.appendChild(audioEl);
          }
          audioEl.srcObject = event.streams[0];
      };

      if (isInitiator) {
          pc.createOffer().then(offer => {
              pc.setLocalDescription(offer);
              socket.emit('webrtc-signal', { targetId, signal: offer });
          });
      }
      return pc;
  };

  useEffect(() => {
      if (!voiceEnabled || view !== 'canvas') return;
      
      const updateVolumes = () => {
          const me = activeUsersRef.current[socket.id];
          if (!me || me.x === -100) return;

          Object.entries(activeUsersRef.current).forEach(([id, user]) => {
              if (id === socket.id || user.x === -100) return;
              
              const audioEl = document.getElementById(`audio-${id}`);
              if (audioEl) {
                  const dist = Math.hypot(me.x - user.x, me.y - user.y);
                  const MAX_DIST = 800; 
                  let vol = 1 - (dist / MAX_DIST);
                  vol = Math.max(0, Math.min(1, vol)); 
                  audioEl.volume = vol;
              }
          });
      };
      
      const interval = setInterval(updateVolumes, 100);
      return () => clearInterval(interval);
  }, [voiceEnabled, view]);

  const canvasRef = useRef(null);
  canvasRef.current = canvas;
  
  const handleToolChange = (newTool) => {
      setTool(newTool);
      if (newTool !== 'select' && canvasRef.current) {
          canvasRef.current.discardActiveObject();
          canvasRef.current.renderAll();
      }
  };

  const [showShortcuts, setShowShortcuts] = useState(false);
  const toolStateRef = useRef({ myRole, activeRoomId, activePage });
  toolStateRef.current = { myRole, activeRoomId, activePage };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (view !== 'canvas') return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return; 

      const c = canvasRef.current;
      const { myRole: role, activeRoomId: roomId, activePage: pageIdx } = toolStateRef.current;
      const canEdit = role === 'owner' || role === 'editor';
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (!canEdit) return;
        sound('undo'); suppressNextTick.current = true;
        socket.emit('undo', { roomId, pageIndex: pageIdx });
      } else if ((mod && e.key.toLowerCase() === 'y') || (mod && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        if (!canEdit) return;
        sound('redo'); suppressNextTick.current = true;
        socket.emit('redo', { roomId, pageIndex: pageIdx });
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && c && canEdit) {
        const active = c.getActiveObjects();
        if (active && active.length) { 
          e.preventDefault(); 
          sound('click');
          active.forEach(obj => c.remove(obj)); 
          c.discardActiveObject(); 
          c.renderAll(); 
        }
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        exportFormat('png');
      } else if ((e.key === '+' || e.key === '=') && c) {
        e.preventDefault();
        c.setZoom(Math.min(c.getZoom() * 1.1, 5));
      } else if (e.key === '-' && c) {
        e.preventDefault();
        c.setZoom(Math.max(c.getZoom() / 1.1, 0.2));
      } else if (e.key === '0' && mod && c) {
        e.preventDefault();
        c.setZoom(1);
      } else if (canEdit && !mod) {
        const map = { v: 'select', p: 'pencil', e: 'eraser', l: 'line', r: 'rect', c: 'circle', t: 'text' };
        const k = e.key.toLowerCase();
        if (map[k]) handleToolChange(map[k]);
        else if (k === 'n') addSticky();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && username && view === 'dashboard') enterBoard(roomParam);
  }, [username, view]);

  const handleAuth = (e) => {
    e.preventDefault();
    setAuthError('');
    socket.emit(isLogin ? 'login' : 'register', { username, password }, (res) => {
      if (res.success) {
        sound('success');
        if (isLogin) { setMyBoards(res.boards); setProfile(res.profile || null); setView('dashboard'); }
        else { setAuthError('Account created! Please log in.'); setIsLogin(true); }
      } else { setAuthError(res.message); sound('error'); }
    });
  };

  const createBoard = (e) => {
    e.preventDefault();
    if (!newBoardName) return;
    socket.emit('create-board', { username, boardName: newBoardName, template: boardTemplate }, (res) => {
      if (res.success) {
        setMyBoards(res.boards); setNewBoardName(''); setBoardTemplate('blank');
        sound('success');
        showToast(`Board "${newBoardName}" created`, 'success');
        setProfile(prev => prev ? { ...prev, totalBoards: res.boards.length } : prev);
      }
    });
  };

  const deleteBoard = (id) => {
    socket.emit('delete-board', { username, boardId: id }, (res) => {
      if (res.success) {
        setMyBoards(res.boards);
        sound('click');
        setProfile(prev => prev ? { ...prev, totalBoards: res.boards.length } : prev);
      }
    });
  };

  const enterBoard = (boardId) => {
    setActiveRoomId(boardId);
    setView('canvas');
    setShowWelcomeModal(true); 
    window.history.pushState({}, '', `?room=${boardId}`);
  };

  useEffect(() => {
    if (view !== 'canvas') return;
    hasLoadedCanvasOnce.current = false;
    prevUserCount.current = null;
    setActivePage(0);
    setChatMessages([]);
    setUnreadChat(0);
    setLaserPoints({});
    setTimerEndsAt(null);
    setReactions([]);
    
    const wrapper = document.getElementById('canvas-wrapper');
    const initW = wrapper ? wrapper.clientWidth : window.innerWidth - 150;
    const initH = wrapper ? wrapper.clientHeight : window.innerHeight - 150;

  
    const initCanvas = new fabric.Canvas('fabric-canvas', { 
        width: initW, height: initH, backgroundColor: 'transparent', selection: true 
    });
    setCanvas(initCanvas);

    const pushState = () => {
      if (isUpdatingFromServer.current) return;
      socket.emit('push-state', { roomId: activeRoomId, canvasJSON: JSON.stringify(initCanvas.toJSON()), pageIndex: activePageRef.current });
    };

    initCanvas.on('path:created', pushState); 
    initCanvas.on('object:modified', pushState);
    initCanvas.on('object:added', pushState);
    initCanvas.on('object:removed', pushState);

    const handleMouseMove = throttle((opt) => {
      const pointer = initCanvas.getPointer(opt.e);
      socket.emit('cursor-move', { roomId: activeRoomId, x: pointer.x, y: pointer.y });
      if (toolRef.current === 'laser') {
        socket.emit('laser-move', { roomId: activeRoomId, x: pointer.x, y: pointer.y });
      }
    }, 30);
    initCanvas.on('mouse:move', handleMouseMove);
    initCanvas.on('mouse:out', () => { if (toolRef.current === 'laser') socket.emit('laser-off', { roomId: activeRoomId }); });

    socket.on('canvas-sync', (payload) => {
      const pageIndex = typeof payload === 'string' ? 0 : payload.pageIndex;
      const jsonString = typeof payload === 'string' ? payload : payload.canvasJSON;
      if ((pageIndex || 0) !== activePageRef.current) return; 
      isUpdatingFromServer.current = true;
      initCanvas.loadFromJSON(jsonString, () => {
        initCanvas.backgroundColor = 'transparent'; // UPDATED
        initCanvas.renderAll(); isUpdatingFromServer.current = false;
        if (hasLoadedCanvasOnce.current && !suppressNextTick.current) sound('tick');
        suppressNextTick.current = false;
        hasLoadedCanvasOnce.current = true;
      });
    });

    socket.on('clear-canvas', (payload) => {
        const pageIndex = typeof payload === 'object' && payload !== null ? payload.pageIndex : 0;
        if ((pageIndex || 0) !== activePageRef.current) return;
        isUpdatingFromServer.current = true; initCanvas.clear(); initCanvas.backgroundColor = 'transparent'; // UPDATED
        initCanvas.renderAll(); isUpdatingFromServer.current = false; 
        sound('clear');
    });
    
    socket.on('presence-update', (users) => {
      setActiveUsers(users);
      const count = Object.keys(users).length;
      if (prevUserCount.current !== null) {
        if (count > prevUserCount.current) sound('join');
        else if (count < prevUserCount.current) sound('leave');
      }
      prevUserCount.current = count;
    });
    socket.on('cursor-update', ({ id, x, y }) => setActiveUsers(prev => prev[id] ? { ...prev, [id]: { ...prev[id], x, y } } : prev));
    socket.on('history-update', (data) => { if ((data.pageIndex || 0) === activePageRef.current) setHistoryData(data); });
    socket.on('role-changed', (newRole) => {
      setMyRole(newRole);
      sound('role');
      showToast(`Your permission is now: ${newRole.toUpperCase()}`, 'info');
    });

    socket.on('chat-history', (history) => setChatMessages(history || []));
    socket.on('chat-message', (entry) => {
      setChatMessages(prev => [...prev, entry]);
      if (entry.username !== username) {
        sound('message');
        if (!chatOpenRef.current) setUnreadChat(prev => prev + 1);
      }
    });

    socket.on('pages-update', ({ pageNames }) => setPageNames(pageNames));

    socket.on('laser-update', ({ id, x, y, color, username: u }) => {
      setLaserPoints(prev => ({ ...prev, [id]: { x, y, color, username: u, ts: Date.now() } }));
    });
    socket.on('laser-off', ({ id }) => {
      setLaserPoints(prev => { const next = { ...prev }; delete next[id]; return next; });
    });

    socket.on('reaction', ({ id, emoji, username: u, color: c }) => {
      const reactionId = `${id}-${Date.now()}-${Math.random()}`;
      setReactions(prev => [...prev, { id: reactionId, emoji, username: u, color: c, left: 10 + Math.random() * 80 }]);
      setTimeout(() => {
        setReactions(prev => prev.filter(r => r.id !== reactionId));
      }, 2200);
    });

    socket.on('timer-sync', ({ endsAt }) => {
        setTimerEndsAt(endsAt);
    });

    socket.on('webrtc-signal', async ({ fromId, signal }) => {
        const pc = createPeerConnection(fromId, false);
        if (signal.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('webrtc-signal', { targetId: fromId, signal: answer });
        } else if (signal.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
        } else if (signal.type === 'ice') {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
    });

    socket.on('peer-disconnected', (id) => {
        if (peersRef.current[id]) {
            peersRef.current[id].close();
            delete peersRef.current[id];
        }
        const audioEl = document.getElementById(`audio-${id}`);
        if (audioEl) audioEl.remove();
    });

    socket.on('caption', ({ id, text, username: u, color: c }) => {
        setCaptions(prev => ({ ...prev, [id]: { text, username: u, color: c, ts: Date.now() } }));
    });

    const resize = () => {
       const wr = document.getElementById('canvas-wrapper');
       if (wr) initCanvas.setDimensions({ width: wr.clientWidth, height: wr.clientHeight });
    };
    window.addEventListener('resize', resize);
    setTimeout(resize, 100);

    socket.emit('join-room', { roomId: activeRoomId, username }, (res) => {
      if (res.role) setMyRole(res.role);
    });

    return () => {
      socket.off('canvas-sync'); socket.off('clear-canvas'); socket.off('presence-update'); 
      socket.off('cursor-update'); socket.off('history-update'); socket.off('role-changed');
      socket.off('chat-history'); socket.off('chat-message'); socket.off('pages-update');
      socket.off('laser-update'); socket.off('laser-off'); socket.off('timer-sync');
      socket.off('webrtc-signal'); socket.off('peer-disconnected'); socket.off('reaction'); socket.off('caption');
      window.removeEventListener('resize', resize);
      stopVoice();
      stopCaptions();
      try { initCanvas.dispose(); } catch (e) { console.log("Cleanup safe"); }
    };
  }, [view, activeRoomId]); 

  useEffect(() => {
    if (!canvas || view !== 'canvas' || !showMinimap) { minimapStaticRef.current = null; return; }
    if (!document.getElementById('minimap-canvas')) return; 

    const mini = new fabric.StaticCanvas('minimap-canvas', {
      width: MINIMAP_W, height: MINIMAP_H,
      backgroundColor: themeRef.current === 'light' ? '#ffffff' : '#0b0c10',
      selection: false,
    });
    minimapStaticRef.current = mini;

    const syncMinimap = () => {
      if (!minimapStaticRef.current) return;
      const scale = Math.min(MINIMAP_W / Math.max(canvas.width, 1), MINIMAP_H / Math.max(canvas.height, 1));
      try {
        const json = canvas.toJSON();
        mini.loadFromJSON(json, () => {
          mini.setZoom(scale);
          mini.setDimensions({ width: MINIMAP_W, height: MINIMAP_H });
          mini.backgroundColor = themeRef.current === 'light' ? '#ffffff' : '#0b0c10';
          mini.renderAll();
        });
      } catch (e) {}

      const zoom = canvas.getZoom();
      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const worldLeft = -vpt[4] / zoom;
      const worldTop = -vpt[5] / zoom;
      const worldW = canvas.width / zoom;
      const worldH = canvas.height / zoom;
      setViewportBox({
        left: worldLeft * scale, top: worldTop * scale,
        width: Math.min(worldW * scale, MINIMAP_W), height: Math.min(worldH * scale, MINIMAP_H)
      });
    };

    syncMinimap();
    const interval = setInterval(syncMinimap, 900); 
    return () => { clearInterval(interval); try { mini.dispose(); } catch (e) {} minimapStaticRef.current = null; };
  }, [canvas, view, activePage, showMinimap]);

  const handleMinimapClick = (e) => {
    if (!canvas) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const scale = Math.min(MINIMAP_W / Math.max(canvas.width, 1), MINIMAP_H / Math.max(canvas.height, 1));
    const targetWorldX = clickX / scale;
    const targetWorldY = clickY / scale;
    const zoom = canvas.getZoom();
    const newX = -(targetWorldX * zoom - canvas.width / 2);
    const newY = -(targetWorldY * zoom - canvas.height / 2);
    canvas.setViewportTransform([zoom, 0, 0, zoom, newX, newY]);
    sound('click');
  };

  const startReplay = () => {
    if (myRole === 'viewer' || isReplaying || !historyData.totalVersions) return;
    setIsReplaying(true);
    replayStopRef.current = false;
    showToast('▶️ Replaying board history…', 'info');
    let idx = 0;
    const step = () => {
      if (replayStopRef.current || idx >= historyData.totalVersions) {
        setIsReplaying(false);
        if (!replayStopRef.current) showToast('Replay finished!', 'success');
        return;
      }
      socket.emit('restore-version', { roomId: activeRoomId, versionIndex: idx, pageIndex: activePage });
      idx++;
      setTimeout(step, 650);
    };
    step();
  };
  const stopReplay = () => { replayStopRef.current = true; setIsReplaying(false); };

  const startCaptions = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast('Live captions need Chrome (Web Speech API not supported here)', 'info'); return; }
    try {
      const recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.onresult = (event) => {
        const result = event.results[event.results.length - 1];
        const text = result[0].transcript.trim();
        if (!text) return;
        socket.emit('caption', { roomId: activeRoomId, text });
        setCaptions(prev => ({ ...prev, [socket.id]: { text, username, color: '#7ce8ff', ts: Date.now() } }));
      };
      recognition.onerror = () => {}; 
      recognition.onend = () => { if (speechRecognitionRef.current) { try { recognition.start(); } catch (e) {} } }; 
      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch (e) {}
  };
  const stopCaptions = () => {
    if (speechRecognitionRef.current) {
      const r = speechRecognitionRef.current;
      speechRecognitionRef.current = null; 
      try { r.stop(); } catch (e) {}
    }
  };
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCaptions(prev => {
        const now = Date.now();
        const next = {};
        let changed = false;
        for (const id in prev) {
          if (now - prev[id].ts < 4000) next[id] = prev[id];
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const toolRef = useRef(tool);
  toolRef.current = tool;

  useEffect(() => {
    if (!canvas || view !== 'canvas') return;
    
    const canEdit = myRole === 'owner' || myRole === 'editor';
    
    canvas.isDrawingMode = false;
    canvas.selection = canEdit && tool === 'select';
    
    canvas.forEachObject(obj => { 
        if (obj.selectable !== false) {
           obj.selectable = (canEdit && tool === 'select'); 
           obj.evented = (canEdit && tool === 'select'); 
        }
    });
    
    if (canEdit && (tool === 'pencil' || tool === 'eraser')) {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush.color = tool === 'eraser' ? (theme === 'light' ? '#ffffff' : '#0b0c10') : color;
      canvas.freeDrawingBrush.width = tool === 'eraser' ? parseInt(lineWidth) * 3 : parseInt(lineWidth);
    }
    canvas.defaultCursor = tool === 'laser' ? 'crosshair' : 'default';
  }, [tool, color, lineWidth, canvas, view, myRole, theme]);

  const addObject = (type) => {
    if (myRole === 'viewer') return;
    handleToolChange('select');
    let obj;
    const center = canvas.getCenter();
    if (type === 'rect') obj = new fabric.Rect({ left: center.left, top: center.top, fill: 'transparent', stroke: color, strokeWidth: parseInt(lineWidth), width: 100, height: 100 });
    else if (type === 'circle') obj = new fabric.Circle({ left: center.left, top: center.top, fill: 'transparent', stroke: color, strokeWidth: parseInt(lineWidth), radius: 50 });
    else if (type === 'line') obj = new fabric.Line([50, 100, 200, 200], { left: center.left, top: center.top, stroke: color, strokeWidth: parseInt(lineWidth) });
    else if (type === 'text') obj = new fabric.IText('Double Click', { left: center.left, top: center.top, fill: color });
    else if (type === 'diamond') obj = new fabric.Polygon(
      [{ x: 70, y: 0 }, { x: 140, y: 45 }, { x: 70, y: 90 }, { x: 0, y: 45 }],
      { left: center.left, top: center.top, fill: 'transparent', stroke: color, strokeWidth: parseInt(lineWidth) }
    );
    else if (type === 'terminal') obj = new fabric.Rect({ left: center.left, top: center.top, fill: 'transparent', stroke: color, strokeWidth: parseInt(lineWidth), width: 150, height: 60, rx: 30, ry: 30 });
    else if (type === 'parallelogram') obj = new fabric.Polygon(
      [{ x: 25, y: 0 }, { x: 150, y: 0 }, { x: 125, y: 70 }, { x: 0, y: 70 }],
      { left: center.left, top: center.top, fill: 'transparent', stroke: color, strokeWidth: parseInt(lineWidth) }
    );
    else if (type === 'arrow') {
      const shaft = new fabric.Line([0, 15, 90, 15], { stroke: color, strokeWidth: parseInt(lineWidth) });
      const head = new fabric.Triangle({ left: 78, top: 0, width: 20, height: 20, fill: color, angle: 90 });
      obj = new fabric.Group([shaft, head], { left: center.left, top: center.top });
    }
    
    if (obj) { canvas.add(obj); canvas.setActiveObject(obj); if (type !== 'line') sound('click'); }
  };

  const stickyIndexRef = useRef(0);
  const addSticky = () => {
    if (myRole === 'viewer' || !canvas) return;
    handleToolChange('select');
    const center = canvas.getCenter();
    const bg = STICKY_COLORS[stickyIndexRef.current % STICKY_COLORS.length];
    stickyIndexRef.current++;
    const note = new fabric.Rect({
      width: 180, height: 180, fill: bg, rx: 6, ry: 6,
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.35)', blur: 12, offsetX: 3, offsetY: 5 })
    });
    const text = new fabric.Textbox('Double-click to edit…', {
      width: 150, left: 15, top: 15, fontSize: 16, fill: '#2b2140', fontFamily: 'Quicksand, sans-serif'
    });
    const group = new fabric.Group([note, text], {
      left: center.left - 90 + (Math.random() * 40 - 20),
      top: center.top - 90 + (Math.random() * 40 - 20),
    });
    group.on('mousedblclick', () => {
      canvas.remove(group);
      const editable = new fabric.Textbox(text.text === 'Double-click to edit…' ? '' : text.text, {
        left: group.left, top: group.top, width: 180, height: 180, fontSize: 16,
        fill: '#2b2140', fontFamily: 'Quicksand, sans-serif', backgroundColor: bg, padding: 15,
      });
      canvas.add(editable); canvas.setActiveObject(editable); editable.enterEditing();
    });
    canvas.add(group);
    canvas.setActiveObject(group);
    sound('sticky');
  };

  const addCodeBlock = () => {
    if (myRole === 'viewer' || !canvas) return;
    handleToolChange('select');
    const center = canvas.getCenter();
    
    const codeSnippet = new fabric.Textbox('// Double click to write code\nfunction hello() {\n  console.log("world");\n}', {
      left: center.left - 150,
      top: center.top - 80,
      width: 300,
      fontSize: 15,
      fontFamily: '"Fira Code", monospace',
      fill: '#d4d4d4',
      backgroundColor: '#1e1e1e',
      padding: 20,
      rx: 8,
      ry: 8,
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.5)', blur: 15, offsetX: 5, offsetY: 5 })
    });

    canvas.add(codeSnippet);
    canvas.setActiveObject(codeSnippet);
    sound('click');
  };

  const handleImageUpload = (e) => {
    if (myRole === 'viewer') return;
    const reader = new FileReader();
    reader.onload = (f) => { fabric.Image.fromURL(f.target.result, (img) => { img.scaleToWidth(300); canvas.add(img); canvas.setActiveObject(img); handleToolChange('select'); }); };
    reader.readAsDataURL(e.target.files[0]);
  };

  const AI_MUSE_PROMPTS = [
    "🏰 A floating castle in the clouds", "🐉 A friendly dragon guarding a library",
    "🚀 A rocket ship made of fruit", "🌊 An underwater city lit by jellyfish",
    "🎪 A circus run entirely by cats", "🌵 A desert oasis with rainbow palm trees",
    "🤖 A robot learning to paint", "🍕 A pizza planet with cheese volcanoes",
    "🦄 A unicorn skateboarding through a city", "🏙️ A city where the buildings are books",
    "🎈 A hot air balloon race above the mountains", "🐙 An octopus DJ at an underwater party"
  ];
  const aiMuseIndexRef = useRef(0);
  const addAIIdea = () => {
    if (myRole === 'viewer' || !canvas) return;
    const idea = AI_MUSE_PROMPTS[Math.floor(Math.random() * AI_MUSE_PROMPTS.length)];
    aiMuseIndexRef.current++;
    showToast(`✨ AI Muse suggests: ${idea}`, 'info');
    const center = canvas.getCenter();
    const note = new fabric.Rect({
      width: 200, height: 160, fill: '#e6d8ff', rx: 10, ry: 10,
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.35)', blur: 14, offsetX: 3, offsetY: 6 })
    });
    const label = new fabric.Textbox(`✨ AI MUSE IDEA\n\n${idea}`, {
      width: 168, left: 16, top: 16, fontSize: 15, fill: '#3a2566', fontFamily: 'Quicksand, sans-serif', fontWeight: '700'
    });
    const group = new fabric.Group([note, label], {
      left: center.left - 100 + (Math.random() * 60 - 30),
      top: center.top - 80 + (Math.random() * 60 - 30),
    });
    canvas.add(group);
    canvas.setActiveObject(group);
    sound('sticky');
  };

  const aiCleanupLastStroke = () => {
    if (!canvas) return;
    const objs = canvas.getObjects();
    const last = objs[objs.length - 1];
    if (!last || last.type !== 'path') {
      showToast('✏️ Draw a rough shape with the Pencil first, then hit AI Cleanup!', 'info');
      return;
    }
    const bbox = last.getBoundingRect();
    const strokeColor = last.stroke || color;
    const strokeW = last.strokeWidth || parseInt(lineWidth);
    let cleanObj;
    const ratio = bbox.width / Math.max(bbox.height, 1);

    if (bbox.width < 20 || bbox.height < 20 || ratio > 3.2 || ratio < 0.31) {
      cleanObj = new fabric.Line(
        [bbox.left, bbox.top, bbox.left + bbox.width, bbox.top + bbox.height],
        { stroke: strokeColor, strokeWidth: strokeW }
      );
    } else if (Math.abs(ratio - 1) < 0.35) {
      const r = Math.max(bbox.width, bbox.height) / 2;
      cleanObj = new fabric.Circle({ left: bbox.left, top: bbox.top, radius: r, fill: 'transparent', stroke: strokeColor, strokeWidth: strokeW });
    } else {
      cleanObj = new fabric.Rect({ left: bbox.left, top: bbox.top, width: bbox.width, height: bbox.height, fill: 'transparent', stroke: strokeColor, strokeWidth: strokeW });
    }

    canvas.remove(last);
    canvas.add(cleanObj);
    canvas.setActiveObject(cleanObj);
    sound('success');
    showToast('🧠 AI Cleanup tidied up your sketch!', 'success');
  };

  const deleteSelected = () => {
    if (myRole === 'viewer' || !canvas) return;
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects && activeObjects.length > 0) {
        sound('click');
        suppressNextTick.current = true;
        activeObjects.forEach(obj => canvas.remove(obj));
        canvas.discardActiveObject();
        canvas.renderAll();
    } else {
        showToast('Select an element to delete first', 'info');
    }
  };

  const sendReaction = (emoji) => {
    socket.emit('reaction', { roomId: activeRoomId, emoji });
    sound('click');
  };

  const DOODLE_WORDS = [
    'Astronaut', 'Pizza Slice', 'Dragon', 'Rainbow', 'Robot', 'Sandcastle',
    'Unicorn', 'Guitar', 'Volcano', 'Penguin', 'Spaceship', 'Wizard Hat',
    'Treasure Map', 'Dinosaur', 'Ice Cream Cone', 'Pirate Ship'
  ];
  const startDoodleChallenge = () => {
    if (myRole === 'viewer' || !activeRoomId) return;
    const word = DOODLE_WORDS[Math.floor(Math.random() * DOODLE_WORDS.length)];
    showToast(`🤫 Your secret word is "${word}" — don't type it in chat!`, 'success');
    socket.emit('chat-message', {
      roomId: activeRoomId,
      username: '🎮 Game Master',
      message: `${username} just started a Doodle Challenge! Watch the canvas and guess what they're drawing right here in chat 🎨`
    });
    startTimer(2);
    sound('success');
  };

  
  const exportFormat = (format) => {
    if (!canvas) return;
    
    const tempBg = canvas.backgroundColor;
    canvas.backgroundColor = themeRef.current === 'light' ? '#ffffff' : '#0b0c10';
    canvas.renderAll();
    
    if (format === 'pdf') {
      const pdf = new jsPDF('l', 'px', [canvas.width, canvas.height]);
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save('CollaboDraw_Export.pdf');
    } else {
      const link = document.createElement('a');
      link.href = canvas.toDataURL({ format, quality: 1 });
      link.download = `CollaboDraw_Export.${format}`;
      link.click();
    }

    canvas.backgroundColor = 'transparent';
    canvas.renderAll();
  };

  const zoomIn = () => canvas && canvas.setZoom(Math.min(canvas.getZoom() * 1.15, 5));
  const zoomOut = () => canvas && canvas.setZoom(Math.max(canvas.getZoom() / 1.15, 0.2));
  const zoomReset = () => canvas && canvas.setZoom(1);

  const handleRoleClick = (targetUser, currentRole) => {
      if (myRole !== 'owner' || targetUser === username) return;
      const roleOpt = currentRole === 'viewer' ? 'editor' : 'viewer';
      if (window.confirm(`Change ${targetUser}'s role to ${roleOpt.toUpperCase()}?`)) {
          socket.emit('change-role', { roomId: activeRoomId, targetUser, newRole: roleOpt });
      }
  };

  return (
    <div className={`container theme-${theme}`}>
      <div className="dreamscape-bg">
        <div className="dream-sun" />
        <div className="dream-grid" />
        {[...Array(6)].map((_, i) => (
          <div key={`cloud-${i}`} className="dream-cloud" style={{ width: `${80 + i * 30}px`, height: `${30 + i * 8}px`, top: `${10 + i * 9}%`, animationDuration: `${40 + i * 12}s`, animationDelay: `${-i * 7}s` }} />
        ))}
        {theme === 'dark' && [...Array(40)].map((_, i) => (
          <div key={`star-${i}`} className="dream-star" style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 55}%`, animationDuration: `${2 + Math.random() * 3}s`, animationDelay: `${Math.random() * 3}s` }} />
        ))}
        {theme === 'dark' && [...Array(10)].map((_, i) => (
          <div key={`firefly-${i}`} className="dream-firefly" style={{ left: `${Math.random() * 100}%`, top: `${55 + Math.random() * 35}%`, animationDuration: `${4 + Math.random() * 3}s`, animationDelay: `${Math.random() * 3}s` }} />
        ))}
      </div>
      
      {view === 'landing' && (
        <div className="center-container fade-in" onClick={handleLandingClick}>
          <div className="glass-panel landing-panel">
            <button className="theme-toggle-btn corner-toggle" onClick={(e) => { e.stopPropagation(); toggleTheme(); }} title="Toggle light / dark theme">
              {theme === 'dark' ? '🌙' : '☀️'}
            </button>
            
            <h1 className="neon-text" style={{ fontSize: '3rem', marginBottom: '10px' }}>Welcome to CollaboDraw</h1>

            <div className="hero-illustration-wrap">
              <svg viewBox="0 0 340 160" className="hero-illustration" xmlns="http://www.w3.org/2000/svg">
                <polygon points="170,20 190,140 150,140" fill="var(--panel-solid)" opacity="0.9" />
                <rect x="140" y="35" width="60" height="75" rx="6" fill="var(--cloud-white)" opacity="0.95" />
                <path className="hero-scribble" d="M150 50 C 160 70, 175 40, 185 60 S 195 95, 165 95" stroke="var(--sunset-pink)" strokeWidth="4" fill="none" strokeLinecap="round" />
                <circle cx="70" cy="80" r="26" fill="var(--sunset-coral)" />
                <circle cx="62" cy="75" r="3.5" fill="#2b2140" />
                <circle cx="80" cy="75" r="3.5" fill="#2b2140" />
                <path d="M60 90 Q70 98 82 90" stroke="#2b2140" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                <rect x="50" y="104" width="40" height="46" rx="14" fill="var(--dream-cyan)" />
                <rect x="86" y="108" width="34" height="10" rx="5" fill="var(--dream-cyan)" className="hero-arm-left" />
                <circle cx="270" cy="80" r="26" fill="var(--lavender)" />
                <circle cx="262" cy="75" r="3.5" fill="#2b2140" />
                <circle cx="280" cy="75" r="3.5" fill="#2b2140" />
                <path d="M260 90 Q270 98 282 90" stroke="#2b2140" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                <rect x="250" y="104" width="40" height="46" rx="14" fill="var(--sunset-orange)" />
                <rect x="220" y="108" width="34" height="10" rx="5" fill="var(--sunset-orange)" className="hero-arm-right" />
                <text x="30" y="40" className="hero-sparkle s1">✨</text>
                <text x="300" y="35" className="hero-sparkle s2">🎨</text>
                <text x="165" y="20" className="hero-sparkle s3">💡</text>
              </svg>
            </div>
            
            <p className="landing-quote fade-in" key={quoteIndex}>
              {quotes[quoteIndex]}
            </p>
            
            <p className="landing-desc">
              Presenting CollaboDraw: A digital canvas where you can draw and have fun with your friends, doodle, and make beautiful, attractive lines together in real-time.
            </p>

            <div className="feature-chip-row">
              <span className="feature-chip">🧠 AI Cleanup</span>
              <span className="feature-chip">📊 Flowcharts</span>
              <span className="feature-chip">🎮 Doodle Challenge</span>
              <span className="feature-chip">🎙️ Voice Chat</span>
              <span className="feature-chip">🌿 Branching</span>
            </div>
            
            <div className="click-prompt">Click anywhere to start creating</div>
          </div>

          <div className="tool-popout-container">
            <div className={`pop-tool t1 ${isPopping ? 'active' : ''}`}>🎨</div>
            <div className={`pop-tool t2 ${isPopping ? 'active' : ''}`}>🖌️</div>
            <div className={`pop-tool t3 ${isPopping ? 'active' : ''}`}>✏️</div>
            <div className={`pop-tool t4 ${isPopping ? 'active' : ''}`}>📐</div>
            <div className={`pop-tool t5 ${isPopping ? 'active' : ''}`}>✨</div>
            <div className={`pop-tool t6 ${isPopping ? 'active' : ''}`}>🤖</div>
            <div className={`pop-tool t7 ${isPopping ? 'active' : ''}`}>📊</div>
          </div>

          <div className="ambient-doodles">
            {['🖍️','⭐','💬','🖼️','🧩','🎈'].map((icon, i) => (
              <span key={i} className={`ambient-doodle ad${i + 1}`}>{icon}</span>
            ))}
          </div>
        </div>
      )}
      
      {view === 'auth' && (
        <div className="center-container fade-in">
          <div className="glass-panel auth-panel">
            <button className="theme-toggle-btn corner-toggle" onClick={toggleTheme} title="Toggle light / dark theme">
              {theme === 'dark' ? '🌙' : '☀️'}
            </button>
            <h1 className="neon-text">CollaboDraw Pro</h1>
            <h3 style={{ color: 'var(--ink)', marginBottom: '20px' }}>{isLogin ? 'Welcome Back' : 'Create Account'}</h3>
            <form onSubmit={handleAuth}>
              <input type="text" placeholder="Username" onChange={e => setUsername(e.target.value)} required />
              <input type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} required />
              {authError && <p className="error-text">{authError}</p>}
              <button className="primary-btn" type="submit">{isLogin ? 'LOGIN' : 'REGISTER'}</button>
            </form>
            <p className="toggle-text" onClick={() => { setIsLogin(!isLogin); setAuthError(''); }}>
              {isLogin ? "Need an account? Register here." : "Already have an account? Login."}
            </p>
          </div>
        </div>
      )}

      {view === 'dashboard' && (
        <div className="center-container fade-in" style={{ alignItems: 'flex-start', paddingTop: '50px' }}>
          <div className="glass-panel dashboard-panel">
            <div className="dash-header">
              <h1 className="neon-text">My Workspace</h1>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {/* Dashboard Clock */}
                <div style={{ color: 'var(--firefly-gold)', fontWeight: '700', fontSize: '1rem', marginRight: '15px' }}>
                  {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <button className="theme-toggle-btn" onClick={toggleTheme} title="Toggle light / dark theme">
                  {theme === 'dark' ? '🌙' : '☀️'}
                </button>
                <button className="mute-btn" onClick={toggleMute} title={muted ? 'Unmute sound effects' : 'Mute sound effects'}>
                  {muted ? '🔇' : '🔊'}
                </button>
                <div className="avatar profile-trigger fade-pop" style={{ backgroundColor: profile?.color || '#45a29e' }}
                     onClick={() => { sound('click'); setShowProfileModal(true); }} title="View my profile">
                  {username ? username[0].toUpperCase() : '?'}
                </div>
                <button className="logout-btn" onClick={() => { setView('auth'); setUsername(''); setProfile(null); }}>Logout</button>
              </div>
            </div>
            
            <div className="dash-grid">
              <div className="dash-section">
                <h3 style={{ color: 'var(--dream-cyan)' }}>Create New Board</h3>
                <form onSubmit={createBoard} style={{ display: 'flex', gap: '10px' }}>
                  <input type="text" placeholder="Board Name" value={newBoardName} onChange={e => setNewBoardName(e.target.value)} required />
                  <button className="primary-btn" type="submit" style={{width: 'auto'}}>Create</button>
                </form>

                <div className="template-picker">
                  <span className="icon-label-text" style={{ display: 'block', marginBottom: '6px' }}>Starting Template</span>
                  <div className="template-options">
                    {[
                      { id: 'blank', label: '⬜ Blank' },
                      { id: 'kanban', label: '📋 Kanban' },
                      { id: 'retro', label: '🔄 Retro' },
                      { id: 'mindmap', label: '🧠 Mind Map' },
                    ].map(t => (
                      <button
                        type="button"
                        key={t.id}
                        className={`template-chip ${boardTemplate === t.id ? 'active' : ''}`}
                        onClick={() => { setBoardTemplate(t.id); sound('click'); }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <h3 style={{ color: 'var(--dream-cyan)', margin: '30px 0 10px 0' }}>Join Shared Board</h3>
                <form onSubmit={(e) => { e.preventDefault(); if (joinBoardId) enterBoard(joinBoardId); }} style={{ display: 'flex', gap: '10px' }}>
                  <input type="text" placeholder="Enter Room ID" value={joinBoardId} onChange={e => setJoinBoardId(e.target.value)} required />
                  <button className="primary-btn" type="submit" style={{width: 'auto'}}>Join</button>
                </form>
              </div>

              <div className="dash-section">
                <h3 style={{ color: 'var(--dream-cyan)' }}>My Boards</h3>
                {myBoards.length === 0 ? <p style={{ color: 'var(--ink-dim)' }}>No boards yet.</p> : null}
                <ul className="board-list">
                  {myBoards.map(board => (
                    <li key={board.id} className="board-card">
                      <div>
                        <strong>{board.name}</strong>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ink-dim)' }}>ID: {board.id}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button className="action-btn" onClick={() => enterBoard(board.id)}>Enter</button>
                        <button className="action-btn" style={{ color: '#ff6666' }} onClick={() => deleteBoard(board.id)}>🗑️</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {showProfileModal && profile && (
        <div className="modal-backdrop" onClick={() => setShowProfileModal(false)}>
          <div className="glass-panel profile-modal fade-in" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowProfileModal(false)}>✖</button>
            <div className="profile-avatar-lg" style={{ backgroundColor: profile.color }}>
              {profile.username[0].toUpperCase()}
            </div>
            <h2 className="neon-text" style={{ fontSize: '1.6rem' }}>{profile.username}</h2>
            <div className="profile-stats">
              <div className="profile-stat">
                <span className="profile-stat-value">{profile.totalBoards ?? myBoards.length}</span>
                <span className="profile-stat-label">Boards Owned</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '—'}</span>
                <span className="profile-stat-label">Member Since</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingProfile && (
        <div className="modal-backdrop" onClick={() => setViewingProfile(null)}>
          <div className="glass-panel profile-modal fade-in" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setViewingProfile(null)}>✖</button>
            <div className="profile-avatar-lg" style={{ backgroundColor: viewingProfile.color || '#45a29e' }}>
              {viewingProfile.username[0].toUpperCase()}
            </div>
            <h2 className="neon-text" style={{ fontSize: '1.6rem' }}>{viewingProfile.username}</h2>
            <div className="profile-stats">
              <div className="profile-stat">
                <span className="profile-stat-value">{viewingProfile.totalBoards ?? '—'}</span>
                <span className="profile-stat-label">Boards Owned</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{viewingProfile.createdAt ? new Date(viewingProfile.createdAt).toLocaleDateString() : '—'}</span>
                <span className="profile-stat-label">Member Since</span>
              </div>
            </div>
            {myRole === 'owner' && viewingProfile.username !== username && view === 'canvas' && findActiveRole(viewingProfile.username) && (
              <button className="primary-btn" style={{ marginTop: '15px' }}
                onClick={() => {
                  handleRoleClick(viewingProfile.username, findActiveRole(viewingProfile.username));
                  setViewingProfile(null);
                }}>
                Change Role
              </button>
            )}
          </div>
        </div>
      )}

      {showShortcuts && (
        <div className="modal-backdrop" onClick={() => setShowShortcuts(false)}>
          <div className="glass-panel profile-modal fade-in shortcuts-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowShortcuts(false)}>✖</button>
            <h2 className="neon-text" style={{ fontSize: '1.4rem' }}>⌨️ Keyboard Shortcuts</h2>
            <ul className="shortcuts-list">
              <li><kbd>V</kbd> Select tool</li>
              <li><kbd>P</kbd> Pencil</li>
              <li><kbd>E</kbd> Eraser</li>
              <li><kbd>L</kbd> Line &nbsp; <kbd>R</kbd> Rect &nbsp; <kbd>C</kbd> Circle &nbsp; <kbd>T</kbd> Text</li>
              <li><kbd>N</kbd> New sticky note</li>
              <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> Undo</li>
              <li><kbd>Ctrl</kbd>+<kbd>Y</kbd> Redo</li>
              <li><kbd>Delete</kbd> Remove selected shape</li>
              <li><kbd>+</kbd> / <kbd>−</kbd> Zoom in / out</li>
              <li><kbd>Ctrl</kbd>+<kbd>0</kbd> Reset zoom</li>
              <li><kbd>Ctrl</kbd>+<kbd>S</kbd> Export PNG</li>
            </ul>
          </div>
        </div>
      )}

      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
        ))}
      </div>

      <div className={`canvas-screen ${focusMode ? 'focus-active' : ''}`} style={{ display: view === 'canvas' ? 'flex' : 'none' }}>

        <button className={`focus-toggle-btn ${focusMode ? 'active' : ''}`} onClick={toggleFocusMode} title="Toggle Focus Mode (hide UI chrome)">
          {focusMode ? '🎯 Exit Focus' : '🎯 Focus Mode'}
        </button>

        {showWelcomeModal && (
          <div className="modal-backdrop welcome-modal-backdrop" onClick={() => setShowWelcomeModal(false)}>
            <div className="glass-panel welcome-modal scale-in" onClick={(e) => e.stopPropagation()}>
              <div className="welcome-modal-emoji">🎉</div>
              <h2 className="neon-text" style={{ fontSize: '1.6rem', marginBottom: '6px' }}>You're in, {username}!</h2>
              <p className="welcome-modal-text">
                Now you can collaborate or draw with friends in real-time — sketch,
                add sticky notes, drop flowchart shapes, or just doodle for fun. ✏️🎨
              </p>
              <p className="welcome-modal-subtext">Room ID: <strong>{activeRoomId}</strong> — share it so friends can join!</p>
              <button className="primary-btn welcome-modal-btn" onClick={() => setShowWelcomeModal(false)}>
                Let's Create! 🚀
              </button>
            </div>
          </div>
        )}
        
        <div className="presence-bar slide-down">
          <span style={{marginRight: '15px', color: 'var(--ink)'}}>Role: <strong style={{color: 'var(--dream-cyan)'}}>{myRole.toUpperCase()}</strong></span>
          {Object.values(activeUsers).map((u, i) => (
            <div key={i} className="avatar fade-pop" style={{backgroundColor: u.color, cursor: 'pointer', animationDelay: `${i * 0.05}s`}} 
                 title={`${u.username} (${u.role}) — click to view profile`}
                 onClick={() => { sound('click'); openProfile(u.username); }}>
              {u.username[0].toUpperCase()}
              {u.role === 'owner' && <span style={{position:'absolute', top: -5, right: -5}}>👑</span>}
            </div>
          ))}
          <div className="active-count" style={{marginLeft: '15px'}}>{Object.keys(activeUsers).length} Online</div>
          
          <div className="divider vertical" style={{ margin: '0 10px' }} />
          {/* Canvas Clock */}
          <div style={{ color: 'var(--firefly-gold)', fontWeight: '700', fontSize: '0.95rem', marginRight: '10px' }}>
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>

          <div className="icon-label-group">
            <button className="theme-toggle-btn small-toggle" onClick={toggleTheme} title="Toggle light / dark theme">
              {theme === 'dark' ? '🌙' : '☀️'}
            </button>
            <span className="icon-label-text">Theme</span>
          </div>
          
          <div className="icon-label-group">
            <button className="theme-toggle-btn small-toggle" style={{ position: 'relative', border: voiceEnabled ? '1px solid var(--dream-cyan)' : '' }} 
                    onClick={voiceEnabled ? stopVoice : startVoice} title={voiceEnabled ? "Mute Microphone" : "Start Voice Chat"}>
              {voiceEnabled ? '🎙️' : '🔇'}
              {voiceEnabled && <div className="voice-indicator" />}
            </button>
            <span className="icon-label-text">{voiceEnabled ? 'Mic On' : 'Voice Chat'}</span>
          </div>

          <button className="share-btn" onClick={() => { navigator.clipboard.writeText(window.location.href); sound('click'); showToast('Invite link copied to clipboard!', 'success'); }}>🔗 Share</button>

          <button className="share-btn qr-btn" onClick={() => { setShowQR(v => !v); sound('click'); }} title="Show QR code to scan-to-join">📱 QR</button>
        </div>

        {showQR && (
          <div className="qr-popover scale-in">
            <button className="modal-close" onClick={() => setShowQR(false)}>✖</button>
            <img
              className="qr-image"
              alt="Scan to join this board"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(window.location.href)}`}
            />
            <p className="qr-caption">Scan to join live 📲</p>
          </div>
        )}

        <div className="top-left-stack">
          <div className="top-action-bar slide-down">
            <button className="leave-btn" onClick={() => { 
              window.history.pushState({}, '', window.location.pathname);
              handleToolChange('select'); setCanvas(null); setActiveRoomId(''); setView('dashboard'); 
            }}>⬅ Dashboard</button>
            
            <div className="divider vertical" />
            
            {myRole === 'viewer' ? (
               <div style={{color: '#ff6666', fontWeight: 'bold', padding: '0 15px'}}>👀 Viewer Mode (Read-Only)</div>
            ) : (
              <>
                <button className="action-btn" style={{color: '#f3ca20'}} onClick={() => { sound('undo'); suppressNextTick.current = true; socket.emit('undo', { roomId: activeRoomId, pageIndex: activePage }); }}>↩️ Undo</button>
                <button className="action-btn" style={{color: '#3498db'}} onClick={() => { sound('redo'); suppressNextTick.current = true; socket.emit('redo', { roomId: activeRoomId, pageIndex: activePage }); }}>↪️ Redo</button>
                <button className="action-btn" style={{color: '#ff3333'}} onClick={() => socket.emit('clear', { roomId: activeRoomId, pageIndex: activePage })}>⚠️ Clear</button>
              </>
            )}
            
            <div className="divider vertical" />
            <button onClick={zoomOut} title="Zoom out (-)">🔍− Zoom Out</button>
            <button onClick={zoomReset} title="Reset zoom (Ctrl+0)">100%</button>
            <button onClick={zoomIn} title="Zoom in (+)">🔍+ Zoom In</button>
            <div className="divider vertical" />
            <button onClick={() => exportFormat('png')}>💾 PNG</button>
            <button onClick={() => exportFormat('pdf')} style={{color: '#f3ca20'}}>📄 PDF</button>
            <div className="divider vertical" />
            <button className="action-btn" style={{color: '#b066ff'}} onClick={() => { sound('click'); setShowHistory(!showHistory); }}>🕒 History</button>
            {historyData.totalVersions > 1 && (
              isReplaying ? (
                <button className="action-btn replay-btn active" style={{color: 'var(--danger)'}} onClick={stopReplay}>⏹️ Stop Replay</button>
              ) : (
                <button className="action-btn replay-btn" style={{color: 'var(--sunset-pink)'}} onClick={startReplay} title="Watch this board build itself, version by version">▶️ Replay</button>
              )
            )}
            <button className="action-btn" style={{color: 'var(--lavender)'}} onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts">⌨️ Shortcuts</button>
            <button className="mute-btn labeled-icon-btn" onClick={toggleMute} title={muted ? 'Unmute sound effects' : 'Mute sound effects'}>
              {muted ? '🔇' : '🔊'} <span className="btn-label-text">Sound</span>
            </button>
          </div>

          <div className="timer-widget slide-down" style={{ display: 'flex' }}>
              <div className="timer-display" style={{ color: timerEndsAt && timeLeftStr === '00:00' ? 'var(--danger)' : '' }}>{timeLeftStr}</div>
              <div className="timer-controls">
                  {myRole !== 'viewer' && !timerEndsAt && (
                      <>
                          <button className="timer-btn" onClick={() => startTimer(5)}>5m</button>
                          <button className="timer-btn" onClick={() => startTimer(15)}>15m</button>
                          <button className="timer-btn" onClick={() => startTimer(25)}>25m</button>
                      </>
                  )}
                  {myRole !== 'viewer' && timerEndsAt && (
                      <button className="timer-btn" style={{ color: 'var(--danger)' }} onClick={stopTimer}>Stop</button>
                  )}
              </div>
          </div>
        </div>

        {myRole !== 'viewer' && (
          <div className="side-toolbar slide-up">
            <button className={tool === 'select' ? 'active' : ''} onClick={() => handleToolChange('select')} title="Selection tool">👆 Select</button>
            <button onClick={deleteSelected} title="Delete selected object (Del)">🗑️ Delete</button>
            
            <button
              className={`draw-toggle-btn ${showDrawTools ? 'active' : ''}`}
              onClick={() => setShowDrawTools(v => !v)}
              title="Show pencil & shape tools"
            >
              🖌️ Draw {showDrawTools ? '▲' : '▼'}
            </button>

            {showDrawTools && (
              <div className="draw-tools-popout scale-in">
                <button className={tool === 'pencil' ? 'active' : ''} onClick={() => handleToolChange('pencil')} title="Freehand pencil">✏️ Pencil</button>
                <button className={tool === 'eraser' ? 'active' : ''} onClick={() => handleToolChange('eraser')} title="Eraser">🧽 Erase</button>
                <button className={tool === 'laser' ? 'active' : ''} onClick={() => handleToolChange('laser')} title="Laser pointer">🔴 Laser</button>
                <div className="divider horizontal" />
                <button onClick={() => addObject('line')} title="Add a line">➖ Line</button>
                <button onClick={() => addObject('rect')} title="Add a rectangle">⬜ Rect</button>
                <button onClick={() => addObject('circle')} title="Add a circle">◯ Circle</button>
                <button onClick={() => addObject('text')} title="Add a text box">🔤 Text</button>
                <div className="divider horizontal" />
                <button className="ai-feature-btn" onClick={aiCleanupLastStroke} title="Turn your last rough pencil stroke into a clean shape">🧠 AI Cleanup</button>
              </div>
            )}

            <button
              className={`draw-toggle-btn ${showFlowchartTools ? 'active' : ''}`}
              onClick={() => setShowFlowchartTools(v => !v)}
              title="Show flowchart shapes"
            >
              📊 Flowchart {showFlowchartTools ? '▲' : '▼'}
            </button>

            {showFlowchartTools && (
              <div className="draw-tools-popout scale-in">
                <button onClick={() => addObject('terminal')} title="Start / End terminator">🔵 Start/End</button>
                <button onClick={() => addObject('rect')} title="Process box">⬜ Process</button>
                <button onClick={() => addObject('diamond')} title="Decision diamond">🔶 Decision</button>
                <button onClick={() => addObject('parallelogram')} title="Data / input-output">▱ Data</button>
                <button onClick={() => addObject('arrow')} title="Connector arrow">➡️ Arrow</button>
              </div>
            )}
            
            <div className="divider horizontal" />

            <button onClick={addSticky} title="Add sticky note (N)">🗒️ Sticky Note</button>
            <button onClick={addCodeBlock} title="Add formatted code block">💻 Code Block</button>

            <label className="upload-btn" title="Upload an image">🖼️ Image Upload<input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} /></label>

            <div className="divider horizontal" />
            <button className="ai-feature-btn" onClick={addAIIdea} title="Get a random creative drawing prompt">✨ AI Muse</button>
            <button className="game-feature-btn" onClick={startDoodleChallenge} title="Start a 2-minute guess-what-I'm-drawing round">🎮 Doodle Challenge</button>
            
            <div className="divider horizontal" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', width: '100%' }}>
              <span className="icon-label-text">Stroke Color &amp; Size</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', justifyContent: 'center' }}>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="color-picker" title="Stroke Color" />
                <input type="range" min="1" max="20" value={lineWidth} onChange={(e) => setLineWidth(e.target.value)} title="Stroke Thickness" style={{ width: '45px' }} />
              </div>
            </div>
          </div>
        )}

        <div id="canvas-wrapper" className="canvas-wrapper fade-in">
          <canvas id="fabric-canvas" />

          {Object.entries(activeUsers).map(([id, user]) => {
            if (id === socket.id || user.x === -100) return null;
            return (
              <div key={id} className="live-cursor" style={{ left: user.x, top: user.y, backgroundColor: user.color }}>
                <div className="cursor-label">{user.username}</div>
              </div>
            );
          })}

          {Object.entries(laserPoints).map(([id, p]) => (
            <div key={`laser-${id}`} className="laser-dot" style={{ left: p.x, top: p.y, backgroundColor: p.color, boxShadow: `0 0 16px 6px ${p.color}` }}>
              <span className="laser-label" style={{ color: p.color }}>{p.username}</span>
            </div>
          ))}

          {Object.entries(captions).map(([id, cap]) => {
            const user = activeUsers[id];
            if (!user || user.x === -100) return null;
            return (
              <div key={`caption-${id}`} className="caption-bubble" style={{ left: user.x, top: user.y }}>
                <span className="caption-name" style={{ color: cap.color || user.color }}>{cap.username || user.username}</span>
                <span className="caption-text">{cap.text}</span>
              </div>
            );
          })}

          {showMinimap && (
            <div className="minimap-wrap">
              <div className="minimap-header">
                <span>🗺️ Minimap</span>
                <button className="minimap-hide-btn" onClick={() => setShowMinimap(false)} title="Hide minimap">✖</button>
              </div>
              <canvas id="minimap-canvas" width={MINIMAP_W} height={MINIMAP_H} onClick={handleMinimapClick} />
              <div className="minimap-viewport-box" style={{
                left: Math.max(0, viewportBox.left), top: Math.max(0, viewportBox.top),
                width: Math.max(4, viewportBox.width), height: Math.max(4, viewportBox.height)
              }} />
            </div>
          )}
          {!showMinimap && (
            <button className="minimap-reopen-btn" onClick={() => setShowMinimap(true)} title="Show minimap">🗺️</button>
          )}

          {reactions.map(r => (
            <div key={r.id} className="floating-reaction" style={{ left: `${r.left}%` }}>
              <span className="floating-reaction-emoji">{r.emoji}</span>
              <span className="floating-reaction-name" style={{ color: r.color }}>{r.username}</span>
            </div>
          ))}

          <div className="reactions-bar">
            {['👍', '❤️', '😂', '🎉', '👏', '🤔'].map(emoji => (
              <button key={emoji} className="reaction-btn" onClick={() => sendReaction(emoji)} title={`React with ${emoji}`}>
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <div className="page-tabs slide-up">
          {pageNames.map((name, idx) => (
            <button key={idx} className={`page-tab ${idx === activePage ? 'active' : ''}`} onClick={() => switchPage(idx)}>
              {name}
            </button>
          ))}
          {myRole !== 'viewer' && (
            <>
               <button className="page-tab add-page-tab" onClick={addPage} title="Add a new empty page">＋</button>
               <div className="divider vertical" style={{ height: '18px', margin: '0 4px' }} />
               <button className="page-tab branch-btn" onClick={branchCanvas} title="Duplicate this canvas into a new experimental branch">🌿 Branch</button>
               {activePage > 0 && (
                   <button className="page-tab merge-btn" onClick={mergeBranch} title="Overwrite the Main Board with this branch's content">🔁 Merge to Main</button>
               )}
            </>
          )}
        </div>

        {showHistory && myRole !== 'viewer' && (
          <div className="history-panel scale-in">
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <h3 style={{color: 'var(--dream-cyan)', margin: 0}}>Version History</h3>
              <button onClick={() => setShowHistory(false)} style={{background: 'transparent', color: 'var(--ink)', border: 'none', cursor: 'pointer'}}>✖</button>
            </div>
            <ul className="history-list">
              {Array.from({ length: historyData.totalVersions }).map((_, idx) => (
                <li key={idx} className={`history-item ${idx === historyData.currentIndex ? 'active-history' : ''}`}
                    onClick={() => socket.emit('restore-version', { roomId: activeRoomId, versionIndex: idx, pageIndex: activePage })}>
                  Version {idx + 1} {idx === historyData.currentIndex && '(Current)'}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="chat-toggle-wrap">
          <button className="chat-toggle-btn" onClick={() => { setChatOpen(o => !o); setUnreadChat(0); sound('click'); }} title="Toggle chat">
            💬
            {unreadChat > 0 && <span className="chat-badge">{unreadChat}</span>}
          </button>
          <span className="chat-toggle-label">Chat</span>
        </div>
        {chatOpen && (
          <div className="chat-panel scale-in">
            <div className="chat-header">
              <h3 style={{ margin: 0, color: 'var(--dream-cyan)' }}>💬 Board Chat</h3>
              <button onClick={() => setChatOpen(false)} style={{ background: 'transparent', color: 'var(--ink)', border: 'none', cursor: 'pointer' }}>✖</button>
            </div>
            <div className="chat-messages">
              {chatMessages.length === 0 && <p style={{ color: 'var(--ink-dim)', fontSize: '0.85rem', textAlign: 'center' }}>No messages yet. Say hi 👋</p>}
              {chatMessages.map((m, i) => (
                <div key={i} className={`chat-message ${m.username === username ? 'mine' : 'theirs'}`}>
                  <div className="chat-bubble">
                    {m.username !== username && <div className="chat-sender">{m.username}</div>}
                    <div>{m.message}</div>
                    <div className="chat-time">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form className="chat-input-row" onSubmit={sendChatMessage}>
              <input type="text" placeholder="Type a message…" value={chatInput} onChange={e => setChatInput(e.target.value)} maxLength={500} />
              <button className="primary-btn" type="submit" style={{ width: 'auto', padding: '10px 16px' }}>➤</button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}