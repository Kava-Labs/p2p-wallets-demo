'use strict'

process.env.DEBUG = '*'
const debug = require('debug')('alice')
const crypto = require('crypto')
const ILPPacket = require('ilp-packet')
const BtpPlugin = require('ilp-plugin-btp')

const connectorAddress = 'demo.connector.kava.io'

const fulfillment = Buffer.alloc(32, 'a random string') // Pre-images need to by 32 byte buffers.


function fulfillmentToCondition (preimage) {
  const h = crypto.createHash('sha256')
  h.update(preimage)
  return h.digest()
}

function createPreparePacket ({destination, amount, duration}) {
	let packet = ILPPacket.serializeIlpPrepare({
		amount: amount,
		executionCondition: fulfillmentToCondition(fulfillment), // needs to be a buffer
		expiresAt: new Date(Date.now() + duration*1000),
		destination: destination,
		data: Buffer.alloc(0), //empty
	})
	return packet
}

async function main () {
	debug('Creating the plugin instance and connectign to the connector.')
	let plugin = new BtpPlugin({
			server: `btp+ws://alice:alicesSecret@${connectorAddress}:1800`
	})
		
	await plugin.connect()
	
	debug('Creating a prepare packet.')
	let packet = createPreparePacket({destination: 'demo.btpBob', amount: '5', duration: 10})
	
	debug('Sending the payment.')
	let returnedIlpPacket
	returnedIlpPacket = await plugin.sendData(packet)
	
	// At this point I think the sender checks the packet and then calls `plugin.sendMoney` to actually send money to the connector.
	
	debug('Done.')
}

main()
