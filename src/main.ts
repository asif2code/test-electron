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

      // Function to check if a field needs updating
      async function checkFieldValue(element: any, expectedValue: string): Promise<boolean> {
        try {
          const currentValue = await element.getAttribute('value');
          // Handle expiry date format (1225 vs 12/25)
          if (expectedValue.length === 4 && currentValue.includes('/')) {
            const [month, year] = currentValue.split('/');
            const formattedCurrent = `${month.trim()}${year.trim()}`;
            return formattedCurrent === expectedValue;
          }
          return currentValue === expectedValue || 
                 (currentValue.replace(/\s/g, '') === expectedValue.replace(/\s/g, ''));
        } catch (error) {
          return false;
        }
      }

      // Fill card name first
      console.log('Checking and filling card name...');
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
          
          // Check if field already has correct value
          if (await checkFieldValue(element, paymentInfo.cardName)) {
            console.log('Card name already correct');
            cardNameFilled = true;
            break;
          }

          await element.clear();
          await element.sendKeys(paymentInfo.cardName);
          console.log('Successfully filled card name');
          cardNameFilled = true;
          break;
        } catch (error) {
          continue;
        }
      }

      if (!cardNameFilled) {
        console.log('Could not fill card name');
        return; // Stop if we can't fill the name
      }

      // Function to fill a hosted field
      async function fillHostedField(fieldType: string, value: string): Promise<boolean> {
        try {
          // Switch back to main iframe first
          await driver.switchTo().defaultContent();
          await driver.switchTo().frame(mainIframe);
          
          // Find the specific hosted field iframe
          const iframeSelector = `iframe[name="braintree-hosted-field-${fieldType}"]`;
          const iframeExists = await driver.findElements(By.css(iframeSelector));
          
          // If iframe doesn't exist, the field might already be filled and hidden
          if (iframeExists.length === 0) {
            console.log(`${fieldType} iframe not found, field might be already filled`);
            return true;
          }

          const hostedFieldIframe = await driver.findElement(By.css(iframeSelector));
          
          // Switch to the hosted field iframe
          await driver.switchTo().frame(hostedFieldIframe);
          console.log(`Switched to ${fieldType} iframe`);

          // Find the input
          const input = await driver.wait(
            until.elementLocated(By.css('input[type="tel"], input[type="text"], input[type="number"]')),
            5000
          );

          // Get current value
          const currentValue = await input.getAttribute('value');
          console.log(`Current value for ${fieldType}: ${currentValue}`);

          // Special handling for expiry date
          if (fieldType === 'expirationDate' && currentValue.includes('/')) {
            const [month, year] = currentValue.split('/');
            const formattedCurrent = `${month.trim()}${year.trim()}`;
            if (formattedCurrent === value) {
              console.log(`${fieldType} already has correct value: ${currentValue}`);
              return true;
            }
          }

          // Check if field already has correct value
          if (await checkFieldValue(input, value)) {
            console.log(`${fieldType} already has correct value`);
            return true;
          }

          await input.clear();
          
          // Type value with delay
          if (fieldType === 'expirationDate') {
            // Format expiry date as MM/YY
            const month = value.substring(0, 2);
            const year = value.substring(2);
            await input.sendKeys(month);
            await new Promise(resolve => setTimeout(resolve, 50));
            await input.sendKeys(year);
          } else {
            for (const char of value) {
              await input.sendKeys(char);
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }

          // Verify the value was entered correctly
          const enteredValue = await input.getAttribute('value');
          let isCorrect = false;

          if (fieldType === 'expirationDate') {
            // Compare expiry date in both formats (1225 vs 12/25)
            const [month, year] = enteredValue.split('/');
            const formattedEntered = `${month.trim()}${year.trim()}`;
            isCorrect = formattedEntered === value;
          } else {
            isCorrect = enteredValue === value || 
                       (fieldType === 'number' && enteredValue.replace(/\s/g, '') === value);
          }
          
          if (isCorrect) {
            console.log(`Successfully filled ${fieldType}`);
            return true;
          } else {
            console.log(`Value verification failed for ${fieldType}. Expected: ${value}, Got: ${enteredValue}`);
            return false;
          }
        } catch (error: unknown) {
          console.error(`Error filling ${fieldType}:`, error);
          // If iframe is not found, field might be already filled
          if (error instanceof Error && (error.message?.includes('no such frame') || error.message?.includes('TimeoutError'))) {
            console.log(`${fieldType} field might be already filled correctly`);
            return true;
          }
          return false;
        } finally {
          // Try to switch back to main iframe
          try {
            await driver.switchTo().defaultContent();
            await driver.switchTo().frame(mainIframe);
          } catch (error: unknown) {
            console.log('Error switching back to main iframe:', error);
          }
        }
      }

      // Check if card number is already filled before attempting to fill
      const cardNumberIframe = await driver.findElements(By.css('iframe[name="braintree-hosted-field-number"]'));
      const cardNumberFilled = cardNumberIframe.length === 0 || await fillHostedField('number', paymentInfo.cardNumber);
      if (!cardNumberFilled) {
        console.log('Failed to fill card number');
        return;
      }

      // Check if expiry date is already filled before attempting to fill
      const expiryIframe = await driver.findElements(By.css('iframe[name="braintree-hosted-field-expirationDate"]'));
      const expiryFilled = expiryIframe.length === 0 || await fillHostedField('expirationDate', paymentInfo.expiryDate);
      if (!expiryFilled) {
        console.log('Failed to fill expiry date');
        return;
      }

      // Check if CVV is already filled before attempting to fill
      // const cvvIframe = await driver.findElements(By.css('iframe[name="braintree-hosted-field-cvv"]'));
      // const cvvFilled = cvvIframe.length === 0 || await fillHostedField('cvv', paymentInfo.cvv);
      // if (!cvvFilled) {
      //   console.log('Failed to fill CVV');
      //   return;
      // }

      // Continue with country selection only if we need to
      const countryDropdown = await driver.findElements(By.css('#country-dropdown'));
      if (countryDropdown.length === 0) {
        console.log('Country already selected, skipping address fields');
        return;
      }

      // Switch back to main iframe for country selection and address fields
      await driver.switchTo().defaultContent();
      await driver.switchTo().frame(mainIframe);

      // Define address info
      interface AddressInfo {
        addressLine1: string;
        addressLine2?: string;
        city: string;
        postalCode: string;
        phoneNumber: string;
      }

      const addressInfo: AddressInfo = {
        addressLine1: '123 Main St',
        addressLine2: 'Apt 4B',
        city: 'New York',
        postalCode: '10001',
        phoneNumber: '2125551234'
      };

      // Check if country is already selected
      console.log('Checking country selection...');
      try {
        // First check if the country text is already visible in the dropdown
        const countryDropdownText = await driver.findElements(By.css('#country-dropdown .dropdown__selected-text'));
        let countryAlreadySelected = false;
        
        if (countryDropdownText.length > 0) {
          const selectedText = await countryDropdownText[0].getText();
          if (selectedText === paymentInfo.country) {
            console.log('Country already correctly selected:', selectedText);
            countryAlreadySelected = true;
          }
        }

        if (!countryAlreadySelected) {
          // Find and click the country dropdown trigger
          const countryDropdownTrigger = await driver.wait(
            until.elementLocated(By.css('#country-dropdown')),
            5000
          );
          
          // Double check the selected text before clicking
          try {
            const selectedText = await countryDropdownTrigger.getText();
            if (selectedText === paymentInfo.country) {
              console.log('Country already correctly selected (second check):', selectedText);
              countryAlreadySelected = true;
            }
          } catch (error) {
            console.log('Could not get dropdown text, proceeding with selection');
          }

          if (!countryAlreadySelected) {
            await countryDropdownTrigger.click();
            console.log('Clicked country dropdown');
            
            // Wait for dropdown items to be visible
            await driver.wait(
              until.elementLocated(By.css('.dropdown__items')),
              5000
            );
            
            // Find the specific country option by exact text match
            const countryXPath = `//span[@role='option' and @aria-label='${paymentInfo.country}']`;
            const countryOption = await driver.wait(
              until.elementLocated(By.xpath(countryXPath)),
              5000
            );
            
            // Scroll the option into view and click it
            await driver.executeScript("arguments[0].scrollIntoView(true);", countryOption);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for scroll
            await countryOption.click();
            console.log('Successfully selected country:', paymentInfo.country);

            // Wait for dropdown to close and selection to take effect
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        // Wait for address fields to be visible
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if address fields need to be filled
        const addressSelectors = [
          'input[id="address"]',
          'input[name="address"]',
          'input[autocomplete="address-line1"]',
          'input[aria-describedby="address_error"]',
          'input[aria-invalid="false"][aria-required="true"]'
        ];

        let addressLine1Input = null;
        for (const selector of addressSelectors) {
          try {
            addressLine1Input = await driver.wait(
              until.elementLocated(By.css(selector)),
              5000
            );
            console.log(`Found address input with selector: ${selector}`);
            break;
          } catch (error) {
            console.log(`Address input not found with selector: ${selector}`);
            continue;
          }
        }

        if (!addressLine1Input) {
          console.log('Could not find address input field');
          return;
        }

        const currentAddress = await addressLine1Input.getAttribute('value');
        if (currentAddress === addressInfo.addressLine1) {
          console.log('Address fields already filled correctly');
          return;
        }

        // Fill address fields
        console.log('Filling address fields...');
        await addressLine1Input.clear();
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait after clearing
        await addressLine1Input.sendKeys(addressInfo.addressLine1);
        console.log('Filled address line 1');

        // Fill address line 2 if provided
        try {
          const addressLine2Input = await driver.findElement(By.css('input[aria-label="Address Line 2 (Optional)"]'));
          if (addressInfo.addressLine2) {
            await addressLine2Input.clear();
            await addressLine2Input.sendKeys(addressInfo.addressLine2);
            console.log('Filled address line 2');
          }
        } catch (error) {
          console.log('Address line 2 field not found or not needed');
        }

        // Fill city
        const cityInput = await driver.wait(
          until.elementLocated(By.css('input[aria-label="City"]')),
          5000
        );
        await cityInput.clear();
        await cityInput.sendKeys(addressInfo.city);
        console.log('Filled city');

        // Fill postal code
        const postalCodeInput = await driver.wait(
          until.elementLocated(By.css('input[aria-label="Postal Code"]')),
          5000
        );
        await postalCodeInput.clear();
        await postalCodeInput.sendKeys(addressInfo.postalCode);
        console.log('Filled postal code');

        // Fill phone number
        const phoneInput = await driver.wait(
          until.elementLocated(By.css('input[aria-label="Phone Number"]')),
          5000
        );
        await phoneInput.clear();
        await phoneInput.sendKeys(addressInfo.phoneNumber);
        console.log('Filled phone number');

        // Verify all fields are filled
        const verifyFields = async () => {
          const addressLine1Value = await addressLine1Input.getAttribute('value');
          const cityValue = await cityInput.getAttribute('value');
          const postalCodeValue = await postalCodeInput.getAttribute('value');
          const phoneValue = await phoneInput.getAttribute('value');

          return addressLine1Value && cityValue && postalCodeValue && phoneValue;
        };

        if (await verifyFields()) {
          console.log('Successfully filled all address fields');
        } else {
          console.log('Some address fields may not be filled correctly');
        }

      } catch (error) {
        console.error('Error handling country and address information:', error);
      }

      // Try to find and click submit button
      const buttonSelectors = [
        'button[type="submit"]',
        'button:contains("Save")',
        'button:contains("Add Card")',
        'button.submit-button',
        'input[type="submit"]',
        'button[class*="save"]'
      ];

      let buttonClicked = false;
      for (const selector of buttonSelectors) {
        try {
          const button = await driver.wait(until.elementLocated(By.css(selector)), 2000);
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
        } catch (error: unknown) {
          console.log(`Error checking iframe ${i + 1}:`, error instanceof Error ? error.message : error);
          await driver.switchTo().defaultContent();
        }
      }
    }
  } catch (error: unknown) {
    console.error('Error checking wallet page:', error instanceof Error ? error.message : error);
    try {
      await driver.switchTo().defaultContent();
    } catch (frameError: unknown) {
      console.error('Error switching to default content:', frameError instanceof Error ? frameError.message : frameError);
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