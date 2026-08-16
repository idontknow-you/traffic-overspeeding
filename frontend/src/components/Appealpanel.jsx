// src/components/AppealPanel.jsx
//
// Grievance/appeal flow per the SDLC (§4.6):
//   - Submitting an appeal goes through Flask (POST /appeal), not a direct
//     Firestore write from the client — Flask stays the only write path,
//     same split used for /violation.
//   - Reading appeal status goes straight to Firestore's `appeals`
//     collection via onSnapshot(), same pattern as ViolationsDashboard.
//
// Exports:
//   <AppealModal violation={...} onClose={...} onSubmitted={...} />
//   <AppealButton violation={...} className={...} onSubmitted={...} />  — drop-in trigger, owns its own modal state
//   <AppealsList />

import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

// Point this at wherever Flask is running. For local/demo mode (per SDLC §4.5)
// this is localhost; swap to the Render/Railway URL for hosted mode.
const FLASK_API_BASE = "http://localhost:5000";

const STATUS_META = {
  pending:   { label: "Pending",   pill: "bg-amber-50 text-amber-600" },
  reviewed:  { label: "Reviewed",  pill: "bg-emerald-50 text-emerald-600" },
  dismissed: { label: "Dismissed", pill: "bg-slate-100 text-slate-500" },
};

function formatTime(ts) {
  if (!ts) return "—";
  const date = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// AppealModal — file a new appeal against a specific violation
// ---------------------------------------------------------------------------

export function AppealModal({ violation, onClose, onSubmitted }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Please describe why you're appealing this violation.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${FLASK_API_BASE}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          violation_id: violation.id,
          tag_id: violation.tag_id || violation.owner_id || "",
          reason: reason.trim(),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server responded ${res.status}`);
      }

      onSubmitted?.();
    } catch (err) {
      console.error("Appeal submission failed:", err);
      setError(
        err.message === "Failed to fetch"
          ? "Couldn't reach the Flask backend. Is it running on " + FLASK_API_BASE + "?"
          : err.message
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">File an Appeal</h2>
            <p className="text-slate-500 text-sm mt-0.5">
              Violation ID: <span className="font-mono text-slate-600">{violation.id}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="bg-slate-50 rounded-xl p-3 mb-4 text-sm text-slate-600">
          <div>
            <span className="font-semibold text-slate-800">
              {violation.owner_id || violation.tag_id || "Unknown vehicle"}
            </span>
          </div>
          <div className="text-slate-500">{violation.type?.replace("_", " ") || "—"}</div>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block text-xs font-bold text-slate-500 mb-1.5 tracking-wide">
            REASON FOR APPEAL
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="e.g. GPS misread my location — I was on the service road, not the highway."
            className="w-full border border-slate-200 rounded-xl p-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
            disabled={submitting}
          />

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3 mt-3">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit Appeal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppealButton — drop-in trigger for a violations table row. Owns its own
// open/close state so callers don't need to wire up a useState just to
// launch AppealModal.
// ---------------------------------------------------------------------------

export function AppealButton({ violation, className, onSubmitted }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          "px-3 py-1.5 rounded-lg text-xs font-bold text-violet-600 bg-violet-50 hover:bg-violet-100"
        }
      >
        File Appeal
      </button>

      {open && (
        <AppealModal
          violation={violation}
          onClose={() => setOpen(false)}
          onSubmitted={() => {
            setOpen(false);
            onSubmitted?.();
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// AppealsList — live status of filed appeals, read straight from Firestore
// ---------------------------------------------------------------------------

export function AppealsList() {
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "appeals"), orderBy("submitted_at", "desc"), limit(25));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setAppeals(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("Appeals listener error:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  if (loading || (!error && appeals.length === 0)) {
    return (
      <div className="bg-white rounded-2xl shadow-sm mt-5 p-6 text-center text-slate-400 text-sm">
        {loading ? "Loading appeals…" : "No appeals filed yet."}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm mt-5 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-extrabold text-slate-800">Appeals</h2>
        <p className="text-slate-400 text-xs mt-0.5">Status updates live from Firestore</p>
      </div>

      {error && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 text-sm p-4">
          Couldn't read appeals: {error}
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 text-xs font-bold border-b border-slate-100">
            <th className="px-5 py-3">Vehicle</th>
            <th className="px-5 py-3">Violation ID</th>
            <th className="px-5 py-3">Reason</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Submitted</th>
          </tr>
        </thead>
        <tbody>
          {appeals.map((a) => {
            const meta = STATUS_META[a.status] || {
              label: a.status || "Unknown",
              pill: "bg-slate-100 text-slate-500",
            };
            return (
              <tr key={a.id} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-3 font-semibold text-slate-800">{a.tag_id || "—"}</td>
                <td className="px-5 py-3 font-mono text-xs text-slate-500">{a.violation_id}</td>
                <td className="px-5 py-3 text-slate-600 max-w-xs truncate" title={a.reason}>
                  {a.reason}
                </td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${meta.pill}`}>
                    {meta.label}
                  </span>
                </td>
                <td className="px-5 py-3 text-slate-400">{formatTime(a.submitted_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}