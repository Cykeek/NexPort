"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render-time errors in the component subtree and displays a fallback UI.
 * Use this to isolate crashes — one broken component shouldn't take down the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "32px",
              gap: "12px",
              minHeight: "200px",
              color: "#c4c6d0",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: "16px", fontWeight: 600 }}>
              Something went wrong
            </p>
            <pre
              style={{
                fontSize: "12px",
                color: "#888",
                maxWidth: "600px",
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {this.state.error?.message ?? "Unknown error"}
            </pre>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                marginTop: "8px",
                padding: "8px 16px",
                background: "#3b82f6",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              Try again
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
