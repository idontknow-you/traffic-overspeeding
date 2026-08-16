// src/components/ViolationsDashboard.jsx
//
// Reads the `violations` collection directly from Firestore in real time —
// Flask is never in this read path (per your SDLC's key architectural decision).
//
// Requires: npm install firebase
// Expects a sibling ../firebase.js exporting `db` (see firebase.js provided alongside this file)

import { useEffect, useRef, useState } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { AppealButton } from "./AppealPanel";

// Client-side display-only fallback. Prefer having Flask write a real `fine`
// field on the document — this is just so the UI doesn't show blank values
// if that field isn't there yet.
const FALLBACK_FINES = { overspeeding: 1000, rash_driving: 1000, red_light: 1500 };

const TYPE_META = {
  overspeeding: { label: "Overspeeding",  pill: "bg-blue-50 text-blue-600" },
  rash_driving: { label: "Rash Driving",  pill: "bg-orange-50 text-orange-600" },
  red_light:    { label: "Red Light",     pill: "bg-amber-50 text-amber-600" },
};

function formatTime(ts) {
  if (!ts) return "—";
  const date = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function detailText(v) {
  if ((v.type === "overspeeding" || v.type === "rash_driving") && v.speed != null && v.limit != null) {
    return `${v.speed} km/h in a ${v.limit} km/h zone`;
  }
  if (v.type === "red_light") return "Crossed junction during red signal";
  return "—";
}

function locationText(v) {
  if (v.location) return v.location; // preferred, if Flask writes a zone/segment name
  if (v.gps && typeof v.gps.lat === "number") return `${v.gps.lat.toFixed(4)}, ${v.gps.lng.toFixed(4)}`;
  return "—";
}

export default function ViolationsDashboard() {
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newIds, setNewIds] = useState(() => new Set());
  const prevIdsRef = useRef(new Set()); // ref, not state — avoids stale-closure bugs inside the listener

  useEffect(() => {
    const q = query(collection(db, "violations"), orderBy("timestamp", "desc"), limit(25));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

        const newlyAdded = rows.filter((r) => !prevIdsRef.current.has(r.id)).map((r) => r.id);
        prevIdsRef.current = new Set(rows.map((r) => r.id));

        if (newlyAdded.length) {
          setNewIds((prev) => new Set([...prev, ...newlyAdded]));
          newlyAdded.forEach((id) => {
            setTimeout(() => {
              setNewIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
            }, 1500);
          });
        }

        setViolations(rows);
        setLoading(false);
      },
      (err) => {
        console.error("Firestore listener error:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe(); // critical — leaked listeners keep reading (and billing) after unmount
  }, []);

  const totalFines = violations.reduce(
    (sum, v) => sum + (v.fine ?? FALLBACK_FINES[v.type] ?? 0),
    0
  );

  return (
    <div className="min-h-screen bg-slate-100 p-6 font-sans">
      <style>{`
        @keyframes rowIn { from { background:#FEF9C3; opacity:.55; } to { background:transparent; opacity:1; } }
        .row-in { animation: rowIn 1.4s ease; }
      `}</style>

      <div className="max-w-5xl mx-auto">
        <header className="bg-slate-900 rounded-2xl px-7 py-5 mb-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-white text-xl font-extrabold">Cloud Backend — Live Violations</h1>
            <p className="text-slate-400 text-sm mt-1">Firestore → React via onSnapshot(), no polling, no Flask in the read path</p>
          </div>
          <span className="inline-flex items-center gap-2 bg-emerald-500/15 text-emerald-400 border border-emerald-400/30 text-xs font-bold px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {loading ? "CONNECTING…" : "LIVE"}
          </span>
        </header>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4 mb-5">
            Couldn't read from Firestore: {error}. Check your firebase.js config and Firestore security rules
            (the `violations` collection needs <code>allow read: if true;</code> for the prototype).
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-5">
          <StatCard label="Violations" value={violations.length} />
          <StatCard label="Fines Issued" value={`₹${totalFines.toLocaleString("en-IN")}`} />
          <StatCard label="Connection" value={loading ? "Connecting…" : "Connected"} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 text-xs font-bold border-b border-slate-100">
                <th className="px-5 py-3">Vehicle</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Detail</th>
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3">Fine</th>
                <th className="px-5 py-3">Time</th>
                <th className="px-5 py-3">Appeal</th>
              </tr>
            </thead>
            <tbody>
              {violations.map((v) => {
                const meta = TYPE_META[v.type] || { label: v.type || "Unknown", pill: "bg-slate-100 text-slate-600" };
                const fine = v.fine ?? FALLBACK_FINES[v.type] ?? 0;
                return (
                  <tr
                    key={v.id}
                    className={`border-b border-slate-50 last:border-0 ${newIds.has(v.id) ? "row-in" : ""}`}
                  >
                    <td className="px-5 py-3 font-semibold text-slate-800">{v.owner_id || v.tag_id || "—"}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${meta.pill}`}>{meta.label}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{detailText(v)}</td>
                    <td className="px-5 py-3 text-slate-600">{locationText(v)}</td>
                    <td className="px-5 py-3 font-bold text-slate-800">₹{fine.toLocaleString("en-IN")}</td>
                    <td className="px-5 py-3 text-slate-400">{formatTime(v.timestamp)}</td>
                    <td className="px-5 py-3">
                      <AppealButton violation={v} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!loading && violations.length === 0 && !error && (
            <div className="text-center text-slate-400 text-sm py-10">
              No violations logged yet — waiting for the first event from Flask.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-emerald-50 rounded-xl p-4 text-center">
      <div className="text-xl font-extrabold text-slate-900">{value}</div>
      <div className="text-[11px] font-bold text-slate-500 mt-1 tracking-wide">{label.toUpperCase()}</div>
    </div>
  );
}