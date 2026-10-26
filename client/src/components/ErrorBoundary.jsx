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
        <div className="min-h-screen bg-[#0a0e1a] flex flex-col items-center justify-center text-center p-6">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
          <p className="text-gray-400 text-sm mb-2 max-w-sm">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <p className="text-gray-600 text-xs mb-8 max-w-md font-mono bg-gray-900 p-3 rounded-lg">
            {this.state.error?.stack?.split('\n')[0]}
          </p>
          <button
            className="btn-primary px-6"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.href = '/';
            }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
