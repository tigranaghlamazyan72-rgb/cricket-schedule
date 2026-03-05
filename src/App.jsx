import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot, collection, deleteDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAFZpIrw7_d-sIZzNJRcvuomHOGFZmTfGg",
  authDomain: "cricket-schedule-dad59.firebaseapp.com",
  projectId: "cricket-schedule-dad59",
  storageBucket: "cricket-schedule-dad59.firebasestorage.app",
  messagingSenderId: "67101617599",
  appId: "1:67101617599:web:4332918bd0f3b55cb5850a",
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const TEAM = [
  { name: "Арман Мусаелян",   login: "arman",  password: "arman472"  },
  { name: "Артем Виноградов", login: "artem",  password: "artem831"  },
  { name: "Гор Аракелян",      login: "gor",    password: "gor594"    },
  { name: "Анжела Лойко",      login: "anjela", password: "anjela263" },
  { name: "Маро Тамоян",      login: "maro",   password: "maro718"   },
  { name: "Гоар Акопян",      login: "goar",   password: "goar345"   },
  { name: "Армо Айрапетян",   login: "armo",   password: "armo956"   },
];
const ADMIN = { name: "Менеджер", password: "manager2024" };
const MAX_PER_SHIFT = 2;

const SHIFTS = [
  { id:"A", label:"09:00 – 17:00", short:"09–17", emoji:"🌅", bg:"#eff6ff", border:"#bfdbfe", textDark:"#1e3a8a", accent:"#1e40af" },
  { id:"B", label:"13:00 – 21:00", short:"13–21", emoji:"☀️",  bg:"#f0f9ff", border:"#bae6fd", textDark:"#0c4a6e", accent:"#075985" },
  { id:"C", label:"17:00 – 01:00", short:"17–01", emoji:"🌆", bg:"#f5f3ff", border:"#ddd6fe", textDark:"#4c1d95", accent:"#5b21b6" },
  { id:"N", label:"01:00 – 09:00", short:"01–09", emoji:"🌙", bg:"#f0fdf4", border:"#bbf7d0", textDark:"#14532d", accent:"#15803d" },
];

const RU_DAYS = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
const RU_MON  = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

function getWeek(offsetWeeks = 0) {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff + offsetWeeks * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      label: RU_DAYS[i],
      date: `${d.getDate()} ${RU_MON[d.getMonth()]}`,
      isToday: d.toDateString() === now.toDateString(),
      isWeekend: i >= 5,
    };
  });
}

function weekLabel(days) { return `${days[0].date} – ${days[6].date}`; }
function getWeekKey(days) { return days[0].key; }

function countForShift(requests, weekKey, dayKey, shiftId) {
  return TEAM.filter(m => ((requests[m.name] || {})[weekKey] || {})[dayKey] === shiftId).length;
}

function buildSchedule(requests, days, weekKey) {
  const s = {};
  days.forEach(d => { s[d.key] = {}; SHIFTS.forEach(sh => { s[d.key][sh.id] = []; }); });
  Object.entries(requests).forEach(([name, weeks]) => {
    Object.entries((weeks[weekKey] || {})).forEach(([dayKey, shiftId]) => {
      if (shiftId && s[dayKey]?.[shiftId]) s[dayKey][shiftId].push(name);
    });
  });
  return s;
}

function getUncoveredShifts(requests, dayKey, weekKey) {
  return SHIFTS.filter(shift => !TEAM.some(m => ((requests[m.name] || {})[weekKey] || {})[dayKey] === shift.id)).map(s => s.id);
}

