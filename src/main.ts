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
    console.log('Page HTML:', html);

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
        
        console.log('Element found:', {
          tagName,
          type,
          name,
          id,
          className,
          ariaLabel
        });
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
    if (!driver) return;

    // Payment information (replace with actual test data)
    const paymentInfo = {
      cardName: 'John Doe',
      cardNumber: '4111111111111111',
      expiryDate: '1225',
      country: 'United States'
    };

    console.log('Starting to fill payment form...');

    // First analyze the form structure
    const formStructure = await analyzeFormStructure();
    if (!formStructure) {
      console.log('Could not analyze form structure');
      return;
    }

    // Define the fields and their corresponding labels
    const fields = [
      { label: 'Name on Card', value: paymentInfo.cardName },
      { label: 'Card Number', value: paymentInfo.cardNumber },
      { label: 'Expiration Date', value: paymentInfo.expiryDate }
    ];

    // Try to fill each field
    for (const field of fields) {
      try {
        const element = await findElementByLabel(field.label);
        console.log('Found element:', element);
        if (element) {
          await driver.executeScript("arguments[0].scrollIntoView(true);", element);
          await driver.wait(until.elementIsVisible(element), 5000);
          await element.clear();
          await element.sendKeys(field.value);
          console.log(`Successfully filled ${field.label}`);
        }
      } catch (error) {
        console.log(`Failed to fill ${field.label}:`, error);
      }
    }

    // Try to find and click save/submit button
    const buttonTexts = ['Save', 'Submit', 'Continue', 'Add Card'];
    for (const text of buttonTexts) {
      try {
        const buttonElement = await driver.findElement(
          By.xpath(`//button[contains(text(), "${text}") or .//span[contains(text(), "${text}")]]`)
        );
        if (buttonElement && await buttonElement.isDisplayed()) {
          await driver.executeScript("arguments[0].scrollIntoView(true);", buttonElement);
          await buttonElement.click();
          console.log(`Successfully clicked ${text} button`);
          break;
        }
      } catch (error) {
        console.log(`Could not find or click ${text} button`);
      }
    }

    console.log('Form filling attempt completed');
  } catch (error) {
    console.error('Error filling payment form:', error);
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

      // Check iframes if form not found in main document
      const iframes = await driver.findElements(By.css('iframe'));
      console.log(`Found ${iframes.length} iframes to check`);
      
      for (let i = 0; i < iframes.length; i++) {
        try {
          await driver.switchTo().frame(iframes[i]);
          console.log(`Analyzing iframe ${i + 1}`);
          
          const iframeStructure = await analyzeFormStructure();
          if (iframeStructure && iframeStructure.includes('input')) {
            console.log(`Found form elements in iframe ${i + 1}`);
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
      isSeleniumReady = await initializeSelenium();
    }
    
    if (isSeleniumReady && driver) {
      console.log('Navigating to Ticketmaster...');
      await driver.get('https://www.ticketmaster.com');
      console.log('Successfully navigated to Ticketmaster');
    } else {
      console.error('Selenium is not ready');
    }
  } catch (error) {
    console.error('Error navigating to Ticketmaster:', error);
    // Try to reinitialize on error
    isSeleniumReady = await initializeSelenium();
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