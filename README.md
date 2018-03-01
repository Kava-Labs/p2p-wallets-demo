# P2P Wallets Demo

## /app

Super basic web app. Doesn't send payment yet.

To run:

 1. `npm install`
 2. `npm start`
 3.  Then go to http://localhost:5000

## /examples

This contains a minimal script to send an ILP payment and display what's going on.

To run it do this:

 1. `npm install`
 2. Then open up two terminal windows.
 3. In one, run `node bob.js`. This will set up Bob, connect to the connector, and wait for a payment.
 4. In the other window run `node alice.js`. This will set up Alice and send a "payment" to Bob.
