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

        // console.log('Element found:', {
        //   tagName,
        //   type,
        //   name,
        //   id,
        //   className,
        //   ariaLabel
        // });
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

// Function to find element by label text
async function findElementByLabel(labelText: string) {
  console.log('Finding element by label:', labelText);
  try {
    // Try different strategies to find the element
    const strategies = [
      // Strategy 1: Find label by exact text and get the associated input
      async () => {
        const label = await driver.findElement(By.xpath(`//label[normalize-space(text())="${labelText}"]`));
        const forAttribute = await label.getAttribute('for');
        if (forAttribute) {
          return await driver.findElement(By.id(forAttribute));
        }
        // If no 'for' attribute, try finding the next input
        return await driver.findElement(By.xpath(`//label[normalize-space(text())="${labelText}"]/following::input[1]`));
      },
      // Strategy 2: Find input by aria-label
      async () => await driver.findElement(By.css(`input[aria-label="${labelText}"]`)),
      // Strategy 3: Find by preceding label text
      async () => await driver.findElement(By.xpath(`//*[text()="${labelText}"]/following::input[1]`)),
      // Strategy 4: Find by parent div with label text
      async () => await driver.findElement(By.xpath(`//div[.//text()="${labelText}"]//input`)),
      // Strategy 5: Find by nearby text
      async () => await driver.findElement(By.xpath(`//*[contains(text(), "${labelText}")]/following::input[1]`))
    ];

    for (const strategy of strategies) {
      try {
        const element = await strategy();
        if (element) {
          console.log(`Found element for label "${labelText}" using strategy`);
          return element;
        }
      } catch (error) {
        continue;
      }
    }
    throw new Error(`Could not find element for label "${labelText}"`);
  } catch (error) {
    console.error(`Error finding element by label "${labelText}":`, error);
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

    // First switch back to default content to ensure we're starting from the main page
    try {
      await driver.switchTo().defaultContent();
      console.log('Switched to default content');
    } catch (error) {
      console.log('Error switching to default content:', error);
    }

    // First find the payment div container
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

    // Now find the iframe within the payment div using tag name
    console.log('Looking for iframe within payment container...');
    try {
      // Wait for iframe to be present within the payment div
      await driver.wait(async () => {
        const iframes = await paymentDiv.findElements(By.tagName('iframe'));
        return iframes.length > 0;
      }, 5000, 'Timeout waiting for iframe');

      const iframes = await paymentDiv.findElements(By.tagName('iframe'));
      console.log(`Found ${iframes.length} iframes in payment container`);

      if (iframes.length === 0) {
        console.log('No iframes found in payment container');
        return;
      }

      // Switch to the first iframe found
      await driver.switchTo().frame(iframes[0]);
      console.log('Successfully switched to payment iframe');

      // Define payment info type
      interface PaymentInfo {
        cardName: string;
        cardNumber: string;
        expiryDate: string;
        cvv: string;
        country: string;
      }

      // Payment information
      const paymentInfo: PaymentInfo = {
        cardName: 'John Doe',
        cardNumber: '4111111111111111',
        expiryDate: '1225',
        cvv: '123',
        country: 'United States'
      };

      // Now try to fill the form fields
      const fieldSelectors = {
        cardName: [
          '[name="cardholderName"]',
          '[placeholder*="name"]',
          '[aria-label*="name"]',
          '#cardholderName',
          'input[name*="name"]'
        ],
        cardNumber: [
          '[name="cardNumber"]',
          '[placeholder*="card number"]',
          '[aria-label*="card number"]',
          '#cardNumber',
          'input[name*="card"]'
        ],
        expiryDate: [
          '[name="expiryDate"]',
          '[placeholder*="expiry"]',
          '[aria-label*="expiration"]',
          '#expiryDate',
          'input[name*="expiry"]'
        ],
        cvv: [
          '[name="securityCode"]',
          '[placeholder*="CVV"]',
          '[aria-label*="security code"]',
          '#cvv',
          'input[name*="cvv"]'
        ]
      };

      // Fill each field
      for (const [field, selectors] of Object.entries(fieldSelectors)) {
        let fieldFilled = false;
        for (const selector of selectors) {
          try {
            console.log(`Trying to find ${field} with selector: ${selector}`);
            const element = await driver.wait(until.elementLocated(By.css(selector)), 2000);
            await driver.wait(until.elementIsVisible(element), 2000);
            await element.clear();
            await element.sendKeys((paymentInfo as any)[field]);
            console.log(`Successfully filled ${field}`);
            fieldFilled = true;
            break;
          } catch (error) {
            continue;
          }
        }
        if (!fieldFilled) {
          console.log(`Could not fill ${field} field`);
        }
      }

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
      console.error('Error handling payment iframe:', error);
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