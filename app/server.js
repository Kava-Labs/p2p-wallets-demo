const debug = require('debug')('server');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const basicAuth = require('express-basic-auth')
const PORT = process.env.PORT || 5000 // default `heroku local` port
const app = express()

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
    setTimeout(() => {
      console.log("Sending venmo payment")
      sendMoneyVenmo(req.body.receive_account, req.body.amount)
    },10000)
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
