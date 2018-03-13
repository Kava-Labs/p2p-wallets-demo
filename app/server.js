const debug = require('debug')('server');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const basicAuth = require('express-basic-auth')
const PORT = process.env.PORT || 5000 // default `heroku local` port
const app = express()
const assert = require('assert');
global.fetch = require('node-fetch')
const cc = require('cryptocompare')

// Paypal info
const paypal = require('paypal-rest-sdk');
// Define these in your PATH
const client_id = process.env.PAYPAL_CLIENT_ID
const client_secret = process.env.PAYPAL_CLIENT_SECRET

// Venmo info
const VenmoAPI = require('./venmo-api')
// Define these in your PATH
const venmo_email = process.env.VENMO_EMAIL
const venmo_pass = process.env.VENMO_PASS

var venmo2faApiInstance

// Ripple info
const RippleAPI = require('ripple-lib').RippleAPI;
// Define these in your PATH
const connectorXrpAddr = process.env.XRP_ADDR;
const connectorXrpSecret = process.env.XRP_SECRET;
// Ripple API specific constants
/* Milliseconds to wait between checks for a new ledger. */
const INTERVAL = 1000;
/* Instantiate RippleAPI. Uses s2 (full history server) */
// Test net: 'wss://s.altnet.rippletest.net:51233'
const ripple_api = new RippleAPI({server: 'wss://s.altnet.rippletest.net:51233'});
/* Number of ledgers to check for valid transaction before failing */
const ledgerOffset = 5;
const xrpPaymentInstructions = {maxLedgerVersionOffset: ledgerOffset};


paypal.configure({
  'mode': 'live', //sandbox or live
  'client_id': client_id,
  'client_secret': client_secret
});


function requestMoneyPaypal(api, receiver_email, amount, currency='USD') {
// Create an invoice JSON object
    var create_invoice_json = {
        "merchant_info": {
            "email": "connector@kava.io",
            "first_name": "Kava",
            "last_name": "Konnector",
            "business_name": "Kava Labs, Inc.",
            "phone": {
                "country_code": "001",
                "national_number": "5555555555"
            },
            "address": {
                "line1": "1234 Main St.",
                "city": "Portland",
                "state": "OR",
                "postal_code": "97217",
                "country_code": "US"
            }
        },
        "billing_info": [{
            "email": receiver_email
        }],
        "items": [{
            "name": "Transfers",
            "quantity": 1.0,
            "unit_price": {
                "currency": "USD",
                "value": amount
            }
        }],
        "note": "Kava Konnector Services",
        "payment_term": {
            "term_type": "NET_45"
        },
        "shipping_info": {
            "first_name": "NA",
            "last_name": "NA",
            "business_name": "Not applicable",
            "phone": {
                "country_code": "001",
                "national_number": "5039871234"
            },
            "address": {
                "line1": "NA",
                "city": "NA",
                "state": "NA",
                "postal_code": "NA",
                "country_code": "NA"
            }
        },
        "tax_inclusive": true,
        "total_amount": {
            "currency": currency,
            "value": amount
        }
    };
    // Create the invoice
    api.invoice.create(create_invoice_json, function (error, invoice) {
        if (error) {
            console.log(error);
            //throw error;
        } else {
            console.log("Create Invoice Response");
            console.log(invoice.id)
            // Send the invoice to the recicpient's email
            api.invoice.send(invoice.id, function (error, rv) {
                if (error) {
                    console.log(error.response);
                    //throw error;
                } else {
                    console.log("Send Invoice Response");
                    console.log(rv);
                }
            });
        }
    });
}

async function sendMoneyVenmo(destinationUsername, amount) {
  const venmo = new VenmoAPI(venmo_email, venmo_pass)
  try {
    console.log('Connecting venmo API.')
    await venmo.connect()
    console.log('Logging into venmo.')
    await venmo.login()
    
    console.log('Getting venmo balance.')
    let balance = await venmo.getBalance()
    if (balance < amount) {
        console.log("Insufficient funds.")
        return
    }
    console.log('Sending money by venmo.')
    await venmo.sendMoney(destinationUsername, amount, 'an ILP transfer by Kava')
    
  } finally {
    await venmo.disconnect()
  }
}

/* Define the payment to make here */
function preparePaymentXRP(source_addr, dest_addr, amount, currency="XRP"){
  var paymentTx = {
    "source": {
      "address": source_addr,
      "maxAmount": {
        "value": String(amount),
        "currency": currency
      }
    },
    "destination": {
      "address": dest_addr,
      "amount": {
        "value": String(amount),
        "currency": currency,
      }
    }
  }
  return paymentTx;
}

