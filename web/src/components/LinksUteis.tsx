import type { LinkUtil } from '../api';

/** Lista de links externos. Abrem em outra aba. */
export function LinksUteis({ links, compacto }: { links: LinkUtil[]; compacto?: boolean }) {
  if (!links.length) return <p className="mudo">Nenhum link cadastrado.</p>;
  return (
    <ul className={`links-uteis ${compacto ? 'links-compactos' : ''}`}>
      {links.map((l, i) => (
        <li key={l.id ?? i}>
          <a href={l.url} target="_blank" rel="noopener noreferrer">
            <span className="link-titulo">{l.titulo}</span>
            {!compacto && <span className="link-url">{l.url.replace(/^https?:\/\//, '')}</span>}
            <svg className="link-seta" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 17 17 7" />
              <path d="M7 7h10v10" />
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}
