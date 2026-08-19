import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    const errorMsg = String(error?.message || error || '');
    const isChunkError = /failed to fetch dynamically imported module|importing a module script failed|expected a javascript-or-wasm module script/i.test(errorMsg);

    if (isChunkError) {
      const reloaded = sessionStorage.getItem('chunk_reload');
      if (!reloaded) {
        sessionStorage.setItem('chunk_reload', 'true');
        window.location.reload(true);
        return;
      }
    }
  }

  handleRetry = () => {
    sessionStorage.removeItem('chunk_reload');
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          padding: '24px',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '1.1rem' }}>Something went wrong.</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Please try again — if this keeps happening, let an organizer know.
          </p>
          <button className="btn btn-primary" onClick={this.handleRetry}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
