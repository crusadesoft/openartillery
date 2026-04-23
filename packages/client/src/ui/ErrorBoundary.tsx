import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] caught", error, info);
  }

  reset = () => this.setState({ error: null });

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="screen">
          <div className="center-card">
            <h1>Something broke</h1>
            <p className="tagline">
              The client hit an unrecoverable error. Try refreshing, or go home.
            </p>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                background: "rgba(0,0,0,0.3)",
                padding: 10,
                borderRadius: 6,
                fontSize: 11,
                maxHeight: 200,
                overflow: "auto",
              }}
            >
              {this.state.error.message}
            </pre>
            <div className="row">
              <button className="primary-btn" onClick={this.reset}>
                Retry
              </button>
              <button
                className="secondary-btn"
                onClick={() => window.location.assign("#/")}
              >
                Home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
