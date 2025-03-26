import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { Builder, By, Key, until } from 'selenium-webdriver';
import 'chromedriver';

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
}

async function initializeSelenium() {
  try {
    driver = await new Builder()
      .forBrowser('chrome')
      .build();

    console.log('Chrome WebDriver initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing Chrome:', error);
    return false;
  }
}

let isSeleniumReady = false;

// Function to check if we're on a wallet page with an iframe
async function checkAndFillWalletIframe() {
  try {
    if (!driver) return;

    const currentUrl = await driver.getCurrentUrl();
    if (currentUrl.includes('wallet')) {
      console.log('Detected wallet page, checking for iframe...');
      
      try {
        // Check if iframe exists
        const iframes = await driver.findElements(By.css('iframe'));
        if (iframes.length > 0) {
          console.log('Found iframe, attempting to fill payment information...');
          await fillPaymentForm();
        }
      } catch (error) {
        console.log('No payment iframe found');
      }
    }
  } catch (error) {
    console.error('Error checking wallet page:', error);
  }
}

// Function to fill payment form
async function fillPaymentForm() {
  try {
    if (!driver) return;

    // Wait for iframe to be present
    const iframe = await driver.wait(until.elementLocated(By.css('iframe')), 10000);
    await driver.switchTo().frame(iframe);

    // Payment information (replace with actual test data)
    const paymentInfo = {
      cardName: 'John Doe',
      cardNumber: '4111111111111111',
      expiryDate: '1225',
      phoneNumber: '1234567890',
      address1: '123 Test Street',
      address2: 'Apt 4B',
      city: 'Test City',
      postalCode: '12345'
    };

    // Wait and fill card name
    const nameField = await driver.wait(until.elementLocated(By.css('input[placeholder*="Name on Card"]')), 5000);
    await nameField.sendKeys(paymentInfo.cardName);

    // Wait and fill card number
    const cardNumberField = await driver.wait(until.elementLocated(By.css('input[placeholder*="Card Number"]')), 5000);
    await cardNumberField.sendKeys(paymentInfo.cardNumber);

    // Wait and fill expiry date
    const expiryField = await driver.wait(until.elementLocated(By.css('input[placeholder*="MM/YY"]')), 5000);
    await expiryField.sendKeys(paymentInfo.expiryDate);

    // Fill address fields
    const addressFields = {
      'Address Line 1': paymentInfo.address1,
      'Address Line 2': paymentInfo.address2,
      'City': paymentInfo.city,
      'Postal Code': paymentInfo.postalCode,
      'Phone Number': paymentInfo.phoneNumber
    };

    for (const [placeholder, value] of Object.entries(addressFields)) {
      try {
        const field = await driver.wait(until.elementLocated(By.css(`input[placeholder*="${placeholder}"]`)), 5000);
        await field.sendKeys(value);
      } catch (error) {
        console.log(`Could not find or fill field: ${placeholder}`);
      }
    }

    console.log('Successfully filled payment information');
    await driver.switchTo().defaultContent();
  } catch (error) {
    console.error('Error filling payment form:', error);
    await driver.switchTo().defaultContent();
  }
}

app.whenReady().then(async () => {
  await createWindow();
  isSeleniumReady = await initializeSelenium();

  if (driver) {
    try {
      // Set up URL change listener
      await driver.executeScript(`
        let lastUrl = window.location.href;
        new MutationObserver(() => {
          const url = window.location.href;
          if (url !== lastUrl) {
            lastUrl = url;
            window.dispatchEvent(new CustomEvent('urlChanged', { detail: url }));
          }
        }).observe(document, { subtree: true, childList: true });
      `);
    } catch (error) {
      console.error('Error setting up URL listener:', error);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

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

ipcMain.on('goto-ticketmaster', async () => {
  try {
    if (!isSeleniumReady || !driver) {
      console.log('Reinitializing Selenium...');
      isSeleniumReady = await initializeSelenium();
    }
    
    if (isSeleniumReady && driver) {
      await driver.get('https://www.ticketmaster.com');
      console.log('Successfully navigated to Ticketmaster');
    } else {
      console.error('Selenium is not ready');
    }
  } catch (error) {
    console.error('Error navigating to Ticketmaster:', error);
    isSeleniumReady = await initializeSelenium();
  }
});

// Listen for manual URL changes to wallet page
setInterval(async () => {
  if (isSeleniumReady && driver) {
    await checkAndFillWalletIframe();
  }
}, 2000); // Check every 2 seconds 