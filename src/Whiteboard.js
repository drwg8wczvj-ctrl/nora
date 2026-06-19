import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Plus, X, Trash2, Link2, Target, Zap, List, Calendar,
  FileText, GitBranch, ChevronLeft, Sparkles, Check,
  ZoomIn, ZoomOut, Edit3, Layers, ArrowRight, Activity, Flag,
  Share2, Users,
} from "lucide-react";
import "./Whiteboard.css";
import ShareModal from "./components/ShareModal";
import CollaboratorAvatars from "./components/CollaboratorAvatars";
import {
  updateSharedObject, getCollaborators,
} from "./lib/sharingApi";

function uid() { return Math.random().toString(36).slice(2, 10); }

function useLocalStorage(key, init) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : init; } catch { return init; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
}

// ── Block type registry ─────────────────────────────────────────
const BT = {
  goal:       { label: "Goal",      Icon: Target,    color: "#8b5cf6" },
  idea:       { label: "Idea",      Icon: Zap,       color: "#f59e0b" },
  task_group: { label: "Tasks",     Icon: List,      color: "#3b82f6" },
  deadline:   { label: "Deadline",  Icon: Calendar,  color: "#ef4444" },
  milestone:  { label: "Milestone", Icon: Flag,      color: "#f97316" },
  note:       { label: "Note",      Icon: FileText,  color: "#10b981" },
  decision:   { label: "Decision",  Icon: GitBranch, color: "#ec4899" },
};

const BS = {
  goal:       { w: 220, h: 110 },
  idea:       { w: 180, h: 88  },
  task_group: { w: 240, h: 130 },
  deadline:   { w: 200, h: 90  },
  milestone:  { w: 220, h: 90  },
  note:       { w: 240, h: 155 },
  decision:   { w: 200, h: 100 },
};

// ── Templates ────────────────────────────────────────────────────
const TEMPLATES = [
  {
    id:"exam", name:"Exam Preparation", emoji:"📚",
    blocks:[
      {id:"b1",type:"goal",      title:"Pass the Exam",        content:"",x:280,y:40, w:220,h:110},
      {id:"b2",type:"task_group",title:"Study Schedule",       content:"",x:40, y:210,w:240,h:130},
      {id:"b3",type:"task_group",title:"Practice Tests",       content:"",x:340,y:210,w:240,h:130},
      {id:"b4",type:"note",      title:"Key Topics",           content:"",x:640,y:210,w:240,h:130},
      {id:"b5",type:"deadline",  title:"Exam Date",            content:"",x:280,y:410,w:220,h:90 },
      {id:"b6",type:"idea",      title:"Use flashcards",       content:"",x:40, y:410,w:200,h:90 },
    ],
    connections:[
      {id:"c1",from:"b1",to:"b2"},{id:"c2",from:"b1",to:"b3"},{id:"c3",from:"b1",to:"b4"},
      {id:"c4",from:"b2",to:"b5"},{id:"c5",from:"b3",to:"b5"},
    ],
  },
  {
    id:"travel", name:"Travel Planning", emoji:"✈️",
    blocks:[
      {id:"b1",type:"goal",      title:"Plan the Trip",        content:"",x:280,y:40, w:240,h:110},
      {id:"b2",type:"task_group",title:"Travel Logistics",     content:"",x:40, y:210,w:240,h:130},
      {id:"b3",type:"task_group",title:"Accommodation",        content:"",x:340,y:210,w:240,h:130},
      {id:"b4",type:"task_group",title:"Activities",           content:"",x:640,y:210,w:240,h:130},
      {id:"b5",type:"deadline",  title:"Book Flights",         content:"",x:40, y:410,w:220,h:90 },
      {id:"b6",type:"decision",  title:"Hotel vs Airbnb",      content:"",x:340,y:410,w:220,h:100},
      {id:"b7",type:"note",      title:"Packing Checklist",    content:"",x:640,y:410,w:240,h:130},
    ],
    connections:[
      {id:"c1",from:"b1",to:"b2"},{id:"c2",from:"b1",to:"b3"},{id:"c3",from:"b1",to:"b4"},
      {id:"c4",from:"b2",to:"b5"},{id:"c5",from:"b3",to:"b6"},{id:"c6",from:"b4",to:"b7"},
    ],
  },
  {
    id:"university", name:"University Application", emoji:"🎓",
    blocks:[
      {id:"b1",type:"goal",      title:"Get Accepted",         content:"",x:280,y:40, w:240,h:110},
      {id:"b2",type:"task_group",title:"Research Programs",    content:"",x:40, y:210,w:240,h:130},
      {id:"b3",type:"task_group",title:"Documents",            content:"",x:340,y:210,w:240,h:130},
      {id:"b4",type:"task_group",title:"Applications",         content:"",x:640,y:210,w:240,h:130},
      {id:"b5",type:"note",      title:"Requirements",         content:"",x:40, y:410,w:240,h:130},
      {id:"b6",type:"deadline",  title:"Application Deadline", content:"",x:340,y:410,w:220,h:90 },
    ],
    connections:[
      {id:"c1",from:"b1",to:"b2"},{id:"c2",from:"b1",to:"b3"},{id:"c3",from:"b1",to:"b4"},
      {id:"c4",from:"b2",to:"b5"},{id:"c5",from:"b3",to:"b6"},{id:"c6",from:"b4",to:"b6"},
    ],
  },
  {
    id:"business", name:"Business Launch", emoji:"💼",
    blocks:[
      {id:"b1",type:"goal",      title:"Launch Product",       content:"",x:280,y:40, w:240,h:110},
      {id:"b2",type:"task_group",title:"Market Research",      content:"",x:40, y:210,w:240,h:130},
      {id:"b3",type:"task_group",title:"Product Dev",          content:"",x:340,y:210,w:240,h:130},
      {id:"b4",type:"task_group",title:"Marketing",            content:"",x:640,y:210,w:240,h:130},
      {id:"b5",type:"decision",  title:"B2B or B2C?",         content:"",x:40, y:410,w:200,h:100},
      {id:"b6",type:"deadline",  title:"Launch Date",          content:"",x:340,y:410,w:220,h:90 },
      {id:"b7",type:"note",      title:"Budget Notes",         content:"",x:640,y:410,w:240,h:130},
    ],
    connections:[
      {id:"c1",from:"b1",to:"b2"},{id:"c2",from:"b1",to:"b3"},{id:"c3",from:"b1",to:"b4"},
      {id:"c4",from:"b2",to:"b5"},{id:"c5",from:"b3",to:"b6"},{id:"c6",from:"b4",to:"b7"},
    ],
  },
  {
    id:"personal", name:"Personal Goal", emoji:"🎯",
    blocks:[
      {id:"b1",type:"goal",      title:"My Goal",              content:"",x:280,y:40, w:240,h:110},
      {id:"b2",type:"idea",      title:"Why this matters",     content:"",x:40, y:210,w:200,h:90 },
      {id:"b3",type:"task_group",title:"Action Steps",         content:"",x:300,y:210,w:240,h:130},
      {id:"b4",type:"note",      title:"Resources needed",     content:"",x:600,y:210,w:240,h:130},
      {id:"b5",type:"deadline",  title:"Target Date",          content:"",x:300,y:410,w:220,h:90 },
    ],
    connections:[
      {id:"c1",from:"b1",to:"b2"},{id:"c2",from:"b1",to:"b3"},{id:"c3",from:"b1",to:"b4"},
      {id:"c4",from:"b3",to:"b5"},
    ],
  },
];

