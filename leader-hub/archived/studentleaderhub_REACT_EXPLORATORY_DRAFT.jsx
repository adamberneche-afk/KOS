// ============================================================================
// NOT THE DEPLOYED APP — exploratory React/JSX draft only.
// The live, actively-maintained app is ../student-leader-hub.html (a
// single static file, no build step, no React). This file uses
// placeholder data ("Maya Chen" etc.) and isn't wired into anything — kept
// for reference, not maintained alongside the real app. Filed here
// alongside archived/studentleaderhub_EARLY_PROTOTYPE.html — a real
// superseded design, not a duplicate — per this repo's convention of
// keeping every non-deployed design under archived/ rather than at the
// leader-hub/ top level. See leader-hub/README.md's Layout table.
// ============================================================================
import { useState, useEffect } from "react";

const initialData = {
  fieldTrips: [
    { id: 1, name: "Business District Tour", date: "2026-03-15", location: "Downtown", students: 24, status: "confirmed", notes: "Permission slips due 3/10", tasks: ["Book bus", "Send permission slips", "Confirm venue"] },
  ],
  decaEvents: [
    { id: 1, name: "District Conference", date: "2026-04-02", location: "Convention Center", students: 12, status: "planning", category: "Competition", notes: "Register by 3/20", tasks: ["Register competitors", "Reserve hotel", "Practice sessions"] },
  ],
  leaders: [
    { id: 1, name: "Maya Chen", role: "President", project: "Food Drive", hours: 24, badge: "gold", skills: ["Public Speaking", "Fundraising"] },
    { id: 2, name: "Jordan Rivera", role: "VP Marketing", project: "Social Media Campaign", hours: 18, badge: "silver", skills: ["Design", "Writing"] },
    { id: 3, name: "Aiden Park", role: "Secretary", project: "Community Newsletter", hours: 15, badge: "silver", skills: ["Writing", "Organization"] },
  ],
  announcements: [
    { id: 1, text: "Permission slips for Business District Tour due March 10!", priority: "high" },
    { id: 2, text: "DECA District registration deadline: March 20", priority: "medium" },
  ]
};

