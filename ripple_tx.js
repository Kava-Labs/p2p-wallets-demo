'use strict';
/* import RippleAPI and support libraries */
const RippleAPI = require('ripple-lib').RippleAPI;
const assert = require('assert');

/* Credentials of the account placing the order */
const connectorXrpAddr = process.env.XRP_ADDR;
const connectorXrpSecret = process.env.XRP_SECRET;

/* Define the payment to make here */
function preparePaymentXRP(source_addr, dest_addr, amount, currency="XRP"){
  var paymentTx = {
    "source": {
      "address": source_addr,
      "maxAmount": {
        "value": amount,
        "currency": currency
      }
    },
    "destination": {
      "address": dest_addr,
      "amount": {
        "value": amount,
        "currency": currency,
      }
    }
  }
  return paymentTx;
}

/* Milliseconds to wait between checks for a new ledger. */
const INTERVAL = 1000;
/* Instantiate RippleAPI. Uses s2 (full history server) */
const api = new RippleAPI({server: 'wss://s2.ripple.com'});
/* Number of ledgers to check for valid transaction before failing */
const ledgerOffset = 5;
const xrpPaymentInstructions = {maxLedgerVersionOffset: ledgerOffset};


/* Verify a transaction is in a validated XRP Ledger version */
function verifyXrpTransaction(hash, options) {
  console.log('Verifing Transaction');
  return api.getTransaction(hash, options).then(data => {
    console.log('Final Result: ', data.outcome.result);
    console.log('Validated in Ledger: ', data.outcome.ledgerVersion);
    console.log('Sequence: ', data.sequence);
    return data.outcome.result === 'tesSUCCESS';
  }).catch(error => {
    /* If transaction not in latest validated ledger,
       try again until max ledger hit */
    if (error instanceof api.errors.PendingLedgerVersionError) {
      return new Promise((resolve, reject) => {
        setTimeout(() => verifyXrpTransaction(hash, options)
        .then(resolve, reject), INTERVAL);
      });
    }
    return error;
  });
}


/* Function to prepare, sign, and submit a transaction to the XRP Ledger. */
function submitXrpTransaction(lastClosedLedgerVersion, prepared, secret) {
  const signedData = api.sign(prepared.txJSON, secret);
  return api.submit(signedData.signedTransaction).then(data => {
    console.log('Tentative Result: ', data.resultCode);
    console.log('Tentative Message: ', data.resultMessage);
    /* If transaction was not successfully submitted throw error */
    assert.strictEqual(data.resultCode, 'tesSUCCESS');
    /* 'tesSUCCESS' means the transaction is being considered for the next ledger, and requires validation. */

    /* If successfully submitted, begin validation workflow */
    const options = {
      minLedgerVersion: lastClosedLedgerVersion,
      maxLedgerVersion: prepared.instructions.maxLedgerVersion
    };
    return new Promise((resolve, reject) => {
      setTimeout(() => verifyXrpTransaction(signedData.id, options)
    .then(resolve, reject), INTERVAL);
    });
  });
}

const destinationAddress = "rhp6H6qV42g4d8zYdzP7Dwr9qLRyN21TuV"
var xrp_payment = preparePaymentXRP(connectorXrpAddr, destinationAddress, "0.1")

api.connect().then(() => {
  console.log('Connected');
  return api.preparePayment(connectorXrpAddr, xrp_payment, xrpPaymentInstructions);
}).then(prepared => {
  console.log('Payment Prepared');
  return api.getLedger().then(ledger => {
    console.log('Current Ledger', ledger.ledgerVersion);
    return submitXrpTransaction(ledger.ledgerVersion, prepared, connectorXrpSecret);
  });
}).then(() => {
  api.disconnect().then(() => {
    console.log('api disconnected');
    process.exit();
  });
}).catch(console.error);
