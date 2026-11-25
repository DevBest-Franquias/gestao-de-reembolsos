const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatarMoeda = (centavos: number) => moeda.format(centavos / 100);

export const formatarData = (iso: string | null) => {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

export const soDigitos = (s: string) => s.replace(/\D/g, '');

export function mascaraDocumento(valor: string) {
  const d = soDigitos(valor).slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function documentoValido(valor: string) {
  const d = soDigitos(valor);
  if (/^(\d)\1+$/.test(d)) return false;
  if (d.length === 11) {
    for (const t of [9, 10]) {
      let soma = 0;
      for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
      if (((soma * 10) % 11) % 10 !== Number(d[t])) return false;
    }
    return true;
  }
  if (d.length === 14) {
    const calc = (base: string) => {
      const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const r = base.split('').reduce((acc, n, i) => acc + Number(n) * pesos[i], 0) % 11;
      return r < 2 ? 0 : 11 - r;
    };
    const d1 = calc(d.slice(0, 12));
    return d1 === Number(d[12]) && calc(d.slice(0, 12) + d1) === Number(d[13]);
  }
  return false;
}

export const tamanhoArquivo = (b: number) =>
  b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;

export const hojeISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
