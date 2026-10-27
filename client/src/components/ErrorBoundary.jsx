/**
 * ErrorBoundary — catches unhandled render errors and shows a fallback UI.
 */
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-center p-6 select-none">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-3xl mb-5 shadow-sm">
            ⚠️
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2 tracking-tight">
            Terminal Execution Fault
          </h1>
          <p className="text-slate-500 text-xs mb-4 max-w-sm leading-relaxed font-medium">
            {this.state.error?.message ?? 'An unexpected render error occurred in this view.'}
          </p>
          <div className="text-slate-600 text-xs mb-6 max-w-lg font-mono bg-white border border-slate-200 p-3.5 rounded-xl text-left overflow-x-auto shadow-2xs">
            <span className="text-rose-600 font-semibold">Error: </span>
            {this.state.error?.stack?.split('\n')[0] ?? 'Unknown error'}
          </div>
          <button
            className="btn-primary px-6 py-2.5 text-xs font-bold"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.href = '/';
            }}
          >
            Reload Terminal
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
