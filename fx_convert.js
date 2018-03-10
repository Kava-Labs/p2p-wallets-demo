global.fetch = require('node-fetch')
const cc = require('cryptocompare')
 
 

// Passing a single pair of currencies:
cc.price('USD', 'XRP')
.then(prices => {
  console.log(prices['XRP'])
  // -> { USD: 1100.24 }
})
.catch(console.error)