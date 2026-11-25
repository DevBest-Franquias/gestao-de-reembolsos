import type { Janela } from './api';

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const SEMANA_CURTA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
export const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Feriados nacionais de data fixa (MM-DD) */
export const FERIADOS: Record<string, string> = {
  '01-01': 'Confraternização Universal',
  '04-21': 'Tiradentes',
  '05-01': 'Dia do Trabalho',
  '09-07': 'Independência',
  '10-12': 'Nossa Senhora Aparecida',
  '11-02': 'Finados',
  '11-15': 'Proclamação da República',
  '11-20': 'Consciência Negra',
  '12-25': 'Natal',
};

export const chaveMes = (ano: number, mes0: number) => `${ano}-${String(mes0 + 1).padStart(2, '0')}`;
export const hoje = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };

/** Próximas datas de janela a partir de hoje (inclusive) */
export function proximasJanelas(janelas: Janela[], quantidade = 3): Date[] {
  const h = hoje().getTime();
  const datas: Date[] = [];
  for (const j of janelas) {
    const [a, m] = j.mes.split('-').map(Number);
    for (const d of j.dias) datas.push(new Date(a, m - 1, d));
  }
  return datas.filter((d) => d.getTime() >= h).sort((x, y) => x.getTime() - y.getTime()).slice(0, quantidade);
}

export function descreverDistancia(d: Date) {
  const dias = Math.round((d.getTime() - hoje().getTime()) / 864e5);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  return `em ${dias} dias`;
}

export const formatarDia = (d: Date) => `${SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
