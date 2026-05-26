import { Component } from 'react'

/**
 * ErrorBoundary — catches any React render error and shows a recovery screen
 * instead of a blank page. Placed at the top of the component tree in App.jsx.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    console.error('[ErrorBoundary]', error, info?.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const { error, info } = this.state
    const componentName = info?.componentStack
      ?.trim().split('\n')[0]?.trim().replace('at ', '') || 'Unknown component'

    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#f8fafc',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Arial, sans-serif', padding: '24px', zIndex: 9999,
      }}>
        <div style={{
          background: 'white', borderRadius: '12px', padding: '36px 40px',
          maxWidth: '520px', width: '100%',
          boxShadow: '0 4px 24px rgba(0,0,0,.1)',
          border: '1px solid #fee2e2',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', color: '#dc2626', fontSize: '18px' }}>
            Something went wrong
          </h2>
          <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: '14px' }}>
            A page error occurred in <strong>{componentName}</strong>.
            The rest of the app is still working — click below to go back.
          </p>

          {error?.message && (
            <details style={{ marginBottom: '20px' }}>
              <summary style={{ cursor: 'pointer', color: '#9ca3af', fontSize: '12px' }}>
                Show technical details
              </summary>
              <pre style={{
                marginTop: '8px', padding: '10px', background: '#f9fafb',
                borderRadius: '6px', fontSize: '11px', color: '#374151',
                overflow: 'auto', maxHeight: '120px', whiteSpace: 'pre-wrap',
              }}>
                {error.message}
                {info?.componentStack?.split('\n').slice(0, 5).join('\n')}
              </pre>
            </details>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null, info: null })}
              style={{
                flex: 1, padding: '10px', background: '#2563eb', color: 'white',
                border: 'none', borderRadius: '8px', cursor: 'pointer',
                fontSize: '14px', fontWeight: '600',
              }}
            >
              ↩ Try Again
            </button>
            <button
              onClick={() => { window.location.hash = '/'; this.setState({ hasError: false, error: null, info: null }) }}
              style={{
                flex: 1, padding: '10px', background: '#f3f4f6', color: '#374151',
                border: 'none', borderRadius: '8px', cursor: 'pointer',
                fontSize: '14px', fontWeight: '600',
              }}
            >
              🏠 Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }
}
