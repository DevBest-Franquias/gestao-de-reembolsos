import { useEffect, useState } from 'react';
import { avisar } from '../components/ui';
import { Icone } from '../components/Icone';

const ZIP = '/extensao-reembolsos-bitrix.zip';
const BITRIX = 'https://hubsmart.bitrix24.site/solicitacao_pag_investidas/';

function Copiar({ texto }: { texto: string }) {
  return (
    <button
      type="button"
      className="copiar"
      onClick={() => navigator.clipboard.writeText(texto).then(() => avisar('Copiado. Cole na barra de endereço do Chrome.'), () => avisar('Não foi possível copiar.', 'erro'))}
    >
      <code>{texto}</code> <span>Copiar</span>
    </button>
  );
}

export default function Extensao() {
  const [versao, setVersao] = useState('');
  useEffect(() => {
    fetch('/extensao-versao.json', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { versao?: string }) => setVersao(d.versao ?? ''))
      .catch(() => {});
  }, []);

  return (
    <section className="tutorial">
      <div className="pagina-topo">
        <div className="pagina-titulo">
          <h1>Extensão do Bitrix</h1>
          <p className="mudo">
            Preenche o formulário de Solicitação de Pagamento do Bitrix com os dados de uma solicitação deste sistema, anexa o PDF com os comprovantes e,
            depois do envio, marca a solicitação como Solicitado.
          </p>
        </div>
        <a className="btn btn-primario so-computador" href={ZIP} download>
          <Icone nome="baixar" tamanho={18} /> Baixar extensão{versao ? ` (versão ${versao})` : ''}
        </a>
      </div>

      <div className="aviso-celular so-celular">
        <Icone nome="computador" tamanho={22} />
        <p>
          A extensão funciona no <strong>Google Chrome do computador</strong>. Abra esta página no computador para baixar e instalar.
          Pelo celular, você pode ler o passo a passo abaixo.
        </p>
      </div>

      <div className="tutorial-grade">
        <div className="cartao-branco">
          <h2>Como funciona</h2>
          <ol className="passos-resumo">
            <li><strong>Preencher:</strong> na extensão, você escolhe a solicitação e ela preenche o formulário do Bitrix.</li>
            <li><strong>Conferir:</strong> você confere os dados direto na aba do Bitrix.</li>
            <li><strong>Enviar:</strong> de volta na extensão, clica em Enviar. A solicitação vira Solicitado aqui no sistema.</li>
          </ol>
          <p className="mudo pequeno">
            A descrição vai para o Bitrix como: "Olá, equipe! Esse valor é referente a <em>[descrição da solicitação]</em>."
            Fornecedor, dados bancários, empresa pagadora e centro de custo vêm do cadastro e das regras do sistema.
          </p>
        </div>
        <div className="cartao-branco">
          <h2>Antes de começar</h2>
          <ul className="passos-resumo">
            <li>Use o <strong>Google Chrome</strong> no computador.</li>
            <li>Tenha o seu <strong>cadastro de solicitante completo</strong> (CPF, dados bancários e cartões), com o mesmo e-mail do seu login.</li>
            <li>Registre a solicitação aqui no sistema, com os anexos, antes de usar a extensão.</li>
          </ul>
        </div>
      </div>

      <div className="cartao-branco tutorial-secao">
        <h2><span className="numero">1</span> Instalar (uma vez por computador)</h2>
        <ol className="passos">
          <li>
            Clique em <a href={ZIP} download><strong>Baixar extensão</strong></a> e descompacte o arquivo .zip numa pasta que não vá ser apagada,
            por exemplo <code>Documentos/extensao-reembolsos</code>.
          </li>
          <li>
            No Chrome, abra a página de extensões. Copie o endereço abaixo e cole na barra de endereço:
            <Copiar texto="chrome://extensions" />
          </li>
          <li>Ligue o <strong>Modo do desenvolvedor</strong>, no canto superior direito da página.</li>
          <li>Clique em <strong>Carregar sem compactação</strong> e escolha a pasta que você descompactou.</li>
          <li>
            Clique no ícone de quebra-cabeça da barra do Chrome e no <strong>alfinete</strong> ao lado de "Reembolsos → Bitrix", para deixar a extensão sempre à mão.
          </li>
          <li>Clique no ícone da extensão e entre com o <strong>mesmo e-mail e senha deste sistema</strong>.</li>
        </ol>
      </div>

      <div className="cartao-branco tutorial-secao">
        <h2><span className="numero">2</span> Usar</h2>
        <div className="tutorial-uso">
          <ol className="passos">
            <li>
              Clique no ícone da extensão. Aparecem as suas solicitações <strong>Não solicitadas</strong>. Para ver as de outras pessoas, desmarque "Só as minhas".
            </li>
            <li>
              Clique em <strong>Preencher</strong> na solicitação. A extensão abre o <a href={BITRIX} target="_blank" rel="noopener noreferrer">formulário do Bitrix</a> (se ainda
              não estiver aberto), preenche todos os campos e anexa o PDF com os comprovantes.
            </li>
            <li>Confira os dados na aba do Bitrix. Se precisar, ajuste algo direto no formulário.</li>
            <li>
              Clique de novo no ícone da extensão. A solicitação aparece como <strong>aguardando sua conferência</strong>. Clique em <strong>Enviar ao Bitrix</strong>,
              ou em <strong>Cancelar</strong> se desistir.
            </li>
            <li>Pronto: o formulário é enviado e a solicitação passa a ser <strong>Solicitado</strong> aqui no sistema.</li>
          </ol>
          <figure>
            <img src="/tutorial/extensao-conferencia.png" alt="Extensão mostrando uma solicitação preenchida aguardando conferência, com os botões Cancelar e Enviar ao Bitrix" />
            <figcaption>Depois de preencher: confira e clique em Enviar ao Bitrix.</figcaption>
          </figure>
          <figure>
            <img src="/tutorial/bitrix-preenchido.png" alt="Formulário de Solicitação de Pagamento do Bitrix preenchido pela extensão, com o PDF anexado" />
            <figcaption>O formulário do Bitrix preenchido pela extensão, com o PDF anexado.</figcaption>
          </figure>
        </div>
      </div>

      <div className="cartao-branco tutorial-secao">
        <h2><span className="numero">3</span> Atualizar</h2>
        <p>
          Quando sair uma versão nova, a própria extensão mostra um aviso amarelo no topo. Para atualizar:
        </p>
        <ol className="passos">
          <li>Baixe a extensão de novo nesta página e descompacte <strong>por cima da mesma pasta</strong> de antes, substituindo os arquivos.</li>
          <li>Em <code>chrome://extensions</code>, clique no ícone de <strong>atualizar</strong> (seta circular) no quadro da extensão "Reembolsos → Bitrix".</li>
        </ol>
        {versao && <p className="mudo pequeno">Versão mais recente: {versao}. A versão instalada aparece no rodapé da extensão.</p>}
      </div>

      <div className="cartao-branco tutorial-secao">
        <h2>Dúvidas comuns</h2>
        <dl className="duvidas">
          <dt>Minha solicitação não aparece na extensão.</dt>
          <dd>Confira o filtro de status e a opção "Só as minhas". Ela usa o e-mail do seu login para saber quais são as suas.</dd>
          <dt>A extensão disse que o formulário não carregou.</dt>
          <dd>Recarregue a aba do Bitrix (F5) e clique em Preencher de novo.</dd>
          <dt>O Bitrix apontou um campo obrigatório vazio.</dt>
          <dd>Preencha o campo direto no formulário do Bitrix e clique em Enviar ao Bitrix de novo na extensão.</dd>
          <dt>Enviei pelo botão Enviar do próprio Bitrix. Precisa fazer algo?</dt>
          <dd>Não. A extensão percebe o envio e marca a solicitação como Solicitado do mesmo jeito.</dd>
          <dt>A extensão pediu login de novo.</dt>
          <dd>O acesso dura 30 dias. Depois disso, ou se sua senha mudar, é só entrar de novo.</dd>
        </dl>
      </div>
    </section>
  );
}
