const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const basicAuth = require('express-basic-auth')
const app = express()

// Paypal info
const paypal = require('paypal-rest-sdk');
// Define these in your PATH
const client_id = process.env.PAYPAL_CLIENT_ID
const client_secret = process.env.PAYPAL_CLIENT_SECRET

// Venmo info
const VenmoAPI = require('../../ilp-plugin-venmo/venmo-api.js')
// Define these in your PATH
const venmo_email = process.env.VENMO_EMAIL
const venmo_pass = process.env.VENMO_PASS

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
            throw error;
        } else {
            console.log("Create Invoice Response");
            console.log(invoice.id)
            // Send the invoice to the recicpient's email
            api.invoice.send(invoice.id, function (error, rv) {
                if (error) {
                    console.log(error.response);
                    throw error;
                } else {
                    console.log("Send Invoice Response");
                    console.log(rv);
                }
            });
        }
    });
}

async function sendMoneyVenmo(
        api_email, api_pass, destinationUsername, amount) {
    let venmo = await new VenmoAPI(api_email, api_pass)
    await venmo.connect()
    let balance = await venmo.getBalance()
    if (balance < amount) {
        console.log("Insufficient funds.")
        return
    }
    await venmo.sendMoney(destinationUsername, amount)
    await venmo.disconnect()
}


app.use(express.static(path.resolve(__dirname + '/public')));
app.use(bodyParser.urlencoded({ extended: true })); // an epxress middleware that allows enables use of `req.body` to access parameters passed in url
app.set('view engine', 'ejs')
app.set('views',path.resolve(__dirname + '/views'))


app.use(basicAuth({
	users: {
		'ruaridh': process.env.RUARIDHS_PASSWORD,
		'kevin': process.env.KEVINS_PASSWORD},
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
    console.log("Sending venmo payment")
    sendMoneyVenmo(venmo_email, venmo_pass, req.body.receive_account, req.body.amount)
    console.log("Requesting paypal payment")
    requestMoneyPaypal(paypal, req.body.send_account, req.body.amount)
    }
  console.log('sending payment');
	// TODO trigger an ILP payment
	res.render('payment-processing', {from: req.body.from, to: req.body.to, user: req.auth.user});  
})


app.listen(3000, function () {
  console.log('Example app listening on port 3000!')
})
