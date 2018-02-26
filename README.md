# P2P Wallets Demo

## /app

Super basic web app. Doesn't send payment yet.

To run:

 1. `npm install`
 - `npm start`
 - Then go to http://localhost:3000

## /examples

This contains a minimal script to send an ILP payment and display what's going on.

To run it do this:

 1. `npm install`

 - Then open up two terminal windows.

 - In one, run `node bob.js`. This will set up Bob, connect to the connector, and wait for a payment.

 - In the other window run `node alice.js`. This will set up Alice and send a "payment" to Bob.
