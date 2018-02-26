const express = require('express');
const bodyParser = require('body-parser');
const app = express()


app.use(express.static('public')); // this path is relative to where node was started
app.use(bodyParser.urlencoded({ extended: true })); // an epxress middleware that allows enables use of `req.body` to access parameters passed in url
app.set('view engine', 'ejs')


app.get('/', function (req, res) {
  res.render('index', {result: null});
})


app.post('/', function (req, res) {
  console.log(req.body.from);
  console.log(req.body.to);
  console.log(req.body.amount);
  console.log('sending payment');
	// TODO trigger an ILP payment
  res.render('index', {result: 'payment sent!'});  
})


app.listen(3000, function () {
  console.log('Example app listening on port 3000!')
})
