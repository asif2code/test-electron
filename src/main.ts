import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { Builder, By, Key, until } from 'selenium-webdriver';
import 'chromedriver';
import { Options } from 'selenium-webdriver/chrome';

// Enable hot reload for development
if (process.env.NODE_ENV !== 'production') {
  try {
    require('electron-reloader')(module, {
      debug: true,
      watchRenderer: true
    });
  } catch (err) {
    console.log('Error enabling hot reload:', err);
  }
}

let mainWindow: BrowserWindow | null = null;
let driver: any = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  await mainWindow.loadFile(path.join(__dirname, '../src/index.html'));

  // Initialize Selenium and navigate to Ticketmaster
  isSeleniumReady = await initializeSelenium();
  if (isSeleniumReady && driver) {
    try {
      console.log('Navigating to Ticketmaster...');
      await driver.get('https://www.ticketmaster.com');
      console.log('Successfully navigated to Ticketmaster');
    } catch (error) {
      console.error('Error navigating to Ticketmaster:', error);
    }
  }
}

async function initializeSelenium() {
  try {
    const options = new Options();

    // Add stealth settings
    const args = [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1920,1080',
      '--start-maximized',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-notifications',
      '--disable-popup-blocking',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    ];

    args.forEach(arg => options.addArguments(arg));

    // Exclude automation flags
    options.excludeSwitches('enable-automation');

    // Add experimental options
    options.addArguments('--disable-automation');

    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    // Additional stealth settings via CDP
    const cdpConnection = await driver.createCDPConnection('page');
    await cdpConnection.execute('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      `
    });

    console.log('Chrome WebDriver initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing Chrome:', error);
    return false;
  }
}

let isSeleniumReady = false;

// Function to analyze form structure
async function analyzeFormStructure() {
  try {
    if (!driver) return null;

    // Get page HTML
    const html = await driver.getPageSource();
    console.log('Analyzing page structure...');

    // Log the HTML for analysis
    // console.log('Page HTML:', html);

    // Get all input elements and their attributes
    const inputElements = await driver.findElements(By.css('input, select, button'));

    for (const element of inputElements) {
      try {
        const tagName = await element.getTagName();
        const type = await element.getAttribute('type');
        const name = await element.getAttribute('name');
        const id = await element.getAttribute('id');
        const className = await element.getAttribute('class');
        const ariaLabel = await element.getAttribute('aria-label');
      } catch (error) {
        console.log('Error getting element attributes:', error);
      }
    }

    return html;
  } catch (error) {
    console.error('Error analyzing form structure:', error);
    return null;
  }
}