/* Verify a transaction is in a validated XRP Ledger version */
function verifyXrpTransaction(hash, options) {
  console.log('Verifing Transaction');
  return ripple_api.getTransaction(hash, options).then(data => {
    console.log('Final Result: ', data.outcome.result);
    console.log('Validated in Ledger: ', data.outcome.ledgerVersion);
    console.log('Sequence: ', data.sequence);
    return data.outcome.result === 'tesSUCCESS';
  }).catch(error => {
    /* If transaction not in latest validated ledger,
       try again until max ledger hit */
    if (error instanceof ripple_api.errors.PendingLedgerVersionError) {
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
  const signedData = ripple_api.sign(prepared.txJSON, secret);
  return ripple_api.submit(signedData.signedTransaction).then(data => {
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


async function sendMoneyXrp(amount,receive_account) {
  let prices = await cc.price('USD', 'XRP')
  console.log(amount * prices['XRP'])
  
  let xrp_payment = preparePaymentXRP(connectorXrpAddr, receive_account, amount * prices['XRP'])
  await ripple_api.connect()
  console.log('Connected');
  let prepared = await ripple_api.preparePayment(connectorXrpAddr, xrp_payment, xrpPaymentInstructions);
  console.log('Payment Prepared');
  
  let ledger = await ripple_api.getLedger()
  console.log('Current Ledger', ledger.ledgerVersion);
  await submitXrpTransaction(ledger.ledgerVersion, prepared, connectorXrpSecret);
  
  await ripple_api.disconnect()
  console.log('Ripple api disconnected');
}


app.use(express.static(path.resolve(__dirname + '/public')));
app.use(bodyParser.urlencoded({ extended: true })); // an epxress middleware that allows enables use of `req.body` to access parameters passed in url
app.set('view engine', 'ejs')
app.set('views',path.resolve(__dirname + '/views'))


app.use(basicAuth({
	users: {
		'ruaridh': process.env.RUARIDHS_PASSWORD,
		'kevin': process.env.KEVINS_PASSWORD,
        'kava': process.env.KAVA_PASSWORD},
	challenge: true,
	realm: 'PRunzwXZhi4UFhWuwCTAwGZ',
}))

app.get('/', function (req, res) {
  res.render('index', {result: null, user: req.auth.user});
})

/*
app.get('/login', function (req, res) {
  res.render('login');
})
*/

app.post('/', function (req, res) {
  // TODO sanitize inputs
  console.log(req.body.from);
  console.log(req.body.send_account)
  console.log(req.body.to);
  console.log(req.body.receive_account)
  console.log(req.body.amount);
  // TODO move $1 cap to validation code
  // Naive way of sending payments:
  if (req.body.from == 'paypal' && req.body.amount < 1.0) {
    console.log("Requesting paypal payment")
    requestMoneyPaypal(paypal, req.body.send_account, req.body.amount)
    }
  if (req.body.to == 'venmo' && req.body.amount < 1.0){
    // wait a bit before sending venmo payment
    setTimeout(() => {
      console.log("Sending venmo payment")
      sendMoneyVenmo(req.body.receive_account, req.body.amount)
    },10000)
  }
  if (req.body.to == 'ripple' && req.body.amount <1.0) {
    console.log("Sending XRP payment")
    sendMoneyXrp(req.body.amount, req.body.receive_account)
  }
  console.log('sending payment');
  
  res.render('payment-processing', {from: req.body.from, to: req.body.to, user: req.auth.user});  
})

app.get('/venmo-2fa', function (req, res) {
  res.render('venmo-2fa')
})

app.post('/venmo-2fa', async function (req, res) {
  venmo2faApiInstance = new VenmoAPI(venmo_email, venmo_pass)
  console.log('connecting')
  await venmo2faApiInstance.connect()
  await venmo2faApiInstance.send2FactorCode()
  res.redirect('/venmo-2fa/submit')
})

app.get('/venmo-2fa/submit', function (req, res) {
  res.render('venmo-2fa/submit')
})

app.post('/venmo-2fa/submit', async function (req, res) {
  console.log(req.body.auth_code)
  await venmo2faApiInstance.submit2FactorAuth(req.body.auth_code)
  await venmo2faApiInstance.disconnect()
  res.redirect('/');
})


app.listen(PORT, function () {
  console.log(`Example app listening on port ${PORT}!`)
})
