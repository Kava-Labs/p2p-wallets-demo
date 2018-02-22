'use strict'

process.env.DEBUG = '*'
const debug = require('debug')('bob')
const crypto = require('crypto')
const ILPPacket = require('ilp-packet')
const BtpPlugin = require('ilp-plugin-btp')

const connectorAddress = 'demo.connector.kava.io'

const fulfillment = Buffer.alloc(32, 'a random string') // Pre-images need to be 32 byte buffers.


function fulfillmentToCondition (preimage) {
  const h = crypto.createHash('sha256')
  h.update(preimage)
  return h.digest()
}

function createRejectPacket ({code, message, data, triggeredByAddress}) {
  return ILPPacket.serializeIlpReject({
    code,
    message: message || '',
    data: data || Buffer.alloc(0),
    triggeredBy: triggeredByAddress
  })
}

function handleData(packet) {
	debug('Calling handleData.')
	
	let parsedPacket = ILPPacket.deserializeIlpPacket(packet)
	debug(`Recieved packet: ${JSON.stringify(parsedPacket)}`)
	
	debug('Checking if the execution condition matches the pre-image')
	let conditionMatches = (parsedPacket.data.executionCondition.equals(fulfillmentToCondition(fulfillment))) // Have to use .equals because these are buffer objects.
	debug(`Condition ${conditionMatches ? "matches." : "doesn't match."}`)
	
	if (!conditionMatches) {
		debug('Rejecting incoming payment.')
		return createRejectPacket(
			{code: 'F05',
			message: 'Condition generated does not match prepare.',
			triggeredByAddress: 'demo.btpBob'})
	} else {
		// At this point the higher level protocols would be called to check if this payment should be accepted.
		// Currently just accepting all payments.
		let accept = true
		
		if (accept) {
			debug('Accepting incoming payment.')
			return ILPPacket.serializeIlpFulfill({
				fulfillment: fulfillment,
				data: Buffer.alloc(0)
			})
		} else {
			debug('Rejecting incoming payment.')
			return createRejectPacket({
				code: 'F06',
				message: "Don't want that payment.",
				triggeredByAddress: 'demo.btpBob'})
		}
	}
}


async function main () {
	debug('Creating the plugin instance and connecting to the connector.')
	let plugin = new BtpPlugin({
			server: `btp+ws://bob:bobsSecret@${connectorAddress}:1801`
	})
		
	await plugin.connect()
	
	debug('Registering the callback that will handle incoming ILP packets.')
	await plugin.registerDataHandler(handleData)
	
	debug('Bob ready to recieve payments.')
}

main()
