import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    console.error('[Alchem.io] Caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: '#0a0a1a',
            color: '#e2e8f0',
            fontFamily: "'Inter', system-ui, monospace",
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 40,
            zIndex: 9999,
          }}
        >
          <div style={{ maxWidth: 680, width: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  fontWeight: 'bold',
                  color: 'white',
                  flexShrink: 0,
                }}
              >
                !
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f87171' }}>
                  Runtime Error
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
                  Alchem.io encountered an unrecoverable error
                </p>
              </div>
            </div>

            {/* Error message */}
            <div
              style={{
                backgroundColor: '#1e1b2e',
                border: '1px solid #ef444440',
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#f87171', fontFamily: 'monospace' }}>
                {this.state.error?.message || 'Unknown error'}
              </p>
            </div>

            {/* Stack trace */}
            {this.state.errorInfo?.componentStack && (
              <div
                style={{
                  backgroundColor: '#111127',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  padding: 16,
                  maxHeight: 300,
                  overflow: 'auto',
                  marginBottom: 20,
                }}
              >
                <p style={{ margin: '0 0 8px', fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
                  Component Stack
                </p>
                <pre
                  style={{
                    margin: 0,
                    fontSize: 11,
                    lineHeight: 1.6,
                    color: '#94a3b8',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'monospace',
                  }}
                >
                  {this.state.errorInfo.componentStack}
                </pre>
              </div>
            )}

            {/* Reload button */}
            <button
              onClick={() => window.location.reload()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 24px',
                borderRadius: 8,
                border: '1px solid #a855f7',
                backgroundColor: '#a855f720',
                color: '#c084fc',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontFamily: "'Inter', system-ui, sans-serif",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#a855f740'
                e.currentTarget.style.boxShadow = '0 0 16px #a855f740'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#a855f720'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              Reload Application
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
