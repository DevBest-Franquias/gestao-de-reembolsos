/** Ícones de traço (estilo Lucide), desenhados inline para não depender de biblioteca */
const CAMINHOS: Record<string, string[]> = {
  recibo: ['M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .7V2l-3 2-3-2-3 2-3-2-3 2Z', 'M8 8h8', 'M8 12h8', 'M8 16h5'],
  pessoas: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  peca: ['M19.4 14.6a2.5 2.5 0 0 0 0-5H18V6a2 2 0 0 0-2-2h-3.5v1.5a2.5 2.5 0 0 1-5 0V4H4a2 2 0 0 0-2 2v3.5h1.5a2.5 2.5 0 0 1 0 5H2V18a2 2 0 0 0 2 2h3.5v-1.5a2.5 2.5 0 0 1 5 0V20H16a2 2 0 0 0 2-2v-3.4Z'],
  escudo: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z', 'm9 12 2 2 4-4'],
  mais: ['M12 5v14', 'M5 12h14'],
  filtro: ['M3 5h18', 'M6 12h12', 'M10 19h4'],
  seta: ['m6 9 6 6 6-6'],
  baixar: ['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14'],
  editar: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'],
  lixeira: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6', 'M14 11v6'],
  sair: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
  celular: ['M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z', 'M12 18h.01'],
  externo: ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'],
  clipe: ['m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5'],
  chave: ['M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8Zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4'],
  cartao: ['M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z', 'M2 10h20'],
  banco: ['M3 21h18', 'M3 10h18', 'M5 6l7-3 7 3', 'M4 10v11', 'M20 10v11', 'M8 14v3', 'M12 14v3', 'M16 14v3'],
  fechar: ['M18 6 6 18', 'm6 6 12 12'],
  computador: ['M3 4h18v12H3Z', 'M8 20h8', 'M12 16v4'],
  compartilhar: ['M12 3v12', 'm7 8 5-5 5 5', 'M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6'],
};

export type NomeIcone = keyof typeof CAMINHOS;

export function Icone({ nome, tamanho = 20, className }: { nome: NomeIcone; tamanho?: number; className?: string }) {
  return (
    <svg className={className} width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {CAMINHOS[nome].map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