const BADGE_COLORS = { gold: "#F59E0B", silver: "#94A3B8", bronze: "#B45309" };
const STATUS_STYLES = {
  confirmed: { bg: "#DCFCE7", color: "#166534", label: "Confirmed" },
  planning: { bg: "#FEF9C3", color: "#854D0E", label: "Planning" },
  completed: { bg: "#E0E7FF", color: "#3730A3", label: "Completed" },
};

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [data, setData] = useState(initialData);
  const [modal, setModal] = useState(null); // { type, item }
  const [form, setForm] = useState({});
  const [newTask, setNewTask] = useState("");
  const [confetti, setConfetti] = useState(false);

  const triggerConfetti = () => { setConfetti(true); setTimeout(() => setConfetti(false), 2000); };

  const addTrip = () => {
    const trip = { id: Date.now(), name: form.name || "New Trip", date: form.date || "", location: form.location || "", students: parseInt(form.students) || 0, status: "planning", notes: form.notes || "", tasks: [] };
    setData(d => ({ ...d, fieldTrips: [...d.fieldTrips, trip] }));
    setModal(null); setForm({});
  };

  const addEvent = () => {
    const evt = { id: Date.now(), name: form.name || "New Event", date: form.date || "", location: form.location || "", students: parseInt(form.students) || 0, status: "planning", category: form.category || "Competition", notes: form.notes || "", tasks: [] };
    setData(d => ({ ...d, decaEvents: [...d.decaEvents, evt] }));
    setModal(null); setForm({});
  };

  const addLeader = () => {
    const leader = { id: Date.now(), name: form.name || "New Leader", role: form.role || "Member", project: form.project || "", hours: 0, badge: "bronze", skills: (form.skills || "").split(",").map(s => s.trim()).filter(Boolean) };
    setData(d => ({ ...d, leaders: [...d.leaders, leader] }));
    setModal(null); setForm({}); triggerConfetti();
  };

  const addTaskToItem = (type, id) => {
    if (!newTask.trim()) return;
    setData(d => {
      const key = type === "trip" ? "fieldTrips" : "decaEvents";
      return { ...d, [key]: d[key].map(i => i.id === id ? { ...i, tasks: [...(i.tasks || []), newTask.trim()] } : i) };
    });
    setNewTask("");
  };

  const removeTask = (type, id, idx) => {
    const key = type === "trip" ? "fieldTrips" : "decaEvents";
    setData(d => ({ ...d, [key]: d[key].map(i => i.id === id ? { ...i, tasks: i.tasks.filter((_, ti) => ti !== idx) } : i) }));
  };

  const updateStatus = (type, id, status) => {
    const key = type === "trip" ? "fieldTrips" : "decaEvents";
    setData(d => ({ ...d, [key]: d[key].map(i => i.id === id ? { ...i, status } : i) }));
    if (status === "completed") triggerConfetti();
  };

  const addHours = (lid, h) => {
    setData(d => ({ ...d, leaders: d.leaders.map(l => l.id === lid ? { ...l, hours: Math.max(0, l.hours + h), badge: l.hours + h >= 30 ? "gold" : l.hours + h >= 20 ? "silver" : "bronze" } : l) }));
  };

  const totalStudents = [...data.fieldTrips, ...data.decaEvents].reduce((a, b) => a + (b.students || 0), 0);
  const upcoming = [...data.fieldTrips, ...data.decaEvents].filter(e => e.status !== "completed").sort((a, b) => a.date > b.date ? 1 : -1).slice(0, 3);

  const tabs = [
    { key: "dashboard", label: "Dashboard", icon: "⚡" },
    { key: "trips", label: "Field Trips", icon: "🚌" },
    { key: "deca", label: "DECA Events", icon: "🏆" },
    { key: "leaders", label: "Student Leaders", icon: "🌟" },
  ];

  return (
    <div style={{ fontFamily: "'Georgia', serif", minHeight: "100vh", background: "#0F172A", color: "#F1F5F9" }}>
      {/* Confetti */}
      {confetti && (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999 }}>
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} style={{
              position: "absolute", width: 10, height: 10, borderRadius: "50%",
              background: ["#F59E0B", "#10B981", "#3B82F6", "#EC4899", "#8B5CF6"][i % 5],
              left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
              animation: `fall 1.5s ease-out forwards`, animationDelay: `${Math.random() * 0.5}s`,
              opacity: Math.random(),
            }} />
          ))}
          <style>{`@keyframes fall { to { transform: translateY(200px) rotate(720deg); opacity: 0; } }`}</style>
        </div>
      )}

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)", borderBottom: "1px solid #1E3A5F", padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #F59E0B, #EF4444)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>⚡</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px", color: "#F8FAFC" }}>LeadHub</div>
            <div style={{ fontSize: 12, color: "#94A3B8", letterSpacing: "2px", textTransform: "uppercase" }}>Student Leadership Command Center</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {data.announcements.map(a => (
            <div key={a.id} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 20, background: a.priority === "high" ? "#FEF2F2" : "#FFF7ED", color: a.priority === "high" ? "#DC2626" : "#D97706", border: `1px solid ${a.priority === "high" ? "#FECACA" : "#FED7AA"}`, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {a.priority === "high" ? "🔴" : "🟡"} {a.text}
            </div>
          ))}
        </div>
      </div>

      {/* Nav */}
      <div style={{ display: "flex", padding: "0 32px", gap: 4, background: "#1E293B", borderBottom: "1px solid #1E3A5F" }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "14px 20px", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600,
            background: "transparent", color: tab === t.key ? "#F59E0B" : "#94A3B8",
            borderBottom: tab === t.key ? "2px solid #F59E0B" : "2px solid transparent",
            transition: "all 0.2s", fontFamily: "Georgia, serif"
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "28px 32px", maxWidth: 1100, margin: "0 auto" }}>

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div>
            <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6, color: "#F8FAFC" }}>Good morning, Coach! 👋</h2>
            <p style={{ color: "#94A3B8", marginBottom: 28, fontSize: 14 }}>Here's your leadership program at a glance.</p>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
              {[
                { label: "Field Trips", value: data.fieldTrips.length, icon: "🚌", color: "#3B82F6" },
                { label: "DECA Events", value: data.decaEvents.length, icon: "🏆", color: "#F59E0B" },
                { label: "Student Leaders", value: data.leaders.length, icon: "🌟", color: "#10B981" },
                { label: "Total Students", value: totalStudents, icon: "👥", color: "#8B5CF6" },
              ].map(s => (
                <div key={s.label} style={{ background: "#1E293B", borderRadius: 16, padding: 20, border: "1px solid #1E3A5F", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: -10, right: -10, fontSize: 50, opacity: 0.1 }}>{s.icon}</div>
                  <div style={{ fontSize: 34, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Upcoming */}
            <div style={{ background: "#1E293B", borderRadius: 16, padding: 24, border: "1px solid #1E3A5F", marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#F8FAFC" }}>📅 Upcoming Events</h3>
              {upcoming.length === 0 && <p style={{ color: "#94A3B8", fontSize: 14 }}>No upcoming events. Add some!</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {upcoming.map(e => (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", background: "#0F172A", borderRadius: 12, border: "1px solid #1E3A5F" }}>
                    <div style={{ minWidth: 60, textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "#F59E0B", fontWeight: 700, textTransform: "uppercase" }}>{e.date ? new Date(e.date).toLocaleString("default", { month: "short" }) : "—"}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#F8FAFC" }}>{e.date ? new Date(e.date).getDate() : "—"}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{e.name}</div>
                      <div style={{ fontSize: 12, color: "#94A3B8" }}>📍 {e.location} · {e.students} students</div>
                    </div>
                    <div style={{ fontSize: 12, padding: "4px 10px", borderRadius: 20, background: STATUS_STYLES[e.status]?.bg, color: STATUS_STYLES[e.status]?.color }}>{STATUS_STYLES[e.status]?.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Leader spotlight */}
            <div style={{ background: "#1E293B", borderRadius: 16, padding: 24, border: "1px solid #1E3A5F" }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#F8FAFC" }}>🌟 Leader Spotlight</h3>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {/* FIXED: Array.prototype.sort() mutates in place and
                    returns the same array — calling it directly on
                    data.leaders (React state) reordered the actual state
                    array as a side effect of rendering this Dashboard
                    tab, so the separate "Student Leaders" tab below
                    (which also maps over data.leaders, unsorted) would
                    silently show a different order after a Dashboard
                    visit than before one. Sort a copy instead. */}
                {[...data.leaders].sort((a, b) => b.hours - a.hours).slice(0, 3).map(l => (
                  <div key={l.id} style={{ flex: 1, minWidth: 160, padding: 16, background: "#0F172A", borderRadius: 12, border: "1px solid #1E3A5F", textAlign: "center" }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>
                      {l.badge === "gold" ? "🥇" : l.badge === "silver" ? "🥈" : "🥉"}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{l.name}</div>
                    <div style={{ fontSize: 12, color: "#94A3B8" }}>{l.role}</div>
                    <div style={{ fontSize: 13, color: "#F59E0B", marginTop: 6 }}>{l.hours} hrs</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* FIELD TRIPS */}
        {tab === "trips" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <h2 style={{ fontSize: 24, fontWeight: 700 }}>🚌 Field Trips</h2>
              <button onClick={() => { setModal({ type: "addTrip" }); setForm({}); }} style={{ padding: "10px 20px", background: "linear-gradient(135deg, #3B82F6, #6366F1)", border: "none", borderRadius: 10, color: "white", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>+ New Trip</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {data.fieldTrips.map(trip => (
                <div key={trip.id} style={{ background: "#1E293B", borderRadius: 16, padding: 24, border: "1px solid #1E3A5F" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{trip.name}</div>
                      <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>📍 {trip.location} · 📅 {trip.date} · 👥 {trip.students} students</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {["planning", "confirmed", "completed"].map(s => (
                        <button key={s} onClick={() => updateStatus("trip", trip.id, s)} style={{ padding: "4px 10px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: trip.status === s ? STATUS_STYLES[s].bg : "#0F172A", color: trip.status === s ? STATUS_STYLES[s].color : "#64748B" }}>{STATUS_STYLES[s].label}</button>
                      ))}
                    </div>
                  </div>
                  {trip.notes && <div style={{ fontSize: 13, color: "#CBD5E1", marginBottom: 14, padding: "8px 12px", background: "#0F172A", borderRadius: 8 }}>📝 {trip.notes}</div>}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", marginBottom: 8 }}>CHECKLIST</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                      {(trip.tasks || []).map((task, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "#0F172A", borderRadius: 20, fontSize: 13, border: "1px solid #1E3A5F" }}>
                          ✅ {task}
                          <button onClick={() => removeTask("trip", trip.id, i)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={newTask} onChange={e => setNewTask(e.target.value)} onKeyDown={e => e.key === "Enter" && addTaskToItem("trip", trip.id)} placeholder="Add task..." style={{ flex: 1, padding: "7px 12px", background: "#0F172A", border: "1px solid #1E3A5F", borderRadius: 8, color: "#F1F5F9", fontSize: 13, outline: "none", fontFamily: "Georgia, serif" }} />
                      <button onClick={() => addTaskToItem("trip", trip.id)} style={{ padding: "7px 14px", background: "#3B82F6", border: "none", borderRadius: 8, color: "white", cursor: "pointer", fontSize: 13 }}>Add</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DECA EVENTS */}
        {tab === "deca" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <h2 style={{ fontSize: 24, fontWeight: 700 }}>🏆 DECA Events</h2>
              <button onClick={() => { setModal({ type: "addEvent" }); setForm({}); }} style={{ padding: "10px 20px", background: "linear-gradient(135deg, #F59E0B, #EF4444)", border: "none", borderRadius: 10, color: "white", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>+ New Event</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {data.decaEvents.map(evt => (
                <div key={evt.id} style={{ background: "#1E293B", borderRadius: 16, padding: 24, border: "1px solid #1E3A5F" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{evt.name}</div>
                        <span style={{ fontSize: 12, padding: "3px 9px", borderRadius: 20, background: "#1E3A5F", color: "#93C5FD" }}>{evt.category}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>📍 {evt.location} · 📅 {evt.date} · 👥 {evt.students} competitors</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {["planning", "confirmed", "completed"].map(s => (
                        <button key={s} onClick={() => updateStatus("deca", evt.id, s)} style={{ padding: "4px 10px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: evt.status === s ? STATUS_STYLES[s].bg : "#0F172A", color: evt.status === s ? STATUS_STYLES[s].color : "#64748B" }}>{STATUS_STYLES[s].label}</button>
                      ))}
                    </div>
                  </div>
                  {evt.notes && <div style={{ fontSize: 13, color: "#CBD5E1", marginBottom: 14, padding: "8px 12px", background: "#0F172A", borderRadius: 8 }}>📝 {evt.notes}</div>}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", marginBottom: 8 }}>PREP CHECKLIST</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                      {(evt.tasks || []).map((task, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "#0F172A", borderRadius: 20, fontSize: 13, border: "1px solid #1E3A5F" }}>
                          ✅ {task}
                          <button onClick={() => removeTask("deca", evt.id, i)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={newTask} onChange={e => setNewTask(e.target.value)} onKeyDown={e => e.key === "Enter" && addTaskToItem("deca", evt.id)} placeholder="Add prep task..." style={{ flex: 1, padding: "7px 12px", background: "#0F172A", border: "1px solid #1E3A5F", borderRadius: 8, color: "#F1F5F9", fontSize: 13, outline: "none", fontFamily: "Georgia, serif" }} />
                      <button onClick={() => addTaskToItem("deca", evt.id)} style={{ padding: "7px 14px", background: "#F59E0B", border: "none", borderRadius: 8, color: "white", cursor: "pointer", fontSize: 13 }}>Add</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STUDENT LEADERS */}
        {tab === "leaders" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <h2 style={{ fontSize: 24, fontWeight: 700 }}>🌟 Student Leaders</h2>
              <button onClick={() => { setModal({ type: "addLeader" }); setForm({}); }} style={{ padding: "10px 20px", background: "linear-gradient(135deg, #10B981, #3B82F6)", border: "none", borderRadius: 10, color: "white", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>+ Add Leader</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {data.leaders.map(l => (
                <div key={l.id} style={{ background: "#1E293B", borderRadius: 16, padding: 24, border: "1px solid #1E3A5F", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, right: 0, width: 80, height: 80, borderRadius: "0 16px 0 80px", background: l.badge === "gold" ? "linear-gradient(135deg, #F59E0B33, #F59E0B11)" : l.badge === "silver" ? "linear-gradient(135deg, #94A3B833, #94A3B811)" : "linear-gradient(135deg, #B4530933, #B4530911)" }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                    <div style={{ width: 52, height: 52, borderRadius: "50%", background: `linear-gradient(135deg, ${l.badge === "gold" ? "#F59E0B, #EF4444" : l.badge === "silver" ? "#94A3B8, #64748B" : "#B45309, #92400E"})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "white" }}>
                      {l.name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{l.name}</div>
                      <div style={{ fontSize: 13, color: "#94A3B8" }}>{l.role}</div>
                    </div>
                    <div style={{ marginLeft: "auto", fontSize: 24 }}>
                      {l.badge === "gold" ? "🥇" : l.badge === "silver" ? "🥈" : "🥉"}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "#CBD5E1", marginBottom: 12 }}>
                    <strong style={{ color: "#94A3B8" }}>Project:</strong> {l.project}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                    {l.skills.map(s => (
                      <span key={s} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: "#0F172A", color: "#93C5FD", border: "1px solid #1E3A5F" }}>{s}</span>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1 }}>Service Hours</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: BADGE_COLORS[l.badge] }}>{l.hours}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => addHours(l.id, -1)} style={{ width: 32, height: 32, borderRadius: 8, background: "#0F172A", border: "1px solid #1E3A5F", color: "#EF4444", cursor: "pointer", fontSize: 18, fontWeight: 700 }}>−</button>
                      <button onClick={() => addHours(l.id, 1)} style={{ width: 32, height: 32, borderRadius: 8, background: "#0F172A", border: "1px solid #1E3A5F", color: "#10B981", cursor: "pointer", fontSize: 18, fontWeight: 700 }}>+</button>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{ marginTop: 12, height: 6, background: "#0F172A", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, (l.hours / 30) * 100)}%`, height: "100%", background: `linear-gradient(90deg, ${BADGE_COLORS[l.badge]}, ${l.badge === "gold" ? "#EF4444" : l.badge === "silver" ? "#3B82F6" : "#F59E0B"})`, borderRadius: 3, transition: "width 0.4s" }} />
                  </div>
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>30 hrs = Gold · 20 hrs = Silver</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MODALS */}
      {modal && (
        <div onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#1E293B", borderRadius: 20, padding: 32, width: 440, border: "1px solid #1E3A5F", boxShadow: "0 25px 60px rgba(0,0,0,0.5)" }}>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
              {modal.type === "addTrip" ? "🚌 New Field Trip" : modal.type === "addEvent" ? "🏆 New DECA Event" : "🌟 Add Student Leader"}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { key: "name", label: "Name", placeholder: modal.type === "addLeader" ? "Student name" : "Event name" },
                ...(modal.type !== "addLeader" ? [{ key: "date", label: "Date", type: "date" }, { key: "location", label: "Location", placeholder: "Location" }, { key: "students", label: modal.type === "addEvent" ? "# Competitors" : "# Students", type: "number" }] : []),
                ...(modal.type === "addLeader" ? [{ key: "role", label: "Role", placeholder: "President, VP, etc." }, { key: "project", label: "Community Project", placeholder: "Project name" }, { key: "skills", label: "Skills (comma-separated)", placeholder: "Public Speaking, Writing" }] : []),
                { key: "notes", label: "Notes", placeholder: "Additional notes..." },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 12, color: "#94A3B8", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{f.label}</label>
                  <input type={f.type || "text"} placeholder={f.placeholder} value={form[f.key] || ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: "100%", padding: "9px 12px", background: "#0F172A", border: "1px solid #1E3A5F", borderRadius: 8, color: "#F1F5F9", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "Georgia, serif" }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, padding: "11px", background: "#0F172A", border: "1px solid #1E3A5F", borderRadius: 10, color: "#94A3B8", cursor: "pointer", fontSize: 14 }}>Cancel</button>
              <button onClick={modal.type === "addTrip" ? addTrip : modal.type === "addEvent" ? addEvent : addLeader}
                style={{ flex: 2, padding: "11px", background: modal.type === "addTrip" ? "linear-gradient(135deg, #3B82F6, #6366F1)" : modal.type === "addEvent" ? "linear-gradient(135deg, #F59E0B, #EF4444)" : "linear-gradient(135deg, #10B981, #3B82F6)", border: "none", borderRadius: 10, color: "white", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
