// src/components/ViolationsDashboard.jsx
//
// Reads the `violations` collection directly from Firestore in real time —
// Flask is never in this read path.
//
// Requires: npm install firebase
// Expects a sibling ../firebase.js exporting `db` (see firebase.js provided alongside this file)
// All styling lives in ../styling/App.css — this component only ever
// composes class names, it never uses style={{...}}. Per-type colors
// come from CSS custom properties set by the `stc-type-<type>` classes;
// components just add `stc-type-chip` / `stc-type-text` / `stc-type-dot`
// alongside that to render with the right color.

import { useEffect, useRef, useState } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import "../styling/App.css";

const TYPE_LABEL = {
  overspeeding: "Overspeeding",
  rash_driving: "Rash Driving",
  red_light: "Red Light",
};

const FILTERS = ["all", "overspeeding", "rash_driving", "red_light"];

// Falls back to "unknown" (a neutral gray class) for anything not in TYPE_LABEL.
function typeClass(type) {
  return TYPE_LABEL[type] ? `stc-type-${type}` : "stc-type-unknown";
}

function formatTime(ts) {
  if (!ts) return "—";
  const date = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function detailText(v) {
  if ((v.type === "overspeeding" || v.type === "rash_driving") && v.speed != null && v.limit != null) {
    return { speed: v.speed, limit: v.limit };
  }
  return null;
}

function locationText(v) {
  if (v.location) return v.location;
  if (v.gps && typeof v.gps.lat === "number") return `${v.gps.lat.toFixed(4)}, ${v.gps.lng.toFixed(4)}`;
  return "—";
}

function fineIssued(v) {
  if (typeof v.fine_issued === "boolean") return v.fine_issued;
  return true;
}

export default function ViolationsDashboard() {
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newIds, setNewIds] = useState(() => new Set());
  const [activeFilter, setActiveFilter] = useState("all");
  const prevIdsRef = useRef(new Set());

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

    return () => unsubscribe();
  }, []);

  const finesIssuedCount = violations.filter(fineIssued).length;
  const visible = activeFilter === "all" ? violations : violations.filter((v) => v.type === activeFilter);

  return (
    <div className="stc-root min-h-screen flex flex-col font-sans">
      <div className="max-w-6xl mx-auto w-full px-6 pt-6">
        <header className="flex items-start justify-between flex-wrap gap-4 pb-6">
          <div>
            <p className="stc-mono stc-muted text-[13px] tracking-[0.18em] mb-1.5" font-bold>
              CLOUD BACKEND &middot; FIRESTORE REALTIME &middot; TEAM KINETIC APEX
            </p>
            <h1 className="stc-display stc-heading text-2xl font-bold">Live Violation Feed</h1>
          </div>
          <span className="stc-mono stc-heading stc-border inline-flex items-center gap-2 text-[11px] font-medium tracking-wide border bg-white px-3 py-1.5 rounded-full">
            <span className="stc-live-dot" aria-hidden="true" />
            {loading ? "CONNECTING" : "LIVE"}
          </span>
        </header>
      </div>

      <hr className="stc-divider w-full" />

      <div className="flex-1 w-full">
        <div className="max-w-6xl mx-auto w-full px-6 py-6">
          {error && (
            <div className="stc-error-banner text-sm rounded-xl p-4 mb-5">
              Couldn't read from Firestore: {error}. Check your firebase.js config and Firestore security rules
              (the <code className="stc-mono">violations</code> collection needs <code className="stc-mono">allow read: if true;</code>).
            </div>
          )}

          {/* Stat strip */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <StatCard label="Violations" value={violations.length} />
            <StatCard label="Fines Issued" value={finesIssuedCount} className="stc-heading" />
            <StatCard label="Connection" value={loading ? "Connecting" : "Connected"} isText />
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-2 mb-4 flex-wrap" role="tablist" aria-label="Filter by violation type">
            {FILTERS.map((key) => {
              const active = activeFilter === key;
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveFilter(key)}
                  className={`stc-chip stc-mono flex items-center gap-2 text-[11px] font-medium tracking-wide px-3 py-1.5 rounded-full ${
                    active ? "stc-chip-active" : "stc-chip-inactive"
                  }`}
                >
                  <span className={`${key === "all" ? "stc-type-unknown" : `stc-type-${key}`} stc-type-dot`} aria-hidden="true" />
                  {(key === "all" ? "All" : TYPE_LABEL[key]).toUpperCase()}
                </button>
              );
            })}
          </div>

          {/* Table */}
          <div className="stc-panel overflow-hidden">
            {!loading && visible.length === 0 && !error ? (
              <div className="stc-muted text-center text-sm py-14">
                {violations.length === 0
                  ? "No violations logged yet — waiting for the first event from Flask."
                  : "No violations match this filter."}
              </div>
            ) : (
              <table className="stc-table w-full text-sm">
                <thead>
                  <tr className="stc-muted stc-border text-left text-[10px] font-semibold tracking-[0.1em] border-b">
                    <th className="px-5 py-3">Vehicle</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Detail</th>
                    <th className="px-5 py-3">Location</th>
                    <th className="px-5 py-3">Fine</th>
                    <th className="px-5 py-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((v) => {
                    const cls = typeClass(v.type);
                    const label = TYPE_LABEL[v.type] || v.type || "Unknown";
                    const issued = fineIssued(v);
                    const speedDetail = detailText(v);

                    return (
                      <tr key={v.id} tabIndex={0} className={`stc-row ${newIds.has(v.id) ? "stc-row-new" : ""}`}>
                        <td className="stc-mono px-5 py-3.5 font-semibold text-[13px]">
                          {v.owner_id || v.tag_id || "UNKNOWN"}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`${cls} stc-type-chip`}>{label.toUpperCase()}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          {speedDetail ? (
                            <span>
                              <span className={`${cls} stc-type-text`}>{speedDetail.speed} km/h</span>{" "}
                              <span className="stc-muted text-xs">in a {speedDetail.limit} km/h zone</span>
                            </span>
                          ) : v.type === "red_light" ? (
                            <span>
                              Crossed junction on red
                              {v.signal_id ? <span className="stc-mono stc-muted text-xs"> &middot; {v.signal_id}</span> : null}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="stc-mono stc-muted px-5 py-3.5 text-xs">{locationText(v)}</td>
                        <td className="px-5 py-3.5">
                          <span className={`stc-fine-pill ${issued ? "stc-fine-issued" : "stc-fine-not-issued"}`}>
                            {issued ? "ISSUED" : "NOT ISSUED"}
                          </span>
                        </td>
                        <td className="stc-mono stc-muted px-5 py-3.5 text-xs">{formatTime(v.timestamp)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, isText, className = "" }) {
  return (
    <div className="stc-panel px-4 py-3.5">
      <div className={`stc-mono font-semibold ${isText ? "text-base" : "text-2xl"} ${className}`}>{value}</div>
      <div className="stc-muted text-[10px] font-medium mt-1 tracking-[0.14em]">{label.toUpperCase()}</div>
    </div>
  );
}