// Function to fill payment form
async function fillPaymentForm() {
  try {
    if (!driver) {
      console.log('Driver not initialized');
      return;
    }

    console.log('Starting payment form process...');

    // First switch back to default content
    try {
      await driver.switchTo().defaultContent();
      console.log('Switched to default content');
    } catch (error) {
      console.log('Error switching to default content:', error);
    }

    // Find the payment div container
    console.log('Looking for payment container div...');
    const paymentDivSelectors = [
      'div[id*="payment"]',
      'div[class*="payment"]',
      'div[id*="zoid-fan-wallet"]'
    ];

    let paymentDiv = null;
    for (const selector of paymentDivSelectors) {
      try {
        await driver.wait(until.elementLocated(By.css(selector)), 5000);
        paymentDiv = await driver.findElement(By.css(selector));
        console.log(`Found payment container with selector: ${selector}`);
        break;
      } catch (error) {
        console.log(`No payment div found with selector: ${selector}`);
        continue;
      }
    }

    if (!paymentDiv) {
      console.log('Could not find payment container div');
      return;
    }

    // Find and switch to main payment iframe
    console.log('Looking for main payment iframe...');
    try {
      await driver.wait(async () => {
        const iframes = await paymentDiv.findElements(By.tagName('iframe'));
        return iframes.length > 0;
      }, 5000, 'Timeout waiting for main iframe');

      const mainIframe = await paymentDiv.findElement(By.tagName('iframe'));
      await driver.switchTo().frame(mainIframe);
      console.log('Successfully switched to main payment iframe');

      // Define payment info
      interface PaymentInfo {
        cardName: string;
        cardNumber: string;
        expiryDate: string;
        cvv: string;
        country: string;
      }

      const paymentInfo: PaymentInfo = {
        cardName: 'John Doe',
        cardNumber: '4242424242424242',
        expiryDate: '1225',
        cvv: '424',
        country: 'United States'
      };

      // Fill card name first
      console.log('Filling card name...');
      const cardNameSelectors = [
        'input[name="cardholderName"]',
        'input[placeholder*="name" i]',
        'input[aria-label*="name" i]',
        '#cardholderName',
        'input[name*="name" i]',
        'input[autocomplete="cc-name"]'
      ];

      let cardNameFilled = false;
      for (const selector of cardNameSelectors) {
        try {
          const element = await driver.wait(until.elementLocated(By.css(selector)), 2000);
          await driver.wait(until.elementIsVisible(element), 2000);
          await element.clear();
          await element.sendKeys(paymentInfo.cardName);
          console.log('Successfully filled card name');
          cardNameFilled = true;
          break;
        } catch (error) {
          continue;
        }
      }

      // Function to fill a hosted field
      async function fillHostedField(fieldType: string, value: string) {
        try {
          // Switch back to main iframe first
          await driver.switchTo().defaultContent();
          await driver.switchTo().frame(mainIframe);
          
          // Find the specific hosted field iframe
          const iframeSelector = `iframe[name="braintree-hosted-field-${fieldType}"]`;
          await driver.wait(until.elementLocated(By.css(iframeSelector)), 5000);
          const hostedFieldIframe = await driver.findElement(By.css(iframeSelector));
          
          // Switch to the hosted field iframe
          await driver.switchTo().frame(hostedFieldIframe);
          console.log(`Switched to ${fieldType} iframe`);

          // Find and fill the input
          const input = await driver.wait(
            until.elementLocated(By.css('input[type="tel"], input[type="text"], input[type="number"]')),
            5000
          );
          await input.clear();
          
          // Type value with delay
          for (const char of value) {
            await input.sendKeys(char);
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          
          console.log(`Successfully filled ${fieldType}`);
          return true;
        } catch (error) {
          console.error(`Error filling ${fieldType}:`, error);
          return false;
        }
      }

      // Fill card number
      await fillHostedField('number', paymentInfo.cardNumber);

      // Fill expiry date
      await fillHostedField('expirationDate', paymentInfo.expiryDate);

      // Fill CVV
      await fillHostedField('cvv', paymentInfo.cvv);

      // Switch back to main iframe for submit button
      await driver.switchTo().defaultContent();
      await driver.switchTo().frame(mainIframe);

      // Try to find and click submit button
      const buttonSelectors = [
        'button[type="submit"]',
        'button:contains("Save")',
        'button:contains("Add Card")',
        'button.submit-button',
        'input[type="submit"]'
      ];

      let buttonClicked = false;
      for (const selector of buttonSelectors) {
        try {
          const button = await driver.findElement(By.css(selector));
          if (await button.isDisplayed() && await button.isEnabled()) {
            await button.click();
            console.log('Successfully clicked submit button');
            buttonClicked = true;
            break;
          }
        } catch (error) {
          continue;
        }
      }

      if (!buttonClicked) {
        console.log('Could not find or click submit button');
      }

    } catch (error) {
      console.error('Error in payment form process:', error);
    }

  } catch (error) {
    console.error('Error in fillPaymentForm:', error);
  } finally {
    // Always try to switch back to default content
    try {
      await driver.switchTo().defaultContent();
      console.log('Switched back to default content');
    } catch (error) {
      console.error('Error switching back to default content:', error);
    }
  }
}

// Function to check if we're on a wallet page with an iframe
async function checkAndFillWalletIframe() {
  try {
    if (!driver) return;

    const currentUrl = await driver.getCurrentUrl();
    console.log('Current URL:', currentUrl);

    if (currentUrl.includes('wallet') ||
      currentUrl.includes('member/edit_billing') ||
      currentUrl.includes('edit_billing')) {
      console.log('Detected wallet page, analyzing page structure...');

      // First try main document
      const mainFormStructure = await analyzeFormStructure();
      if (mainFormStructure && mainFormStructure.includes('input')) {
        await fillPaymentForm();
        return;
      }
      let iframe = await driver.findElement(By.tagName("iframe"));
      // console.log('Found iframe:', iframe);
      await driver.switchTo().frame(iframe);

      // Check iframes if form not found in main document
      const iframes = await driver.findElements(By.css('iframe'));
      // console.log(`Found ${iframes.length} iframes to check`);

      for (let i = 0; i < iframes.length; i++) {
        try {
          await driver.switchTo().frame(iframes[i]);
          // console.log(`Analyzing iframe ${i + 1}`);

          const iframeStructure = await analyzeFormStructure();
          if (iframeStructure && iframeStructure.includes('input')) {
            // console.log(`Found form elements in iframe ${i + 1}`);
            await fillPaymentForm();
            break;
          }

          await driver.switchTo().defaultContent();
        } catch (error: any) {
          console.log(`Error checking iframe ${i + 1}:`, error.message);
          await driver.switchTo().defaultContent();
        }
      }
    }
  } catch (error: any) {
    console.error('Error checking wallet page:', error);
    try {
      await driver.switchTo().defaultContent();
    } catch (frameError: any) {
      console.error('Error switching to default content:', frameError);
    }
  }
}

// Update the IPC handler for manual navigation
ipcMain.on('goto-ticketmaster', async () => {
  try {
    if (!isSeleniumReady || !driver) {
      console.log('Reinitializing Selenium...');
      mainWindow?.webContents.send('navigation-status', 'Initializing browser...');
      isSeleniumReady = await initializeSelenium();
    }

    if (isSeleniumReady && driver) {
      console.log('Navigating to Ticketmaster...');
      mainWindow?.webContents.send('navigation-status', 'Navigating to Ticketmaster...');

      try {
        await driver.get('https://www.ticketmaster.com');
        console.log('Successfully navigated to Ticketmaster');
        mainWindow?.webContents.send('navigation-status', 'Successfully navigated to Ticketmaster');
      } catch (navError) {
        console.error('Navigation error:', navError);
        mainWindow?.webContents.send('navigation-status', 'Error navigating to Ticketmaster');

        // Try to reinitialize and navigate again
        isSeleniumReady = await initializeSelenium();
        if (isSeleniumReady && driver) {
          await driver.get('https://www.ticketmaster.com');
          mainWindow?.webContents.send('navigation-status', 'Successfully navigated to Ticketmaster');
        }
      }
    } else {
      console.error('Selenium is not ready');
      mainWindow?.webContents.send('navigation-status', 'Error: Browser not ready');
    }
  } catch (error) {
    console.error('Error in goto-ticketmaster handler:', error);
    mainWindow?.webContents.send('navigation-status', 'Error occurred');
  }
});

// Add app ready handler
app.whenReady().then(createWindow).catch(console.error);

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    if (driver) {
      try {
        await driver.quit();
      } catch (error) {
        console.error('Error closing driver:', error);
      }
    }
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Listen for manual URL changes to wallet page
setInterval(async () => {
  if (isSeleniumReady && driver) {
    await checkAndFillWalletIframe();
  }
}, 2000); // Check every 2 seconds 