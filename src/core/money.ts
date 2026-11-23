/** Money is integer minor units (cents). Format only at the UI edge. */
export function createMoneyFormatter(currency = 'USD', locale?: string): (minor: number) => string {
  let fmt: Intl.NumberFormat;
  try {
    fmt = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    fmt = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return (minor) => fmt.format(minor / 100);
}

export function formatMultiplier(x: number): string {
  return `×${x.toFixed(2)}`;
}
