import type { PDFDocument as TPDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import { buscarArquivo, STATUS, type Reembolso } from './api';
import { formatarData, formatarMoeda, mascaraDocumento } from './formato';

/**
 * Gera, no navegador, um PDF único com os anexos de uma solicitação:
 * 1. nota fiscal ou documento de pagamento, 2. print de cobrança ou comprovante de Pix,
 * 3. comprovante do cartão vinculado. Cada página leva uma faixa dizendo o que ela é.
 */

const A4 = { largura: 595.28, altura: 841.89 };
const MARGEM = 36;
const FAIXA = 46; // altura da faixa de identificação no topo de cada página
const RODAPE = 24;
const ROXO = { r: 78 / 255, g: 0, b: 142 / 255 };

type Arquivo = { nome: string; caminho: string };
type Secao = { titulo: string; vazio: string; arquivos: Arquivo[]; paginas: [number, number] | null };

/** Helvetica só tem os caracteres do Windows-1252; troca o resto para não quebrar */
const seguro = (t: string) =>
  t
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x00-\xFF€•…]/g, '?')
    .replace(/[\r\n\t]+/g, ' ');

function quebrarLinhas(texto: string, fonte: PDFFont, tamanho: number, largura: number) {
  const linhas: string[] = [];
  let atual = '';
  for (const palavra of seguro(texto).split(' ')) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) atual = tentativa;
    else {
      if (atual) linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** Converte imagens que o pdf-lib não lê direto (webp, gif, bmp...) para PNG usando o navegador */
async function paraPng(blob: Blob): Promise<ArrayBuffer> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    const png = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
    if (!png) throw new Error('conversão');
    return await png.arrayBuffer();
  } finally {
    URL.revokeObjectURL(url);
  }
}

