// Function to convert number to words (Indian number system)
export const numberToWordsIndian = (num: number): string => {
  if (num === 0) return 'Zero';

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
  const thousands = ['', 'Thousand', 'Lakh', 'Crore'];

  const numToWords = (n: number): string => {
    if (n === 0) return '';
    if (n < 10) return units[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) {
      const ten = Math.floor(n / 10);
      const unit = n % 10;
      return `${tens[ten]}${unit ? ' ' + units[unit] : ''}`;
    }
    if (n < 1000) {
      const hundred = Math.floor(n / 100);
      const rest = n % 100;
      return `${units[hundred]} Hundred${rest ? ' ' + numToWords(rest) : ''}`;
    }
    if (n < 100000) {
      const thousand = Math.floor(n / 1000);
      const rest = n % 1000;
      return `${numToWords(thousand)} Thousand${
        rest ? ' ' + numToWords(rest) : ''
      }`;
    }
    if (n < 10000000) {
      const lakh = Math.floor(n / 100000);
      const rest = n % 100000;
      return `${numToWords(lakh)} Lakh${rest ? ' ' + numToWords(rest) : ''}`;
    }
    const crore = Math.floor(n / 10000000);
    const rest = n % 10000000;
    return `${numToWords(crore)} Crore${rest ? ' ' + numToWords(rest) : ''}`;
  };

  num = Math.floor(num); // Ignore decimals
  return numToWords(num).trim();
};
