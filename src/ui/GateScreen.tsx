import { SignIn, SignUp } from '@clerk/clerk-react';

// Tela de entrada para usuários não autenticados: fundo desfocado do app + modal de acesso.
// /sign-in e /sign-up mostram o formulário do Clerk (antes esses links só recarregavam esta mesma tela).
export function GateScreen() {
  const path = location.pathname;
  const isIn = path.startsWith('/sign-in');
  const isUp = path.startsWith('/sign-up');
  if (isIn || isUp) {
    const features = [
      'Busca inteligente de leads com filtros avançados',
      'Diagnóstico automático do site do lead',
      'Abordagem personalizada gerada na hora',
      'Funil Kanban para gerenciar oportunidades',
      'Link de prévia para mostrar ao cliente antes de fechar',
    ];
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: `
          .gs-split{position:fixed;inset:0;display:flex;overflow:auto;background:#09090f;z-index:100}
          .gs-brand{flex:0 0 420px;display:flex;flex-direction:column;justify-content:center;padding:52px;border-right:1px solid #22222e;position:relative;overflow:hidden}
          .gs-brand::before{content:'';position:absolute;top:-140px;left:-80px;width:420px;height:420px;background:radial-gradient(circle,rgba(224,92,43,.1) 0%,transparent 70%);pointer-events:none}
          .gs-form{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 24px;min-height:100%}
          .gs-feat{display:flex;align-items:flex-start;gap:10px;margin-bottom:13px;font-size:.86rem;color:#9898b0;line-height:1.45}
          .gs-feat-dot{width:20px;height:20px;border-radius:50%;background:rgba(224,92,43,.12);border:1px solid rgba(224,92,43,.28);display:grid;place-items:center;flex-shrink:0;margin-top:1px}
          .gs-mobile-logo{display:none;align-items:center;gap:8px;margin-bottom:16px}
          @media(max-width:800px){.gs-brand{display:none}.gs-mobile-logo{display:flex}}
        `}} />
        <div className="gs-split">
          {/* Coluna esquerda: identidade visual */}
          <div className="gs-brand">
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:40 }}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#ff4d1a"/><path d="M20.5 12C18.5 9.5 11.5 10 11.5 13.5C11.5 16.5 20.5 15.5 20.5 19C20.5 22.5 13.5 23 11.5 20.5" stroke="#121417" strokeWidth="2.8" strokeLinecap="round"/></svg>
              <span style={{ fontWeight:800, fontSize:'1.2rem', letterSpacing:'-.03em', color:'#f0f0f5' }}>SiteSales</span>
            </div>
            <h2 style={{ fontSize:'1.85rem', fontWeight:800, letterSpacing:'-.04em', lineHeight:1.15, color:'#f0f0f5', marginBottom:12 }}>
              Encontre o cliente certo.<br/><span style={{ color:'#e05c2b' }}>Venda o que ele precisa.</span>
            </h2>
            <p style={{ color:'#58586a', fontSize:'.88rem', lineHeight:1.65, marginBottom:36 }}>
              Prospecção inteligente para web designers e agências digitais.
            </p>
            {features.map((f) => (
              <div key={f} className="gs-feat">
                <div className="gs-feat-dot">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="#e05c2b"><path fillRule="evenodd" d="M9 2.3a.75.75 0 010 1.06l-5 5a.75.75 0 01-1.06 0l-2-2a.75.75 0 011.06-1.06L3.5 7.69 7.94 2.3A.75.75 0 019 2.3z"/></svg>
                </div>
                {f}
              </div>
            ))}
            <div style={{ marginTop:40, paddingTop:28, borderTop:'1px solid #22222e', display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:8, background:'rgba(224,92,43,.15)', border:'1px solid rgba(224,92,43,.3)', display:'grid', placeItems:'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e05c2b" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              </div>
              <div>
                <div style={{ fontSize:'.78rem', color:'#f0f0f5', fontWeight:600 }}>Acesso seguro</div>
                <div style={{ fontSize:'.72rem', color:'#58586a' }}>Autenticação protegida e criptografada</div>
              </div>
            </div>
          </div>
          {/* Coluna direita: formulário Clerk */}
          <div className="gs-form">
            <div className="gs-mobile-logo">
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#ff4d1a"/><path d="M20.5 12C18.5 9.5 11.5 10 11.5 13.5C11.5 16.5 20.5 15.5 20.5 19C20.5 22.5 13.5 23 11.5 20.5" stroke="#121417" strokeWidth="2.8" strokeLinecap="round"/></svg>
              <span style={{ fontWeight:800, fontSize:'1rem', letterSpacing:'-.03em', color:'#f0f0f5' }}>SiteSales</span>
            </div>
            {isIn
              ? <SignIn routing="hash" signUpUrl="/sign-up" forceRedirectUrl="/" fallbackRedirectUrl="/" />
              : <SignUp routing="hash" signInUrl="/sign-in" forceRedirectUrl="/" fallbackRedirectUrl="/" />}
            <a href="/" style={{ color:'#58586a', fontSize:'.8rem', textDecoration:'none', marginTop:12 }}>← Voltar</a>
          </div>
        </div>
      </>
    );
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#09090f', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, overflow: 'hidden' }}>

      {/* ── Fundo simulado (UI desfocada) ───────────────────────────────── */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {/* sidebar */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 210, background: '#111118', borderRight: '1px solid #22222e', filter: 'blur(1px)', opacity: .35 }}>
          <div style={{ margin: '20px 16px 32px', height: 28, background: '#e05c2b', borderRadius: 6, opacity: .6 }} />
          {[0,1,2,3,4].map(i => (
            <div key={i} style={{ margin: '0 12px 10px', height: 36, background: '#17171f', borderRadius: 8, opacity: i === 1 ? .9 : .4 }} />
          ))}
        </div>
        {/* topbar */}
        <div style={{ position: 'absolute', left: 210, top: 0, right: 0, height: 54, background: '#111118', borderBottom: '1px solid #22222e', filter: 'blur(1px)', opacity: .3 }} />
        {/* cards */}
        <div style={{ position: 'absolute', left: 230, top: 74, right: 20, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {[0,1,2,3,4,5].map(i => (
            <div key={i} style={{ height: 90, background: '#111118', borderRadius: 10, border: '1px solid #22222e', filter: 'blur(2px)', opacity: .25 + (i%3)*.07 }} />
          ))}
        </div>
        {/* rows */}
        <div style={{ position: 'absolute', left: 230, top: 290, right: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ height: 48, background: '#111118', borderRadius: 8, border: '1px solid #22222e', filter: 'blur(2px)', opacity: .2 }} />
          ))}
        </div>
        {/* scrim */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 70% at 50% 50%, rgba(9,9,15,.55) 0%, rgba(9,9,15,.96) 100%)' }} />
      </div>

      {/* ── Card de acesso ─────────────────────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 1, background: '#111118', border: '1px solid #22222e', borderRadius: 16, padding: '40px 36px', width: 'min(400px, calc(100vw - 32px))', textAlign: 'center', boxShadow: '0 32px 100px rgba(0,0,0,.9)' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
          <svg width="30" height="30" viewBox="0 0 32 32" fill="none" ><rect width="32" height="32" rx="8" fill="#ff4d1a"/><path d="M20.5 12C18.5 9.5 11.5 10 11.5 13.5C11.5 16.5 20.5 15.5 20.5 19C20.5 22.5 13.5 23 11.5 20.5" stroke="#121417" strokeWidth="2.8" strokeLinecap="round"/></svg>
          <span style={{ fontWeight: 800, fontSize: '1.3rem', letterSpacing: '-.03em', color: '#f0f0f5' }}>SiteSales</span>
        </div>

        <p style={{ color: '#58586a', fontSize: '.82rem', marginBottom: 32 }}>
          Encontre o cliente certo. Venda o que ele precisa.
        </p>

        {/* Entrar */}
        <a href="/sign-in" style={{ display: 'block', padding: '14px', background: '#e05c2b', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: '1rem', letterSpacing: '-.01em', marginBottom: 10 }}>
          Entrar
        </a>

        {/* Separador */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 10px' }}>
          <div style={{ flex: 1, height: 1, background: '#22222e' }} />
          <span style={{ color: '#58586a', fontSize: '.75rem' }}>ou</span>
          <div style={{ flex: 1, height: 1, background: '#22222e' }} />
        </div>

        {/* Assinar */}
        <a href="/planos.html" style={{ display: 'block', padding: '13px', background: 'transparent', color: '#f0f0f5', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: '.95rem', border: '1px solid #22222e' }}>
          Assinar &mdash; R$&nbsp;59,90/mês
        </a>

        <p style={{ marginTop: 20, color: '#58586a', fontSize: '.72rem' }}>
          Sem taxa de adesão · Cancele quando quiser
        </p>
      </div>
    </div>
  );
}
