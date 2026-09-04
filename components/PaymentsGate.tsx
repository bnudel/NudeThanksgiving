"use client";

import { useEffect, useRef, useState } from "react";

import type { Payment } from "@/lib/model";

const KEY = "nudelman-payments";

export default function PaymentsGate() {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function unlock(password: string, silent = false) {
    setBusy(true);
    if (!silent) setError("");
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (!silent) setError(data.error ?? "Something went wrong.");
        try {
          sessionStorage.removeItem(KEY);
        } catch {
          /* private browsing */
        }
        return;
      }
      setPayments(data.payments as Payment[]);
      try {
        sessionStorage.setItem(KEY, password);
      } catch {
        /* private browsing */
      }
    } catch {
      if (!silent) setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // Stay unlocked while this browser tab is open.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(KEY);
    } catch {
      /* private browsing */
    }
    if (saved) void unlock(saved, true);
  }, []);

  if (payments) {
    const total = payments.reduce((sum, p) => {
      const n = Number(p.amount.replace(/[^0-9.-]/g, ""));
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);

    return (
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>What</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p, i) => (
              <tr key={i}>
                <td>{p.date}</td>
                <td>{p.what}</td>
                <td className="amount">{p.amount}</td>
              </tr>
            ))}
            {total > 0 && (
              <tr>
                <td />
                <td className="faint">Total</td>
                <td className="amount">
                  {total.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="card lock">
      <div className="lock-icon" aria-hidden>
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      </div>
      <div className="lock-body">
        <h3>Payments are private</h3>
        <p className="faint" style={{ margin: "4px 0 14px" }}>
          Ask Ben for the family password.
        </p>
        <form
          className="lock-form"
          onSubmit={(e) => {
            e.preventDefault();
            void unlock(inputRef.current?.value ?? "");
          }}
        >
          <input
            ref={inputRef}
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            aria-label="Payments password"
            disabled={busy}
          />
          <button type="submit" disabled={busy}>
            {busy ? "Checking…" : "Unlock"}
          </button>
        </form>
        {error && (
          <p className="lock-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