const tipoPorNome = (nome: string) => {
  const ext = nome.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  if (['jpg', 'jpeg'].includes(ext)) return 'image/jpeg';
  if (['png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return `image/${ext === 'svg' ? 'svg+xml' : ext}`;
  return '';
};

export async function gerarPdfCombinado(r: Reembolso) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc: TPDFDocument = await PDFDocument.create();
  doc.setTitle(seguro(`Reembolso ${r.id} - ${r.solicitante_nome}`));
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const roxo = rgb(ROXO.r, ROXO.g, ROXO.b);
  const cinza = rgb(0.42, 0.4, 0.47);
  const preto = rgb(0.06, 0.05, 0.07);

  const secoes: Secao[] = [
    {
      titulo: 'Nota fiscal ou documento de pagamento',
      vazio: 'Nenhum arquivo anexado',
      arquivos: r.anexos.filter((a) => (a.categoria ?? 'documento') === 'documento').map((a) => ({ nome: a.nome_arquivo, caminho: `/anexos/${a.id}` })),
      paginas: null,
    },
    {
      titulo: 'Print de cobrança do cartão ou comprovante de envio de Pix',
      vazio: 'Nenhum arquivo anexado',
      arquivos: r.anexos.filter((a) => a.categoria === 'cobranca').map((a) => ({ nome: a.nome_arquivo, caminho: `/anexos/${a.id}` })),
      paginas: null,
    },
    {
      titulo: r.cartao_final ? `Imagem do cartão vinculado (final ${r.cartao_final})` : 'Imagem do cartão vinculado',
      vazio: r.cartao_final ? 'O cartão não tem imagem anexada' : 'Nenhum cartão vinculado à solicitação',
      arquivos: r.cartao_comprovante ? [{ nome: r.cartao_comprovante.nome, caminho: `/reembolsos/${r.id}/comprovante-cartao` }] : [],
      paginas: null,
    },
  ];

  /** Nova página A4 com a faixa roxa de identificação no topo */
  const paginaComFaixa = (secao: number, titulo: string, detalhe: string) => {
    const p = doc.addPage([A4.largura, A4.altura]);
    p.drawRectangle({ x: 0, y: A4.altura - FAIXA, width: A4.largura, height: FAIXA, color: roxo });
    p.drawText(seguro(`${secao}. ${titulo}`), { x: MARGEM, y: A4.altura - 20, size: 12, font: negrito, color: rgb(1, 1, 1) });
    const det = quebrarLinhas(detalhe, fonte, 9, A4.largura - 2 * MARGEM)[0] ?? '';
    p.drawText(det, { x: MARGEM, y: A4.altura - 35, size: 9, font: fonte, color: rgb(0.9, 0.86, 1) });
    return p;
  };

  /** Área livre abaixo da faixa e acima do rodapé */
  const area = { x: MARGEM, y: RODAPE + 12, largura: A4.largura - 2 * MARGEM, altura: A4.altura - FAIXA - RODAPE - 36 };
  const encaixar = (w: number, h: number) => {
    const escala = Math.min(area.largura / w, area.altura / h, 1.6);
    const lw = w * escala;
    const lh = h * escala;
    return { x: area.x + (area.largura - lw) / 2, y: area.y + (area.altura - lh), width: lw, height: lh };
  };

  const paginaAviso = (p: PDFPage, linhas: string[]) => {
    let y = A4.altura - FAIXA - 60;
    for (const l of linhas) {
      for (const parte of quebrarLinhas(l, fonte, 12, area.largura)) {
        p.drawText(parte, { x: MARGEM, y, size: 12, font: fonte, color: preto });
        y -= 18;
      }
      y -= 6;
    }
  };

  // Capa (preenchida no fim, quando já sabemos as páginas de cada parte)
  const capa = doc.addPage([A4.largura, A4.altura]);

  for (let i = 0; i < secoes.length; i++) {
    const secao = secoes[i];
    const num = i + 1;
    const inicio = doc.getPageCount() + 1;
    for (const arq of secao.arquivos) {
      try {
        const { blob, tipo: tipoResposta } = await buscarArquivo(arq.caminho);
        const tipo = tipoResposta && tipoResposta !== 'application/octet-stream' ? tipoResposta : tipoPorNome(arq.nome);
        if (tipo.includes('pdf')) {
          const origem = await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true });
          const embutidas = await doc.embedPages(origem.getPages());
          embutidas.forEach((pg, k) => {
            const p = paginaComFaixa(num, secao.titulo, `Arquivo: ${arq.nome}  ·  página ${k + 1} de ${embutidas.length}`);
            p.drawPage(pg, encaixar(pg.width, pg.height));
          });
        } else if (tipo.startsWith('image/')) {
          const img = tipo === 'image/jpeg' || tipo === 'image/jpg'
            ? await doc.embedJpg(await blob.arrayBuffer())
            : tipo === 'image/png'
              ? await doc.embedPng(await blob.arrayBuffer())
              : await doc.embedPng(await paraPng(blob));
          const p = paginaComFaixa(num, secao.titulo, `Arquivo: ${arq.nome}`);
          p.drawImage(img, encaixar(img.width, img.height));
        } else {
          const p = paginaComFaixa(num, secao.titulo, `Arquivo: ${arq.nome}`);
          paginaAviso(p, [
            `O arquivo "${arq.nome}" não é PDF nem imagem e não pode ser incluído neste documento.`,
            'Abra o arquivo pela tabela de reembolsos do sistema.',
          ]);
        }
      } catch {
        const p = paginaComFaixa(num, secao.titulo, `Arquivo: ${arq.nome}`);
        paginaAviso(p, [
          `Não foi possível incluir o arquivo "${arq.nome}" neste documento (arquivo protegido, corrompido ou em formato não suportado).`,
          'Abra o arquivo pela tabela de reembolsos do sistema.',
        ]);
      }
    }
    const fim = doc.getPageCount();
    secao.paginas = fim >= inicio ? [inicio, fim] : null;
  }

  // Capa: resumo da solicitação e índice do que tem em cada página
  capa.drawRectangle({ x: 0, y: A4.altura - 110, width: A4.largura, height: 110, color: roxo });
  capa.drawText('Solicitação de reembolso', { x: MARGEM, y: A4.altura - 58, size: 24, font: negrito, color: rgb(1, 1, 1) });
  capa.drawText(seguro(`Documentos comprobatórios  ·  Solicitação nº ${r.id}`), { x: MARGEM, y: A4.altura - 82, size: 11, font: fonte, color: rgb(0.9, 0.86, 1) });

  let y = A4.altura - 150;
  const linha = (rotulo: string, valor: string) => {
    capa.drawText(seguro(rotulo), { x: MARGEM, y, size: 9, font: negrito, color: cinza });
    const partes = quebrarLinhas(valor || '-', fonte, 11, A4.largura - 2 * MARGEM - 150);
    partes.forEach((t, k) => capa.drawText(t, { x: MARGEM + 150, y: y - k * 15, size: 11, font: fonte, color: preto }));
    y -= Math.max(1, partes.length) * 15 + 8;
  };
  linha('SOLICITANTE', r.solicitante_nome);
  linha('CPF', r.solicitante_cpf ? mascaraDocumento(r.solicitante_cpf) : '');
  linha('VALOR', formatarMoeda(r.valor_centavos));
  linha('DATA DE VENCIMENTO', formatarData(r.data_pagamento));
  linha('DESCRIÇÃO', r.descricao);
  linha('CARTÃO', r.cartao_final ? `Final ${r.cartao_final}` : 'Nenhum cartão vinculado');
  linha('STATUS', STATUS[r.status]);

  y -= 14;
  capa.drawText('Conteúdo deste PDF', { x: MARGEM, y, size: 15, font: negrito, color: roxo });
  y -= 26;
  secoes.forEach((s, i) => {
    capa.drawRectangle({ x: MARGEM, y: y - 8, width: 22, height: 22, color: roxo });
    capa.drawText(String(i + 1), { x: MARGEM + 8, y: y - 1, size: 12, font: negrito, color: rgb(1, 1, 1) });
    capa.drawText(seguro(s.titulo), { x: MARGEM + 34, y: y + 2, size: 12, font: negrito, color: preto });
    const onde = s.paginas
      ? `${s.arquivos.length} arquivo(s)  ·  ${s.paginas[0] === s.paginas[1] ? `página ${s.paginas[0]}` : `páginas ${s.paginas[0]} a ${s.paginas[1]}`}`
      : s.vazio;
    capa.drawText(seguro(onde), { x: MARGEM + 34, y: y - 13, size: 10, font: fonte, color: cinza });
    y -= 30;
    for (const a of s.arquivos) {
      for (const t of quebrarLinhas(`• ${a.nome}`, fonte, 9, A4.largura - 2 * MARGEM - 46)) {
        capa.drawText(t, { x: MARGEM + 46, y, size: 9, font: fonte, color: cinza });
        y -= 12;
      }
    }
    y -= 14;
  });

  // Rodapé em todas as páginas
  const total = doc.getPageCount();
  doc.getPages().forEach((p, i) => {
    p.drawText(seguro(`Reembolso nº ${r.id}  ·  ${r.solicitante_nome}  ·  ${formatarMoeda(r.valor_centavos)}`), { x: MARGEM, y: 14, size: 8, font: fonte, color: cinza });
    const txt = `Página ${i + 1} de ${total}`;
    p.drawText(txt, { x: A4.largura - MARGEM - fonte.widthOfTextAtSize(txt, 8), y: 14, size: 8, font: fonte, color: cinza });
  });

  const bytes = await doc.save();
  const nomeArquivo = `reembolso-${r.id}-${r.solicitante_nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase()}.pdf`;
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
