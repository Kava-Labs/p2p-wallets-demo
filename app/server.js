const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const app = express()


app.use(express.static(path.resolve(__dirname + '/public')));
app.use(bodyParser.urlencoded({ extended: true })); // an epxress middleware that allows enables use of `req.body` to access parameters passed in url
app.set('view engine', 'ejs')
app.set('views',path.resolve(__dirname + '/views'))


app.get('/', function (req, res) {
  res.render('index', {result: null});
})

app.get('/login', function (req, res) {
  res.render('login');
})

app.post('/', function (req, res) {
  console.log(req.body.from);
  console.log(req.body.to);
  console.log(req.body.amount);
  console.log('sending payment');
	// TODO trigger an ILP payment
	res.render('payment-processing');  
})


app.listen(3000, function () {
  console.log('Example app listening on port 3000!')
})
