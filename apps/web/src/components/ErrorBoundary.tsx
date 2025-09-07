import { Component, ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: any }> {
  state = { error: null as any };
  static getDerivedStateFromError(error: any) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16 }}>
          <h1>Something went wrong.</h1>
          <pre style={{ whiteSpace: "pre-wrap" }}>{String(this.state.error?.stack ?? this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
