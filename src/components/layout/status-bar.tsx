"use client";

export function StatusBar() {
  return (
    <div className="statusbar">
      <div className="statusbar-left">
        <div className="statusbar-status">
          <svg className="status-dot" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" /></svg>
          <span>Ready</span>
        </div>
      </div>
      <div className="statusbar-right">
        <span className="statusbar-version">v0.2.0-alpha</span>
      </div>
    </div>
  );
}
