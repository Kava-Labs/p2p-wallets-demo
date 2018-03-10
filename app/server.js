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

const venmo = new VenmoAPI(venmo_email, venmo_pass)

// Ripple info
const RippleAPI = require('ripple-lib').RippleAPI;
// Define these in your PATH
const connectorXrpAddr = process.env.XRP_ADDR;
const connectorXrpSecret = process.env.XRP_SECRET;
// Ripple API specific constants
/* Milliseconds to wait between checks for a new ledger. */
const INTERVAL = 1000;
/* Instantiate RippleAPI. Uses s2 (full history server) */
const ripple_api = new RippleAPI({server: 'wss://s2.ripple.com'});
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
    console.log('Connecting venmo API.')
    try {
      await venmo.connect(false)
    } catch (e/* if e == 'mfa error'*/){ // TODO better way of doing this?
      console.log(`Couldn't connect to venmo: ${e}`)
      return
    }
    console.log('Getting venmo balance.')
    let balance = await venmo.getBalance()
    if (balance < amount) {
        console.log("Insufficient funds.")
        return
    }
    console.log('Sending money by venmo.')
    await venmo.sendMoney(destinationUsername, amount, 'an ILP transfer by Kava')
    // await venmo.disconnect() TODO disconnect on shutdown somehow
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
  // Naive way of sending payments:
  if (req.body.from == 'paypal' && req.body.amount < 1.0) {
    console.log("Requesting paypal payment")
    requestMoneyPaypal(paypal, req.body.send_account, req.body.amount)
    // wait a bit before sending venmo payment
    }
  if (req.body.to == 'venmo' && req.body.amount < 1.0){
    setTimeout(() => {
      console.log("Sending venmo payment")
      sendMoneyVenmo(req.body.receive_account, req.body.amount)
    },10000)
  }
  if (req.body.to == 'ripple' && req.body.amount <1.0) {
    cc.price('USD', 'XRP')
    .then(prices => {
      console.log(req.body.amount * prices['XRP'])
      var xrp_payment = preparePaymentXRP(connectorXrpAddr, req.body.receive_account, req.body.amount * prices['XRP'])
      ripple_api.connect().then(() => {
          console.log('Connected');
          return ripple_api.preparePayment(connectorXrpAddr, xrp_payment, xrpPaymentInstructions);
        }).then(prepared => {
          console.log('Payment Prepared');
          return ripple_api.getLedger().then(ledger => {
            console.log('Current Ledger', ledger.ledgerVersion);
            return submitXrpTransaction(ledger.ledgerVersion, prepared, connectorXrpSecret);
          });
        }).then(() => {
          ripple_api.disconnect().then(() => {
            console.log('Ripple api disconnected');
            process.exit();
          });
        }).catch(console.error);
    }).catch(console.error)
    }
  console.log('sending payment');
	// TODO trigger an ILP payment
	res.render('payment-processing', {from: req.body.from, to: req.body.to, user: req.auth.user});  
})

app.get('/venmo-mfa', function (req, res) {
  venmo.send2FactorCode()
  res.render('venmo-mfa');})

app.post('/venmo-mfa', function (req, res) {
  console.log(req.body.auth_code)
  venmo.submit2FactorAuth(req.body.auth_code)
  res.redirect('/');
})


app.listen(PORT, function () {
  console.log(`Example app listening on port ${PORT}!`)
})
