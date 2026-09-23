/**
 * Minimal CSV yazıcı (RFC 4180).
 *
 * Kütüphane eklemedik: tek ihtiyacımız kaçış kurallarını doğru uygulamak.
 * Kaçış olmadan, içinde virgül geçen bir mağaza adı dosyayı sessizce bozar.
 */

export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";

  const text = String(value);

  // Tırnak, virgül, satır sonu ya da baştaki/sondaki boşluk varsa tırnakla.
  if (/[",\n\r]|^\s|\s$/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function toCsvRow(values: unknown[]): string {
  return `${values.map(escapeCsvValue).join(",")}\r\n`;
}
