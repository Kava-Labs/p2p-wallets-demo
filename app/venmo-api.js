/*
An API for intereacting with a Venmo account.

Information about using selenium:
Selenium getting started: https://team.goodeggs.com/getting-started-with-selenium-webdriver-for-node-js-f262a00c52e1
Selenium JS examples: https://github.com/SeleniumHQ/selenium/tree/master/javascript/node/selenium-webdriver/example
Selelnium-webdriver js reference: http://seleniumhq.github.io/selenium/docs/api/javascript/index.html 
Nice tutorial on unreliability of the wait() function https://medium.freecodecamp.org/how-to-write-reliable-browser-tests-using-selenium-and-node-js-c3fdafdca2a9
*/

const {Builder, By, Key, until} = require('selenium-webdriver');
const Chrome = require('selenium-webdriver/chrome');
var path = require('chromedriver').path;

var service = new Chrome.ServiceBuilder(path).build();
Chrome.setDefaultService(service);


class VenmoAPI {
	constructor(username, password) {
		this.username = username;
		this.password = password;
		this.driver = undefined;
		this.lastLogInTime = 0;
	}
	
	async login() {
		await this.driver.get('https://venmo.com/account/sign-in');
		await this.driver.findElement(By.name('phoneEmailUsername')).sendKeys(this.username);
		let passwordBox = await this.driver.findElement(By.name('password'));
		await passwordBox.sendKeys(this.password)
		await passwordBox.submit();
		this.lastLogInTime = Date.now()
	}
	
	async connect(headless=true) {
		let options = new Chrome.Options()
		if (headless) {
			options = options.headless().windowSize({width: 640, height: 480})
		}
		
		this.driver = await new Builder()
			.forBrowser('chrome')
			.setChromeOptions(options)
			.build();
		
		await this.login()
	}
	
	async sendMoney(destinationUsername, amount, paymentMessage) {
		await this.ensureLoggedIn()
		// Load the peer's venmo page
		await this.driver.get(`http://venmo.com/${destinationUsername}`);
		// Select to pay them.
		await this.driver.findElement(By.id('onebox_pay_toggle')).click() // using selenium promise manager thing
		// Enter the payment amount.
		await this.driver.findElement(By.id('onebox_details')).sendKeys(amount.toString() + ' ' + paymentMessage) // needs space to trigger the entry of 'for'
		// Send the payment
		await this.driver.findElement(By.id('onebox_send_button')).click()
		// If the user has not been 
	}
	
	async getBalance() {
		await this.ensureLoggedIn()
		// Load main account page.
		// await this.driver.get('http://venmo.com')
		// Extract balance info
		let balanceString = await this.driver.wait(
			until.elementLocated(By.id('balance_right_side')), 20000
			)
		balanceString = await balanceString.getText()
		// Drop initial $ sign. TODO check text matches pattern.
		return parseFloat(balanceString.slice(1))
	}
	
	async ensureLoggedIn() {
		// Log in if the last time we did so was more than 2 minutes ago.
		// TODO Actually verify if browser is logged in.
		if ((Date.now() - this.lastLogInTime) > 2*60*1000) {
			await this.login()
		}
	}
	
	disconnect() {
		this.driver.quit()
	}
}

module.exports = VenmoAPI
