import * as React from 'react';

type State = { hasError: boolean; error?: Error };

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console for now — could wire to remote logging
    // eslint-disable-next-line no-console
    console.error('Unhandled render error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <h1 style={{ color: '#b91c1c' }}>Application error</h1>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#111827', color: '#fff', padding: 12, borderRadius: 6 }}>
            {String(this.state.error)}
          </pre>
        </div>
      );
    }

    return this.props.children as React.ReactElement;
  }
}
