export const locations = [
  {
    id: 'downtown',
    name: 'Downtown Hub',
    address: '124 Main Street, Cityville',
    image: 'gradient',
    color: 'from-[#6d0214]/80 to-[#c50125]/60',
    tokenCount: 52,
    availableTokens: [
      { id: 'd-1', label: '1 Day', duration: 'daily', price: 2.0, validity: '24 hours' },
      { id: 'd-2', label: '1 Week', duration: 'weekly', price: 7.0, validity: '7 days' },
      { id: 'd-3', label: '1 Month', duration: 'monthly', price: 20.0, validity: '30 days' },
    ],
  },
  {
    id: 'uptown',
    name: 'Uptown Plaza',
    address: '88 Oak Avenue, Northside',
    image: 'gradient',
    color: 'from-[#3b4cca] to-[#667eea]',
    tokenCount: 36,
    availableTokens: [
      { id: 'u-1', label: '1 Day', duration: 'daily', price: 2.0, validity: '24 hours' },
      { id: 'u-2', label: '1 Week', duration: 'weekly', price: 7.0, validity: '7 days' },
      { id: 'u-3', label: '1 Month', duration: 'monthly', price: 20.0, validity: '30 days' },
    ],
  },
  {
    id: 'riverside',
    name: 'Riverside Center',
    address: 'Market Street, Riverside',
    image: 'gradient',
    color: 'from-[#059669] to-[#10b981]',
    tokenCount: 41,
    availableTokens: [
      { id: 'r-1', label: '1 Day', duration: 'daily', price: 2.0, validity: '24 hours' },
      { id: 'r-2', label: '1 Week', duration: 'weekly', price: 7.0, validity: '7 days' },
      { id: 'r-3', label: '1 Month', duration: 'monthly', price: 20.0, validity: '30 days' },
    ],
  },
]
