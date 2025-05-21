const units = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
];
const teens = [
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const tens = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

function numberToWordsIndian(num: number): string {
  if (num === 0) return 'Zero';

  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const hundred = Math.floor((num % 1000) / 100);
  const remainder = num % 100;

  const parts: string[] = [];
  const nonZeroUnits: string[] = [];

  // Track non-zero units for "and" placement
  if (crore > 0) {
    nonZeroUnits.push('crore');
    parts.push(`${convertTwoDigits(crore)} Crore`);
  }
  if (lakh > 0) {
    nonZeroUnits.push('lakh');
    parts.push(`${convertTwoDigits(lakh)} Lakh`);
  }
  if (thousand > 0) {
    nonZeroUnits.push('thousand');
    parts.push(`${convertTwoDigits(thousand)} Thousand`);
  }
  if (hundred > 0) {
    nonZeroUnits.push('hundred');
    parts.push(`${units[hundred]} Hundred`);
  }
  if (remainder > 0) {
    nonZeroUnits.push('ones');
    parts.push(convertTwoDigits(remainder));
  }

  // If there's more than one non-zero unit, insert "and" before the last one
  if (nonZeroUnits.length > 1) {
    parts.splice(parts.length - 1, 0, 'and');
  }

  return parts.join(' ').trim();
}

function convertTwoDigits(num: number): string {
  if (num === 0) return '';
  if (num < 10) return units[num];
  if (num < 20) return teens[num - 10];
  const ten = Math.floor(num / 10);
  const unit = num % 10;
  return unit === 0 ? tens[ten] : `${tens[ten]} ${units[unit]}`;
}

export { numberToWordsIndian };
