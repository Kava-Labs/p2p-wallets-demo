'use strict'

/* Run this script with ripple address as arguments. */
/* It will print out information about them.*/

const RippleAPI = require('ripple-lib').RippleAPI;

const api = new RippleAPI({
  server: 'wss://s.altnet.rippletest.net:51233'//'wss://s1.ripple.com' // Public rippled server
});

async function getAccountInfo(addr) {
  let info = await api.getAccountInfo(addr)
  info['address'] = addr
  return info
}

(async function () {
  await api.connect()
  console.log('connected')
  
  let infos
  infos = process.argv.slice(2).map((a) => getAccountInfo(a))

  infos = await Promise.all(infos)
  infos.forEach((i) => console.log(i))
  
  await api.disconnect()
  
  process.exit(0)
    
})().catch((err) => {console.error(err);process.exit(1)})