// ── SVG path helpers ─────────────────────────────────────────────
function smartPath(a, b) {
  const acx=a.x+a.w/2, acy=a.y+a.h/2;
  const bcx=b.x+b.w/2, bcy=b.y+b.h/2;
  const dx=bcx-acx, dy=bcy-acy;
  let sx,sy,ex,ey;
  if (Math.abs(dy) >= Math.abs(dx)) {
    if(dy>0){sx=acx;sy=a.y+a.h;ex=bcx;ey=b.y;}
    else    {sx=acx;sy=a.y;    ex=bcx;ey=b.y+b.h;}
    const c=Math.abs(ey-sy)*0.45, sg=dy>0?1:-1;
    return `M${sx},${sy} C${sx},${sy+c*sg} ${ex},${ey-c*sg} ${ex},${ey}`;
  } else {
    if(dx>0){sx=a.x+a.w;sy=acy;ex=b.x;    ey=bcy;}
    else    {sx=a.x;    sy=acy;ex=b.x+b.w; ey=bcy;}
    const c=Math.abs(ex-sx)*0.45, sg=dx>0?1:-1;
    return `M${sx},${sy} C${sx+c*sg},${sy} ${ex-c*sg},${ey} ${ex},${ey}`;
  }
}

// ─────────────────────────────────────────────────────────────────
// WhiteboardList
// ─────────────────────────────────────────────────────────────────
function WhiteboardList({ boards, setBoards, onOpen, onClose, session, boardShareIds, setBoardShareIds }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showTpl, setShowTpl] = useState(false);
  const [sharingBoard, setSharingBoard] = useState(null); // board being shared
  const [boardCollaborators, setBoardCollaborators] = useState({}); // boardId → collabs[]

  // Load collaborators for shared boards
  useEffect(() => {
    const sharedBoardIds = Object.values(boardShareIds ?? {});
    if (!sharedBoardIds.length) return;
    Promise.all(
      Object.entries(boardShareIds).map(async ([boardId, sharedObjId]) => {
        const c = await getCollaborators(sharedObjId);
        return [boardId, c];
      })
    ).then(entries => {
      setBoardCollaborators(Object.fromEntries(entries));
    });
  }, [boardShareIds]);

  const createBlank = () => {
    const name = newName.trim() || "New Whiteboard";
    const b = { id:uid(), title:name, description:"", createdAt:Date.now(), updatedAt:Date.now(), blocks:[], connections:[] };
    setBoards(p => [...p, b]);
    setCreating(false); setNewName("");
    onOpen(b.id);
  };

  const createFromTpl = (tpl) => {
    const idMap = {};
    const blocks = tpl.blocks.map(b => { const nid=uid(); idMap[b.id]=nid; return {...b, id:nid}; });
    const connections = tpl.connections.map(c => ({ id:uid(), from:idMap[c.from], to:idMap[c.to] }));
    const b = { id:uid(), title:tpl.name, description:"", createdAt:Date.now(), updatedAt:Date.now(), blocks, connections };
    setBoards(p => [...p, b]);
    setShowTpl(false);
    onOpen(b.id);
  };

  const deleteBoard = (e, id) => {
    e.stopPropagation();
    if (window.confirm("Delete this whiteboard?")) setBoards(p => p.filter(b => b.id !== id));
  };

  return (
    <div className="wb-list">
      <div className="wb-list-header">
        <div className="wb-list-title">
          {onClose && (
            <button className="wb-back" onClick={onClose} title="Back" style={{marginRight:4}}>
              <ChevronLeft size={18}/>
            </button>
          )}
          <Layers size={18}/> Whiteboards
        </div>
        <div className="wb-list-header-actions">
          <button className="wb-btn-outline" onClick={() => setShowTpl(true)}>Use Template</button>
          <button className="wb-btn-primary" onClick={() => setCreating(true)}><Plus size={14}/> New Board</button>
        </div>
      </div>

      <div className="wb-list-body">
      {creating && (
        <div className="wb-create-row">
          <input className="wb-create-input" placeholder="Board name…" value={newName}
            onChange={e=>setNewName(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter')createBlank(); if(e.key==='Escape'){setCreating(false);setNewName("");} }}
            autoFocus />
          <button className="wb-btn-primary" onClick={createBlank}><Check size={14}/></button>
          <button className="wb-btn-ghost" onClick={()=>{setCreating(false);setNewName("");}}><X size={14}/></button>
        </div>
      )}

      {boards.length === 0 && !creating ? (
        <div className="wb-empty">
          <Layers size={48} style={{opacity:.08}}/>
          <p>No whiteboards yet.</p>
          <p className="wb-empty-sub">Plan your big projects visually — map goals, tasks, and deadlines before turning them into action.</p>
          <button className="wb-btn-primary" onClick={()=>setShowTpl(true)}>
            <Sparkles size={14}/> Start from a Template
          </button>
        </div>
      ) : (
        <div className="wb-grid">
          {[...boards].reverse().map(board => {
            const goalBlock = board.blocks?.find(b=>b.type==='goal');
            const blockCount = board.blocks?.length ?? 0;
            return (
              <div key={board.id} className="wb-card" onClick={()=>onOpen(board.id)}>
                <div className="wb-card-preview">
                  {board.blocks?.slice(0,8).map(b => {
                    const info = BT[b.type]; const I = info?.Icon;
                    return (
                      <div key={b.id} className={`wb-card-mini wb-mini-${b.type}`} style={{'--bc':info?.color}}>
                        {I && <I size={9}/>}
                      </div>
                    );
                  })}
                </div>
                <div className="wb-card-body">
                  <div className="wb-card-name">{board.title}</div>
                  {goalBlock && <div className="wb-card-goal">{goalBlock.title}</div>}
                  <div className="wb-card-meta">{blockCount} block{blockCount!==1?'s':''} · {new Date(board.updatedAt).toLocaleDateString()}</div>
                </div>
                <div className="wb-card-footer-actions">
                  {boardCollaborators[board.id]?.length > 0 && (
                    <CollaboratorAvatars
                      collaborators={boardCollaborators[board.id]}
                      max={3} size={18}
                      onClick={e => { e.stopPropagation(); setSharingBoard(board); }}
                    />
                  )}
                  <button className="wb-card-share" title="Share board"
                    onClick={e => { e.stopPropagation(); setSharingBoard(board); }}>
                    <Share2 size={12} />
                    {boardShareIds?.[board.id] ? <Users size={11} /> : "Share"}
                  </button>
                  <button className="wb-card-del" onClick={e=>deleteBoard(e,board.id)}><Trash2 size={13}/></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      </div>{/* wb-list-body */}

      {sharingBoard && (
        <ShareModal
          objectType="whiteboard"
          objectData={sharingBoard}
          sharedObjectId={boardShareIds?.[sharingBoard.id] ?? null}
          session={session}
          onClose={() => setSharingBoard(null)}
          onSharedObjectId={(id) => {
            setBoardShareIds?.(prev => ({ ...(prev ?? {}), [sharingBoard.id]: id }));
          }}
        />
      )}

      {showTpl && (
        <div className="wb-overlay" onClick={()=>setShowTpl(false)}>
          <div className="wb-tpl-modal" onClick={e=>e.stopPropagation()}>
            <div className="wb-tpl-header">
              <span>Choose a Template</span>
              <button className="wb-modal-close" onClick={()=>setShowTpl(false)}><X size={16}/></button>
            </div>
            <div className="wb-tpl-grid">
              {TEMPLATES.map(t=>(
                <button key={t.id} className="wb-tpl-card" onClick={()=>createFromTpl(t)}>
                  <span className="wb-tpl-emoji">{t.emoji}</span>
                  <span className="wb-tpl-name">{t.name}</span>
                  <span className="wb-tpl-count">{t.blocks.length} blocks</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// WhiteboardEditor
// ─────────────────────────────────────────────────────────────────
function WhiteboardEditor({ board, onChange, onClose, onAskNora, onConvertTask, sharedObjectId, session, onSharedObjectId }) {
  const [blocks, setBlocks] = useState(board.blocks ?? []);
  const [conns,  setConns]  = useState(board.connections ?? []);
  const [vp,     setVp]     = useState({ x: 80, y: 60, zoom: 0.85 });
  const [selected,   setSelected]   = useState(null);
  const [connecting, setConnecting] = useState(null);
  const [editing,    setEditing]    = useState(null);
  const [showAI,     setShowAI]     = useState(false);
  const [isPanning,  setIsPanning]  = useState(false);
  const [showShare,  setShowShare]  = useState(false);

  const wrapRef  = useRef(null);
  const drag     = useRef(null);
  const spaceRef = useRef(false);
  const vpRef    = useRef(vp);
  useEffect(() => { vpRef.current = vp; }, [vp]);

  // Persist
  useEffect(() => {
    onChange({ ...board, blocks, connections: conns, updatedAt: Date.now() });
  }, [blocks, conns]); // eslint-disable-line

  // Keyboard
  useEffect(() => {
    const down = e => {
      if (e.code==='Space' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) {
        spaceRef.current = true; e.preventDefault();
      }
      if ((e.key==='Delete'||e.key==='Backspace') && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) {
        if (selected) { delBlock(selected); setSelected(null); }
      }
      if (e.key==='Escape') { setConnecting(null); setSelected(null); setEditing(null); }
    };
    const up = e => { if (e.code==='Space') spaceRef.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [selected]); // eslint-disable-line

  // Wheel zoom
  const handleWheel = useCallback(e => {
    e.preventDefault();
    const r = wrapRef.current.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const factor = e.deltaY < 0 ? 1.1 : 1/1.1;
    setVp(v => {
      const nz = Math.max(0.2, Math.min(3, v.zoom * factor));
      return { zoom: nz, x: mx-(mx-v.x)*(nz/v.zoom), y: my-(my-v.y)*(nz/v.zoom) };
    });
  }, []);
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Mutations
  const updBlock = useCallback((id, patch) => setBlocks(p => p.map(b => b.id===id ? {...b,...patch} : b)), []);
  const delBlock = useCallback(id => {
    setBlocks(p => p.filter(b => b.id!==id));
    setConns(p => p.filter(c => c.from!==id && c.to!==id));
  }, []);

  const addBlock = (type) => {
    const s = BS[type];
    const v = vpRef.current;
    const cx = (wrapRef.current.offsetWidth/2  - v.x) / v.zoom;
    const cy = (wrapRef.current.offsetHeight/2 - v.y) / v.zoom;
    const b = { id:uid(), type, title:BT[type].label, content:"", x:cx-s.w/2, y:cy-s.h/2, w:s.w, h:s.h, completed:false, dueDate:null };
    setBlocks(p => [...p, b]);
    setSelected(b.id);
    setEditing(b.id);
  };

  // Mouse handlers
  const onWrapDown = e => {
    if (connecting) {
      setConnecting(null);
      return;
    }
    if (e.button === 0 || e.button === 1) {
      drag.current = { type:'pan', sx:e.clientX, sy:e.clientY, ox:vpRef.current.x, oy:vpRef.current.y, moved: false };
      setIsPanning(true);
      e.preventDefault();
    }
  };

  const onBlockDown = (e, block) => {
    e.stopPropagation();
    if (connecting && connecting!==block.id) return;
    if (!connecting) {
      drag.current = { type:'block', id:block.id, sx:e.clientX, sy:e.clientY, ox:block.x, oy:block.y, zoom:vpRef.current.zoom };
    }
  };

  const onResizeDown = (e, block, dir) => {
    e.stopPropagation();
    drag.current = { type:'resize', id:block.id, dir, sx:e.clientX, sy:e.clientY, ox:block.x, oy:block.y, ow:block.w, oh:block.h, zoom:vpRef.current.zoom };
  };

  const onMouseMove = e => {
    if (!drag.current) return;
    const d = drag.current;
    if (d.type==='pan') {
      const dx = e.clientX-d.sx, dy = e.clientY-d.sy;
      if (!d.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) d.moved = true;
      setVp(v => ({ ...v, x: d.ox+dx, y: d.oy+dy }));
    } else if (d.type==='block') {
      const dx=(e.clientX-d.sx)/d.zoom, dy=(e.clientY-d.sy)/d.zoom;
      updBlock(d.id, { x:Math.max(0,d.ox+dx), y:Math.max(0,d.oy+dy) });
    } else if (d.type==='resize') {
      const MIN_W=120, MIN_H=60;
      const dx=(e.clientX-d.sx)/d.zoom, dy=(e.clientY-d.sy)/d.zoom;
      const patch = {};
      if (d.dir.includes('e')) patch.w = Math.max(MIN_W, d.ow + dx);
      if (d.dir.includes('s')) patch.h = Math.max(MIN_H, d.oh + dy);
      if (d.dir.includes('w')) {
        const nw = Math.max(MIN_W, d.ow - dx);
        patch.w = nw; patch.x = Math.max(0, d.ox + d.ow - nw);
      }
      if (d.dir.includes('n')) {
        const nh = Math.max(MIN_H, d.oh - dy);
        patch.h = nh; patch.y = Math.max(0, d.oy + d.oh - nh);
      }
      updBlock(d.id, patch);
    }
  };

  const onMouseUp = () => {
    if (drag.current?.type === 'pan' && !drag.current.moved) {
      setSelected(null);
    }
    setIsPanning(false);
    drag.current = null;
  };

  const onBlockClick = (e, id) => {
    e.stopPropagation();
    if (connecting && connecting!==id) {
      const dup = conns.some(c=>(c.from===connecting&&c.to===id)||(c.from===id&&c.to===connecting));
      if (!dup) setConns(p=>[...p,{id:uid(),from:connecting,to:id}]);
      setConnecting(null);
    } else {
      setSelected(id);
    }
  };

  const fitView = () => {
    if (!blocks.length || !wrapRef.current) return;
    const minX=Math.min(...blocks.map(b=>b.x)), minY=Math.min(...blocks.map(b=>b.y));
    const maxX=Math.max(...blocks.map(b=>b.x+b.w)), maxY=Math.max(...blocks.map(b=>b.y+b.h));
    const pw=wrapRef.current.offsetWidth, ph=wrapRef.current.offsetHeight;
    const pad=80;
    const zoom=Math.min(1.5,(pw-pad*2)/Math.max(1,maxX-minX),(ph-pad*2)/Math.max(1,maxY-minY));
    setVp({ zoom, x:pw/2-(minX+(maxX-minX)/2)*zoom, y:ph/2-(minY+(maxY-minY)/2)*zoom });
  };

  // Project health
  const total = blocks.length;
  const done = blocks.filter(b=>b.completed).length;
  const dlCount = blocks.filter(b=>b.type==='deadline').length;
  const progress = total ? Math.round(done/total*100) : 0;
  const risk = dlCount>2 ? "High" : dlCount>0 ? "Medium" : "Low";
  const riskColor = risk==="High"?"#ef4444":risk==="Medium"?"#f59e0b":"#10b981";

  // Canvas bounds
  const canW = Math.max(2000, ...blocks.map(b=>b.x+b.w+300));
  const canH = Math.max(1400, ...blocks.map(b=>b.y+b.h+300));

  const editBlock = blocks.find(b=>b.id===editing);

  return (
    <div className="wb-editor" onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>

      {/* Top bar */}
      <div className="wb-topbar">
        <button className="wb-back" onClick={onClose}><ChevronLeft size={18}/></button>
        <span className="wb-board-title">{board.title}</span>
        <div className="wb-health-row">
          <span className="wb-hpill wb-hpill-prog">{progress}% done</span>
          <span className="wb-hpill">{total} block{total!==1?'s':''}</span>
          <span className="wb-hpill" style={{color:riskColor}}>Risk: {risk}</span>
        </div>
        <button className="wb-share-btn" onClick={()=>setShowShare(true)} title="Share whiteboard">
          <Share2 size={14}/>
          {sharedObjectId ? <Users size={12}/> : "Share"}
        </button>
        <button className={`wb-ai-btn${showAI?' wb-ai-btn-on':''}`} onClick={()=>setShowAI(v=>!v)}>
          <Sparkles size={14}/> Ask Nora
        </button>
      </div>

      {showShare && (
        <ShareModal
          objectType="whiteboard"
          objectData={board}
          sharedObjectId={sharedObjectId}
          session={session}
          onClose={()=>setShowShare(false)}
          onSharedObjectId={onSharedObjectId}
        />
      )}

      {/* Toolbar */}
      <div className="wb-toolbar">
        {Object.entries(BT).map(([type,info]) => {
          const I=info.Icon;
          return (
            <button key={type} className="wb-tool-btn" style={{'--tc':info.color}} onClick={()=>addBlock(type)} title={`Add ${info.label}`}>
              <I size={13}/> <span>{info.label}</span>
            </button>
          );
        })}
        <div className="wb-tool-sep"/>
        <button className="wb-tool-icon" title="Zoom in"  onClick={()=>setVp(v=>({...v,zoom:Math.min(3,v.zoom*1.2)}))}>  <ZoomIn  size={15}/></button>
        <button className="wb-tool-icon" title="Zoom out" onClick={()=>setVp(v=>({...v,zoom:Math.max(0.2,v.zoom/1.2)}))}>  <ZoomOut size={15}/></button>
        <button className="wb-tool-icon" title="Fit view" onClick={fitView}><Activity size={15}/></button>
      </div>

      {/* Canvas */}
      <div ref={wrapRef} className={`wb-canvas-wrap${connecting?' wb-mode-connect':''}${isPanning?' wb-panning':''}`} onMouseDown={onWrapDown}>
        <div className="wb-canvas"
          style={{ transform:`translate(${vp.x}px,${vp.y}px) scale(${vp.zoom})`, transformOrigin:'0 0', width:canW, height:canH }}>

          {/* SVG connections */}
          <svg className="wb-svg" width={canW} height={canH}
            style={{position:'absolute',top:0,left:0,pointerEvents:'none',overflow:'visible'}}>
            <defs>
              <marker id="wb-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" className="wb-arrow-fill"/>
              </marker>
            </defs>
            {conns.map(c => {
              const fa=blocks.find(b=>b.id===c.from), tb=blocks.find(b=>b.id===c.to);
              if(!fa||!tb) return null;
              const d = smartPath(fa, tb);
              return (
                <g key={c.id} className="wb-conn-g"
                  onClick={()=>setConns(p=>p.filter(x=>x.id!==c.id))}
                  style={{pointerEvents:'stroke',cursor:'pointer'}}>
                  <path d={d} className="wb-conn-hit"/>
                  <path d={d} className="wb-conn-line" markerEnd="url(#wb-arrow)"/>
                </g>
              );
            })}
            {connecting && (() => {
              const fb = blocks.find(b=>b.id===connecting);
              if(!fb) return null;
              return <circle cx={fb.x+fb.w/2} cy={fb.y+fb.h/2} r={Math.max(fb.w,fb.h)/2+8}
                fill="none" stroke={BT[fb.type]?.color??'#8b5cf6'} strokeWidth="2" strokeDasharray="5 4" opacity="0.55"/>;
            })()}
          </svg>

          {/* Blocks */}
          {blocks.map(block => {
            const info = BT[block.type] ?? BT.idea;
            const I = info.Icon;
            const isSel = selected===block.id;
            const isConnSrc = connecting===block.id;
            return (
              <div key={block.id}
                className={`wb-block wb-block-${block.type}${isSel?' wb-sel':''}${isConnSrc?' wb-conn-src':''}${block.completed?' wb-done':''}`}
                style={{ left:block.x, top:block.y, width:block.w, height:block.h, '--bc':info.color,
                  cursor: connecting ? 'crosshair' : (drag.current?.id===block.id ? 'grabbing' : 'grab') }}
                onMouseDown={e=>onBlockDown(e,block)}
                onClick={e=>onBlockClick(e,block.id)}
                onDoubleClick={e=>{e.stopPropagation();setEditing(block.id);}}
              >
                <div className="wb-block-top">
                  <span className="wb-type-badge"><I size={10}/>{info.label}</span>
                  {block.completed && <Check size={12} className="wb-done-check"/>}
                </div>
                <div className="wb-block-title">{block.title}</div>
                {block.content && <div className="wb-block-content">{block.content}</div>}
                {block.dueDate && block.type==='deadline' && (
                  <div className="wb-block-date">{new Date(block.dueDate).toLocaleDateString()}</div>
                )}

                {isSel && (
                  <div className="wb-block-actions">
                    <button className={`wb-blk-act${isConnSrc?' wb-blk-act-on':''}`}
                      title="Connect" onClick={e=>{e.stopPropagation();setConnecting(v=>v===block.id?null:block.id);}}>
                      <Link2 size={11}/>
                    </button>
                    <button className="wb-blk-act" title="Edit"
                      onClick={e=>{e.stopPropagation();setEditing(block.id);}}>
                      <Edit3 size={11}/>
                    </button>
                    <button className="wb-blk-act wb-blk-del" title="Delete"
                      onClick={e=>{e.stopPropagation();delBlock(block.id);setSelected(null);}}>
                      <Trash2 size={11}/>
                    </button>
                  </div>
                )}
                {isSel && ['n','s','e','w','ne','nw','se','sw'].map(dir => (
                  <div key={dir} className={`wb-rh wb-rh-${dir}`} onMouseDown={e=>onResizeDown(e,block,dir)}/>
                ))}
              </div>
            );
          })}

          {blocks.length===0 && (
            <div className="wb-hint">
              <p>Add blocks using the toolbar above</p>
              <p className="wb-hint-sub">Drag blocks to reposition · Double-click to edit · Click a block's link icon to connect</p>
            </div>
          )}
        </div>

        <div className="wb-zoom-pill">{Math.round(vp.zoom*100)}%</div>
        {connecting && <div className="wb-connect-toast">Click another block to connect — Esc to cancel</div>}

        {/* AI panel — inside canvas wrap so it doesn't overlap topbar/toolbar */}
        {showAI && (
          <div className="wb-ai-panel" onMouseDown={e=>e.stopPropagation()}>
            <div className="wb-ai-panel-hdr">
              <Sparkles size={14}/> <span>Ask Nora about this board</span>
              <button className="wb-modal-close" onClick={()=>setShowAI(false)}><X size={15}/></button>
            </div>
            <div className="wb-ai-chips">
              {["Find missing steps","Identify risks","Estimate workload","Suggest next actions","Create a timeline","Convert branches into tasks"].map(p=>(
                <button key={p} className="wb-ai-chip" onClick={()=>{
                  const summary = `[Whiteboard: ${board.title}]\nBlocks: ${blocks.map(b=>`${b.type}: ${b.title}`).join('; ')}\n\nRequest: ${p}`;
                  onAskNora?.(summary);
                  setShowAI(false);
                }}>{p}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Block edit modal */}
      {editBlock && (
        <div className="wb-overlay" onClick={()=>setEditing(null)}>
          <div className="wb-edit-modal" onClick={e=>e.stopPropagation()}>
            <div className="wb-edit-header">
              <span className="wb-edit-type-badge" style={{'--bc':BT[editBlock.type]?.color}}>
                {(() => { const I=BT[editBlock.type]?.Icon; return I?<I size={12}/>:null; })()}
                {BT[editBlock.type]?.label}
              </span>
              <button className="wb-modal-close" onClick={()=>setEditing(null)}><X size={15}/></button>
            </div>
            <input className="wb-edit-title"
              value={editBlock.title}
              onChange={e=>updBlock(editBlock.id,{title:e.target.value})}
              placeholder="Block title" autoFocus/>
            <textarea className="wb-edit-content"
              value={editBlock.content??''}
              onChange={e=>updBlock(editBlock.id,{content:e.target.value})}
              placeholder="Notes, details, description…" rows={4}/>
            {editBlock.type==='deadline' && (
              <div className="wb-edit-date-row">
                <label className="wb-edit-label">Due date</label>
                <input type="date" className="wb-edit-date"
                  value={editBlock.dueDate??''}
                  onChange={e=>updBlock(editBlock.id,{dueDate:e.target.value})}/>
              </div>
            )}
            <div className="wb-edit-footer">
              <label className="wb-edit-done-label">
                <input type="checkbox" checked={!!editBlock.completed}
                  onChange={e=>updBlock(editBlock.id,{completed:e.target.checked})}/>
                Mark complete
              </label>
              <div className="wb-edit-footer-btns">
                {onConvertTask && (
                  <button className="wb-edit-convert" onClick={()=>{onConvertTask(editBlock);setEditing(null);}}>
                    <ArrowRight size={12}/> To task
                  </button>
                )}
                <button className="wb-edit-del-btn" onClick={()=>{delBlock(editBlock.id);setEditing(null);setSelected(null);}}>
                  <Trash2 size={12}/> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────
export default function Whiteboard({ onAskNora, onConvertTask, onClose, boards: boardsProp, setBoards: setBoardsProp, session }) {
  const [boardsLocal, setBoardsLocal] = useLocalStorage("nora_whiteboards", []);
  const boards = boardsProp ?? boardsLocal;
  const setBoards = setBoardsProp ?? setBoardsLocal;
  const [boardShareIds, setBoardShareIds] = useLocalStorage("nora_board_share_ids", {});
  const [openId, setOpenId] = useState(null);
  const openBoard = boards.find(b=>b.id===openId);

  const handleChange = useCallback(updated => {
    setBoards(p => p.map(b => b.id===updated.id ? updated : b));
    // Sync to shared_objects if board is shared
    if (boardShareIds[updated.id]) {
      updateSharedObject(boardShareIds[updated.id], updated, "updated").catch(() => {});
    }
  }, [setBoards, boardShareIds]);

  if (openBoard) {
    return (
      <WhiteboardEditor
        key={openBoard.id}
        board={openBoard}
        onChange={handleChange}
        onClose={()=>setOpenId(null)}
        onAskNora={onAskNora}
        onConvertTask={onConvertTask}
        sharedObjectId={boardShareIds[openBoard.id] ?? null}
        session={session}
        onSharedObjectId={(id) => setBoardShareIds(p => ({ ...p, [openBoard.id]: id }))}
      />
    );
  }
  return (
    <WhiteboardList
      boards={boards}
      setBoards={setBoards}
      onOpen={setOpenId}
      onClose={onClose}
      session={session}
      boardShareIds={boardShareIds}
      setBoardShareIds={setBoardShareIds}
    />
  );
}

// ── Lightweight mobile read-only viewer ─────────────────────────
export function MobileWhiteboardView({ onAskNora, onClose, boards: boardsProp }) {
  const [boardsLocal, setBoardsLocal] = useLocalStorage("nora_whiteboards", []);
  const boards = boardsProp ?? boardsLocal;
  const setBoards = setBoardsLocal;
  const [openId, setOpenId] = useState(null);
  const openBoard = boards.find(b=>b.id===openId);

  const deleteBoard = (e, id) => {
    e.stopPropagation();
    if (window.confirm("Delete?")) setBoards(p=>p.filter(b=>b.id!==id));
  };

  if (openBoard) {
    return (
      <div className="mob-wb-view">
        <div className="mob-wb-topbar">
          <button className="mob-wb-back" onClick={()=>setOpenId(null)}><ChevronLeft size={18}/></button>
          <span className="mob-wb-title">{openBoard.title}</span>
          {onAskNora && (
            <button className="mob-wb-ai-btn" onClick={()=>{
              const s=`[Whiteboard: ${openBoard.title}]\nBlocks: ${openBoard.blocks.map(b=>`${b.type}: ${b.title}`).join('; ')}\n\nWhat are the most important next steps?`;
              onAskNora(s);
            }}>
              <Sparkles size={14}/>
            </button>
          )}
        </div>

        <div className="mob-wb-blocks">
          {openBoard.blocks.length===0 && (
            <div className="mob-wb-empty"><p>No blocks yet — edit this board on desktop.</p></div>
          )}
          {Object.entries(
            openBoard.blocks.reduce((acc,b)=>{ (acc[b.type]??=[]).push(b); return acc; },{})
          ).map(([type,blist])=>{
            const info = BT[type]; const I = info?.Icon;
            return (
              <div key={type} className="mob-wb-section">
                <div className="mob-wb-section-title" style={{'--bc':info?.color}}>
                  {I && <I size={13}/>} {info?.label}
                </div>
                {blist.map(b=>(
                  <div key={b.id} className={`mob-wb-block${b.completed?' mob-wb-done':''}`} style={{'--bc':info?.color}}>
                    <div className="mob-wb-block-title">{b.title}</div>
                    {b.content && <div className="mob-wb-block-content">{b.content}</div>}
                    {b.dueDate && b.type==='deadline' && (
                      <div className="mob-wb-block-date">{new Date(b.dueDate).toLocaleDateString()}</div>
                    )}
                    {b.completed && <Check size={13} className="mob-wb-check"/>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mob-wb-list">
      <div className="mob-wb-list-header">
        <div className="mob-wb-list-title">
          {onClose && (
            <button className="mob-wb-back" onClick={onClose} style={{marginRight:6}}>
              <ChevronLeft size={20}/>
            </button>
          )}
          <Layers size={16}/> Whiteboards
        </div>
      </div>
      {boards.length===0 ? (
        <div className="mob-wb-list-empty">
          <Layers size={36} style={{opacity:.1}}/>
          <p>Create whiteboards on desktop to plan big projects.</p>
        </div>
      ) : (
        <div className="mob-wb-cards">
          {[...boards].reverse().map(b=>{
            const goal = b.blocks?.find(x=>x.type==='goal');
            return (
              <div key={b.id} className="mob-wb-card" onClick={()=>setOpenId(b.id)}>
                <div className="mob-wb-card-icons">
                  {b.blocks?.slice(0,5).map(bl=>{
                    const I=BT[bl.type]?.Icon;
                    return I ? <span key={bl.id} style={{color:BT[bl.type]?.color}}><I size={12}/></span> : null;
                  })}
                </div>
                <div className="mob-wb-card-name">{b.title}</div>
                {goal && <div className="mob-wb-card-goal">{goal.title}</div>}
                <div className="mob-wb-card-meta">{b.blocks?.length??0} blocks</div>
                <button className="mob-wb-card-del" onClick={e=>deleteBoard(e,b.id)}><Trash2 size={13}/></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}