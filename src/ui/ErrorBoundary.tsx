import { Component, type ReactNode } from 'react';

/** Em vez de tela em branco, mostra o erro (e permite recarregar). */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 24, font: '16px/1.5 system-ui', color: '#222' }}>
        <h2>Algo deu errado</h2>
        <p>Recarregue a página. Se repetir, envie esta mensagem ao suporte:</p>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{String(this.state.error.message).slice(0, 400)}</pre>
        <button onClick={() => location.reload()} style={{ padding: '10px 18px', fontSize: 16 }}>Recarregar</button>
      </div>
    );
  }
}
