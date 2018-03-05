/*
An API for intereacting with a Venmo account.

Information about using selenium:
Selenium getting started: https://team.goodeggs.com/getting-started-with-selenium-webdriver-for-node-js-f262a00c52e1
Selenium JS examples: https://github.com/SeleniumHQ/selenium/tree/master/javascript/node/selenium-webdriver/example
Selelnium-webdriver js reference: http://seleniumhq.github.io/selenium/docs/api/javascript/index.html 
Nice tutorial on unreliability of the wait() function https://medium.freecodecamp.org/how-to-write-reliable-browser-tests-using-selenium-and-node-js-c3fdafdca2a9
*/

const fs = require('fs')
const debug = require('debug')('venmo-api');
const {Builder, By, Key, until} = require('selenium-webdriver');
const Chrome = require('selenium-webdriver/chrome');
//var path = require('chromedriver').path;
const CHROME_EXECUTABLE = process.env.GOOGLE_CHROME_BIN

//These are needed when using the chromedriver npm package. Switching to using brew chromedriver for now.
//var service = new Chrome.ServiceBuilder(path).build();
//Chrome.setDefaultService(service);


class VenmoAPI {
	constructor(username, password) {
		this.username = username;
		this.password = password;
		this.driver = undefined;
		this.lastLogInTime = 0;
	}
	
	async login() {
		await this.driver.get('https://venmo.com/account/sign-in');
    
    await this.driver.sleep(3000);
    this.driver.takeScreenshot().then(function (base64Image) {
        var decodedImage = new Buffer(base64Image, 'base64');
        fs.writeFile('after_login_load.jpg', decodedImage, function(err) {});
        debug(`Took screenshot after log in page loaded ${new Date()}`);
    });
    
    await this.driver.wait(until.elementLocated(By.name('phoneEmailUsername')),5000).sendKeys(this.username);
    
		let passwordBox = await this.driver.wait(until.elementLocated(By.name('password')),5000);
		await passwordBox.sendKeys(this.password)
    await this.driver.sleep(1000)
    
    debug(`user agent: ${await this.driver.executeScript("return navigator.userAgent")}`)
    this.driver.takeScreenshot().then(function (base64Image) {
        var decodedImage = new Buffer(base64Image, 'base64');
        fs.writeFile('before_login.jpg', decodedImage, function(err) {});
        debug(`Took before log in screenshot ${new Date()}`);
    });
    
		await passwordBox.submit();
    debug(`submitted log in information ${new Date()}`)
    //wait to see which page it ends up at. Check url.
    try {
      await this.driver.wait(until.elementLocated(By.linkText('Log out')),3000)
    } catch (e) {
      // ignore timeout errors
      debug(`timed out waiting for log in link ${new Date()}`)
    }
    
    this.driver.takeScreenshot().then(function (base64Image) {
        var decodedImage = new Buffer(base64Image, 'base64');
        fs.writeFile('after_login.jpg', decodedImage, function(err) {});
        debug('Took after log in screenshot');
    });
    
    let url = await this.driver.getCurrentUrl()
    debug(`Url of page after log in attempt: ${url}`)
    if (url.toString() == 'https://venmo.com/account/mfa/code-prompt') {
      console.log('Venmo requires 2 factor authorization.')
      throw 'mfa error'
    } else {
      // if mfa then throw else continue
      this.lastLogInTime = Date.now()
    }
	}
  
  async send2FactorCode() {
    // assumes it's already at the right page
    //await this.driver.get('https://venmo.com/account/mfa/code-prompt')
    try {
      debug('logging in in order to send mfa code')
      await this.login()
    } catch (e) {
      // ignore mfa error
      debug(`error in logging in: ${e}`)
    }
    debug('finding send mfa code button and clicking it')
    await this.driver.findElement(By.css('button.mfa-button-code-prompt')).click()
  }
  
  async submit2FactorAuth(authCode) {
    // assumes it's already at the right page
    let authCodeElement = await this.driver.wait(
			until.elementLocated(By.name('token')),10000); //also class=auth-form-input
    await authCodeElement.sendKeys(authCode);
    await authCodeElement.submit();
    
    // Wait for a few seconds to avoid stale element error. TODO Find proper way of waiting. https://stackoverflow.com/questions/5709204/random-element-is-no-longer-attached-to-the-dom-staleelementreferenceexception
    try {
      await this.driver.wait(until.elementLocated(By.name('rhubarb')),5000)
    } catch (e) {
      //do nothing
    }
    
    let rememberButton = await this.driver.wait(
			until.elementLocated(By.css('button.auth-button')),10000);
    
    debug('found button, clicking..')
    await rememberButton.click()
    //await login()
  }
	
	async connect(headless=true) {
		debug('connecting venmo api')
    debug(`google_chrome_shim:${process.env.GOOGLE_CHROME_SHIM}, google_chrom_bin:${process.env.GOOGLE_CHROME_BIN}`)
		let options = new Chrome.Options()
		if (headless) {
			options.headless().windowSize({width: 640, height: 480})
		}
		if (CHROME_EXECUTABLE) {
			debug('changing chrome path')
			options.setChromeBinaryPath(CHROME_EXECUTABLE)
		}
    const safeUserAgent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.186 Safari/537.36'
    options.addArguments(`user-agent="${safeUserAgent}"`)
    // with headless chrome, UA is 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/64.0.3282.186 Safari/537.36'
    options.addArguments('headless','disable-gpu','no-sandbox') // add arguments provided by the SHIM
		debug('added arguments to chrome')
    
		this.driver = await new Builder()
			.forBrowser('chrome')
			.setChromeOptions(options)
			.build();
		
    debug(`built chrome driver. Current page title: ${await this.driver.getTitle()}`)
    
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
