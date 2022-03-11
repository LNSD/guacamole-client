/** @type {import('prettier').Config */
module.exports = {
  plugins: [require('@trivago/prettier-plugin-sort-imports')],
  singleQuote: true,
  trailingComma: 'all',
  semi: true,
  importOrder: ['^[./]'],
  importOrderSeparation: true,
};