export default function App() {
  const [requests, setRequests] = useState({});
  const [announcements, setAnnouncements] = useState([]);
  const [newAnnMsg, setNewAnnMsg] = useState("");
  const [loading, setLoading]   = useState(true);
  const [user, setUser]         = useState(null);
  const [page, setPage]         = useState("login");
  const [drafts, setDrafts]     = useState({});
  const [saved, setSaved]       = useState({});
  const [saving, setSaving]     = useState({});
  const [form, setForm]         = useState({ name:"", password:"", error:"" });
  const [showPwd, setShowPwd]   = useState(false);
  const [editModal, setEditModal] = useState(null);
  const pwdRef = useRef();

  const curDays  = getWeek(0);
  const nextDays = getWeek(1);
  const curKey   = getWeekKey(curDays);
  const nextKey  = getWeekKey(nextDays);

  // Слушатель расписания и объявлений
  useEffect(() => {
    const unsubSchedules = onSnapshot(collection(db, "schedules"), (snapshot) => {
      const data = {};
      snapshot.forEach(d => { data[d.id] = d.data() || {}; });
      setRequests(data);
      setLoading(false);
    });

    const unsubAnnouncements = onSnapshot(collection(db, "announcements"), (snapshot) => {
      const docs = [];
      snapshot.forEach(d => docs.push({ id: d.id, ...d.data() }));
      setAnnouncements(docs.sort((a, b) => b.createdAt - a.createdAt));
    });

    return () => { unsubSchedules(); unsubAnnouncements(); };
  }, []);

  function handleLogin() {
    const n = form.name.trim();
    const p = form.password.trim();
    if (!n || !p) { setForm(f=>({...f,error:"Введи имя и пароль"})); return; }
    if (n.toLowerCase() === ADMIN.name.toLowerCase() && p === ADMIN.password) {
      setUser({ name:"Менеджер", isAdmin:true }); setPage("schedule");
      setForm({ name:"", password:"", error:"" }); return;
    }
    const m = TEAM.find(x => (x.login||x.name).toLowerCase() === n.toLowerCase() && x.password === p);
    if (!m) { setForm(f=>({...f,error:"Неверное имя или пароль"})); return; }
    setUser({ name:m.name, isAdmin:false });
    const existing = requests[m.name] || {};
    setDrafts({ [curKey]: existing[curKey] || {}, [nextKey]: existing[nextKey] || {} });
    setSaved({}); setPage("pick");
    setForm({ name:"", password:"", error:"" });
  }

  function logout() { setUser(null); setPage("login"); }

  async function postAnnouncement() {
    if (!newAnnMsg.trim()) return;
    try {
      const id = Date.now().toString();
      await setDoc(doc(db, "announcements", id), {
        text: newAnnMsg,
        author: user.name,
        createdAt: Date.now()
      });
      setNewAnnMsg("");
    } catch (e) { alert("Ошибка при публикации"); }
  }

  async function deleteAnnouncement(id) {
    if(window.confirm("Удалить объявление?")) {
      await deleteDoc(doc(db, "announcements", id));
    }
  }

  function toggleShift(weekKey, dayKey, shiftId) {
    setDrafts(prev => ({
      ...prev,
      [weekKey]: { ...(prev[weekKey]||{}), [dayKey]: (prev[weekKey]||{})[dayKey] === shiftId ? null : shiftId }
    }));
    setSaved(s => ({ ...s, [weekKey]: false }));
  }

  async function handleSave(weekKey) {
    setSaving(s => ({ ...s, [weekKey]: true }));
    try {
      await setDoc(doc(db, "schedules", user.name), { ...(requests[user.name]||{}), [weekKey]: drafts[weekKey] || {} });
      setSaved(s => ({ ...s, [weekKey]: true }));
    } catch(e) { alert("Ошибка сохранения."); }
    setSaving(s => ({ ...s, [weekKey]: false }));
  }

  async function managerEditShift(memberName, weekKey, dayKey, newShiftId) {
    const existing = requests[memberName] || {};
    const weekData = { ...(existing[weekKey] || {}) };
    if (newShiftId === null) { delete weekData[dayKey]; } else { weekData[dayKey] = newShiftId; }
    await setDoc(doc(db, "schedules", memberName), { ...existing, [weekKey]: weekData });
    setEditModal(null);
  }

  function submittedFor(weekKey) {
    return TEAM.filter(m => { const d=(requests[m.name]||{})[weekKey]; return d && Object.values(d).some(v=>v); });
  }

  function getSchedWarnings(days, weekKey) {
    const w = {};
    days.forEach(d => { const unc=getUncoveredShifts(requests,d.key,weekKey); if(unc.length>0) w[d.key]=unc; });
    return w;
  }

  function getDraftWarnings(weekKey, days) {
    if (!user||user.isAdmin) return {};
    const w = {};
    days.forEach(d => {
      if ((drafts[weekKey]||{})[d.key]) return;
      const sim = {};
      TEAM.forEach(m => { sim[m.name]={...((requests[m.name]||{})[weekKey]||{})}; });
      sim[user.name] = {...(drafts[weekKey]||{})};
      const unc = SHIFTS.filter(sh=>!TEAM.some(m=>(sim[m.name]||{})[d.key]===sh.id)).map(s=>s.id);
      if (unc.length>0) w[d.key]=unc;
    });
    return w;
  }

  const curSched   = buildSchedule(requests, curDays,  curKey);
  const nextSched  = buildSchedule(requests, nextDays, nextKey);
  const curSchedW  = getSchedWarnings(curDays,  curKey);
  const nextSchedW = getSchedWarnings(nextDays, nextKey);

  function AnnouncementsBlock() {
    return (
      <div style={{ marginBottom: 32, background: "white", borderRadius: 16, padding: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 20 }}>📢</span>
          <h3 style={{ fontWeight: 800, color: "#1e3a8a" }}>Объявления</h3>
        </div>

        {user?.isAdmin && (
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <input 
              value={newAnnMsg} 
              onChange={e => setNewAnnMsg(e.target.value)}
              placeholder="Напишите важное сообщение..."
              style={{ flex: 1, padding: "10px 14px", background: "#f8fafc", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14 }}
            />
            <button onClick={postAnnouncement} style={{ padding: "10px 20px", background: "#1d4ed8", color: "white", borderRadius: 10, fontWeight: 700, fontSize: 13 }}>
              Отправить
            </button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {announcements.length === 0 && <div style={{ color: "#94a3b8", fontSize: 13, textAlign: "center" }}>Пока нет важных новостей</div>}
          {announcements.map(ann => (
            <div key={ann.id} style={{ padding: 12, borderRadius: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", position: "relative" }}>
              <div style={{ fontSize: 13, color: "#166534", lineHeight: 1.5, whiteSpace: "pre-wrap", paddingRight: 20 }}>{ann.text}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: "#16a34a", fontWeight: 600 }}>
                <span>от {ann.author?.split(" ")[0]}</span>
                <span>{new Date(ann.createdAt).toLocaleString("ru-RU", { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {user?.isAdmin && (
                <button onClick={() => deleteAnnouncement(ann.id)} style={{ position: "absolute", top: 8, right: 8, background: "none", color: "#f87171", cursor: "pointer", fontSize: 14 }}>✕</button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function EditModal() {
    if (!editModal) return null;
    const { memberName, weekKey, dayKey, dayLabel, currentShift, assignShift } = editModal;
    const wLabel = weekKey === curKey ? "Текущая неделя" : "Следующая неделя";
    const curSchedForModal = weekKey === curKey ? curSched : nextSched;

    if (!memberName) {
      const available = TEAM.filter(m => !((requests[m.name]||{})[weekKey]||{})[dayKey]);
      return (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }} onClick={()=>setEditModal(null)}>
          <div style={{ background:"white", borderRadius:16, padding:24, maxWidth:360, width:"100%", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontWeight:800, fontSize:16, color:"#1e3a8a", marginBottom:4 }}>Назначить на смену</div>
            <div style={{ fontSize:12, color:"#64748b", marginBottom:16 }}>{dayLabel} · {wLabel}</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {available.map(m => (
                <button key={m.name} onClick={()=>managerEditShift(m.name, weekKey, dayKey, assignShift)}
                  style={{ padding:"10px 14px", borderRadius:10, background:"#f8fafc", border:"1px solid #e2e8f0", color:"#1e293b", fontSize:13, fontWeight:600, cursor:"pointer", textAlign:"left" }}>
                  👤 {m.name}
                </button>
              ))}
            </div>
            <button onClick={()=>setEditModal(null)} style={{ marginTop:16, width:"100%", padding:"10px", borderRadius:10, background:"#f1f5f9", border:"none", color:"#64748b", fontSize:13, fontWeight:600, cursor:"pointer" }}>Отмена</button>
          </div>
        </div>
      );
    }

    const sh = SHIFTS.find(s=>s.id===currentShift);
    return (
      <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }} onClick={()=>setEditModal(null)}>
        <div style={{ background:"white", borderRadius:16, padding:24, maxWidth:380, width:"100%", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }} onClick={e=>e.stopPropagation()}>
          <div style={{ fontWeight:800, fontSize:16, color:"#1e3a8a", marginBottom:4 }}>Изменить смену</div>
          <div style={{ fontSize:12, color:"#64748b", marginBottom:16 }}>{memberName} · {dayLabel}</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {SHIFTS.filter(s=>s.id!==currentShift).map(shift => (
              <button key={shift.id} onClick={()=>managerEditShift(memberName, weekKey, dayKey, shift.id)}
                style={{ padding:"10px 14px", borderRadius:10, background:shift.bg, border:`1px solid ${shift.border}`, color:shift.textDark, fontSize:13, fontWeight:700, cursor:"pointer", textAlign:"left" }}>
                {shift.emoji} {shift.label}
              </button>
            ))}
            <button onClick={()=>managerEditShift(memberName, weekKey, dayKey, null)}
              style={{ padding:"10px 14px", borderRadius:10, background:"#fef2f2", border:"1px solid #fecaca", color:"#dc2626", fontSize:13, fontWeight:700, cursor:"pointer", textAlign:"left" }}>
              🏖 Убрать смену (выходной)
            </button>
          </div>
          <button onClick={()=>setEditModal(null)} style={{ marginTop:12, width:"100%", padding:"10px", borderRadius:10, background:"#f1f5f9", border:"none", color:"#64748b", fontSize:13, fontWeight:600, cursor:"pointer" }}>Отмена</button>
        </div>
      </div>
    );
  }

  function WeekPicker({ days, weekKey, label }) {
    const draft = drafts[weekKey] || {};
    return (
      <div style={{ marginBottom:32 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:"#1e3a8a", marginTop:2 }}>{weekLabel(days)}</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {saved[weekKey] && <span style={{ color:"#16a34a", fontWeight:700, fontSize:13 }}>✅ Сохранено!</span>}
            <button onClick={()=>handleSave(weekKey)} disabled={!!saving[weekKey]} style={{ padding:"10px 22px", background:saving[weekKey]?"#93c5fd":"linear-gradient(135deg,#1d4ed8,#1e3a8a)", borderRadius:10, color:"white", fontSize:13, fontWeight:700, border:"none", cursor:"pointer", boxShadow:"0 3px 10px rgba(29,78,216,0.3)" }}>
              {saving[weekKey] ? "Сохраняем..." : "💾 Подать заявку"}
            </button>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          {days.map(d => {
            const picked = draft[d.key];
            const pickedShift = SHIFTS.find(s=>s.id===picked);
            return (
              <div key={d.key} style={{ background:"white", borderRadius:12, boxShadow:"0 1px 3px rgba(0,0,0,0.07)", padding:"12px 16px", border:`2px solid ${d.isToday?"#3b82f6":"#f1f5f9"}`, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                <div style={{ minWidth:64 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:d.isToday?"#1d4ed8":d.isWeekend?"#94a3b8":"#1e293b" }}>{d.label}</div>
                  <div style={{ fontSize:11, color:"#94a3b8", marginTop:1 }}>{d.date}</div>
                </div>
                {picked && pickedShift && <span style={{ background:pickedShift.bg, border:`1px solid ${pickedShift.border}`, color:pickedShift.textDark, borderRadius:7, padding:"3px 10px", fontSize:11, fontWeight:700 }}>{pickedShift.emoji} {pickedShift.label}</span>}
                <div style={{ display:"flex", gap:5, flex:1, flexWrap:"wrap", justifyContent:"flex-end" }}>
                  {SHIFTS.map(shift => {
                    const active = picked === shift.id;
                    const count  = countForShift(requests, weekKey, d.key, shift.id);
                    const full   = count >= MAX_PER_SHIFT && !active;
                    return (
                      <button key={shift.id} onClick={()=>!full&&toggleShift(weekKey,d.key,shift.id)}
                        style={{ padding:"7px 11px", borderRadius:8, background:active?shift.bg:full?"#f1f5f9":"#f8fafc", border:`2px solid ${active?shift.accent:"#e2e8f0"}`, color:active?shift.textDark:full?"#cbd5e1":"#64748b", fontSize:11, fontWeight:700, opacity:full?0.5:1, cursor:full?"not-allowed":"pointer", position:"relative" }}>
                        {shift.emoji} {shift.short}
                        {!full&&count>0&&!active && <span style={{ position:"absolute", top:-6, right:-6, background:"#f59e0b", color:"white", borderRadius:"50%", width:14, height:14, fontSize:9, display:"flex", alignItems:"center", justifyContent:"center" }}>{count}</span>}
                      </button>
                    );
                  })}
                  <button onClick={()=>toggleShift(weekKey,d.key,null)} style={{ padding:"7px 11px", borderRadius:8, background:!picked?"#fef2f2":"#f8fafc", border:`2px solid ${!picked?"#fca5a5":"#e2e8f0"}`, color:!picked?"#dc2626":"#94a3b8", fontSize:11, fontWeight:700 }}>🏖 Вых.</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function WeekSchedule({ days, weekKey, sched, warnings, label }) {
    const sub = submittedFor(weekKey);
    const totalWarn = Object.values(warnings).reduce((a,b)=>a+b.length,0);
    return (
      <div style={{ marginBottom:40 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase" }}>{label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:"#1e3a8a", marginTop:2 }}>{weekLabel(days)}</div>
          </div>
          <div style={{ fontSize:13, color:"#64748b" }}>Подали: <span style={{ color:"#1d4ed8", fontWeight:700 }}>{sub.length}</span> / {TEAM.length}</div>
        </div>
        
        {totalWarn > 0 && (
          <div style={{ background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:10, padding:"12px 16px", marginBottom:12 }}>
            <div style={{ fontWeight:700, color:"#c2410c", fontSize:13 }}>⚠️ Незакрытые смены ({totalWarn})</div>
          </div>
        )}

        <div style={{ background:"white", borderRadius:14, boxShadow:"0 1px 4px rgba(0,0,0,0.06)", overflow:"hidden" }}>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", minWidth:600 }}>
              <thead>
                <tr style={{ background:"#1e3a8a" }}>
                  <th style={{ padding:"12px 14px", textAlign:"left", fontSize:11, color:"#93c5fd" }}>СМЕНА</th>
                  {days.map(d => <th key={d.key} style={{ padding:"12px 8px", fontSize:11, color:"white" }}>{d.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {SHIFTS.map((shift, si) => (
                  <tr key={shift.id} style={{ borderBottom:"1px solid #f1f5f9", background:si%2===0?"white":"#fafbff" }}>
                    <td style={{ padding:"12px 14px", fontWeight:700, fontSize:12 }}>{shift.emoji} {shift.label}</td>
                    {days.map(d => {
                      const people = sched[d.key][shift.id] || [];
                      return (
                        <td key={d.key} style={{ padding:"8px 6px", textAlign:"center" }}>
                          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                            {people.map(p => (
                              <div key={p} onClick={()=>user?.isAdmin&&setEditModal({ memberName:p, weekKey, dayKey:d.key, dayLabel:`${d.label} ${d.date}`, currentShift:shift.id })}
                                style={{ background:shift.bg, border:`1px solid ${shift.border}`, borderRadius:6, padding:"2px 7px", fontSize:10, fontWeight:600, cursor:user?.isAdmin?"pointer":"default" }}>
                                {p.split(" ")[0]}
                              </div>
                            ))}
                            {user?.isAdmin && people.length < MAX_PER_SHIFT && (
                               <button onClick={()=>setEditModal({ memberName:null, weekKey, dayKey:d.key, dayLabel:`${d.label} ${d.date}`, currentShift:shift.id, assignShift:shift.id })}
                               style={{ background:"none", border:"1px dashed #cbd5e1", borderRadius:6, fontSize:9, color:"#94a3b8" }}>+</button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <div style={{ minHeight:"100vh", background:"#f0f4ff", display:"flex", alignItems:"center", justifyContent:"center" }}>Загрузка...</div>;

  return (
    <div style={{ minHeight:"100vh", background:"#f0f4ff", fontFamily:"'Inter',sans-serif", color:"#1e293b" }}>
      <EditModal />
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap'); *{box-sizing:border-box; margin:0; padding:0}`}</style>

      <header style={{ background:"#1e3a8a", padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:60, position:"sticky", top:0, zIndex:10 }}>
        <div style={{ color:"white", fontWeight:800 }}>🏏 Cricket Live</div>
        <div style={{ display:"flex", gap:8 }}>
          {user && <>
            <span style={{ color:"white", fontSize:12, alignSelf:"center" }}>{user.name}</span>
            {!user.isAdmin && <button onClick={()=>setPage(page==="schedule"?"pick":"schedule")} style={{ background:"rgba(255,255,255,0.1)", color:"white", padding:"5px 10px", borderRadius:8, fontSize:12 }}>{page==="schedule"?"✏️ Мои смены":"📋 Расписание"}</button>}
            <button onClick={logout} style={{ background:"rgba(239,68,68,0.2)", color:"#fca5a5", padding:"5px 10px", borderRadius:8, fontSize:12 }}>Выйти</button>
          </>}
        </div>
      </header>

      <main style={{ maxWidth:920, margin:"0 auto", padding:"32px 20px" }}>
        {user && <AnnouncementsBlock />}

        {page==="login" && (
          <div style={{ maxWidth:400, margin:"80px auto", background:"white", padding:40, borderRadius:20, boxShadow:"0 10px 25px rgba(0,0,0,0.05)" }}>
            <h2 style={{ textAlign:"center", marginBottom:24, color:"#1e3a8a" }}>Вход</h2>
            <input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} placeholder="Логин" style={{ width:"100%", padding:12, marginBottom:12, borderRadius:10, border:"1px solid #e2e8f0" }} />
            <input type="password" value={form.password} onChange={e=>setForm({...form, password:e.target.value})} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="Пароль" style={{ width:"100%", padding:12, marginBottom:20, borderRadius:10, border:"1px solid #e2e8f0" }} />
            {form.error && <div style={{ color:"red", fontSize:12, marginBottom:12 }}>{form.error}</div>}
            <button onClick={handleLogin} style={{ width:"100%", padding:12, background:"#1d4ed8", color:"white", borderRadius:10, fontWeight:700 }}>Войти</button>
          </div>
        )}

        {page==="pick" && user && !user.isAdmin && (
          <div>
            <WeekPicker days={curDays} weekKey={curKey} label="Текущая неделя" />
            <WeekPicker days={nextDays} weekKey={nextKey} label="Следующая неделя" />
          </div>
        )}

        {page==="schedule" && (
          <div>
            <WeekSchedule days={curDays} weekKey={curKey} sched={curSched} warnings={curSchedW} label="Текущая неделя" />
            <WeekSchedule days={nextDays} weekKey={nextKey} sched={nextSched} warnings={nextSchedW} label="Следующая неделя" />
          </div>
        )}
      </main>
    </div>
  );
}
