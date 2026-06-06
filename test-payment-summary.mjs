import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  try {
    console.log('Opening app...');
    await page.goto('https://localhost:5173', {
      waitUntil: 'networkidle',
      ignoreHTTPSErrors: true
    });

    await page.waitForTimeout(2000);

    // Seed test data
    console.log('Seeding test data...');
    await page.evaluate(async () => {
      return new Promise((resolve) => {
        const indexedDB = window.indexedDB;
        const openRequest = indexedDB.open('TokensTrackerDB');

        openRequest.onsuccess = function(event) {
          const db = event.target.result;
          const now = new Date().toISOString();

          const instTx = db.transaction('instruments', 'readwrite');
          const instStore = instTx.objectStore('instruments');
          instStore.clear();

          const instReq = instStore.add({
            name: 'Test Bond',
            platform: 'Fainex',
            currency: 'USD',
            couponRate: 11,
            startDate: '2024-01-01',
            endDate: '2026-01-01',
            paymentFrequency: 'monthly',
            paymentDayFrom: 15,
            paymentDayTo: 15,
            status: 'active',
            createdAt: now,
            updatedAt: now
          });

          instReq.onsuccess = function() {
            const instId = instReq.result;

            // Add purchase lot
            const lotTx = db.transaction('purchaseLots', 'readwrite');
            const lotStore = lotTx.objectStore('purchaseLots');
            lotStore.add({
              instrumentId: instId,
              purchaseDate: '2024-02-01',
              quantity: 10,
              pricePerToken: 100,
              totalCost: 1000,
              createdAt: now
            });

            // Add payments: some paid, some scheduled
            const paymentTx = db.transaction('paymentRecords', 'readwrite');
            const paymentStore = paymentTx.objectStore('paymentRecords');
            paymentStore.clear();

            paymentStore.add({
              instrumentId: instId,
              periodIndex: 0,
              type: 'coupon',
              paymentDateFrom: '2024-02-15',
              paymentDateTo: '2024-02-15',
              expectedAmount: 100,
              actualAmount: 100,
              status: 'paid',
              paidAt: '2024-02-15'
            });

            paymentStore.add({
              instrumentId: instId,
              periodIndex: 1,
              type: 'coupon',
              paymentDateFrom: '2024-03-15',
              paymentDateTo: '2024-03-15',
              expectedAmount: 110,
              status: 'scheduled'
            });

            paymentStore.add({
              instrumentId: instId,
              periodIndex: 2,
              type: 'coupon',
              paymentDateFrom: '2024-04-15',
              paymentDateTo: '2024-04-15',
              expectedAmount: 110,
              status: 'scheduled'
            });

            paymentTx.oncomplete = function() {
              resolve();
            };
          };
        };
      });
    });

    console.log('Test data seeded');
    await page.waitForTimeout(1000);

    // Reload to apply data
    console.log('Reloading page...');
    await page.reload({ waitUntil: 'networkidle', ignoreHTTPSErrors: true });
    await page.waitForTimeout(2000);

    // Navigate to instruments
    console.log('Navigating to Instruments...');
    const instrumentsLink = page.locator('a').filter({ has: page.locator('svg') }).nth(1);
    await instrumentsLink.click();
    await page.waitForTimeout(2000);

    // Click on the bond
    console.log('Opening instrument details...');
    const bondLink = page.locator('text=Test Bond').first();
    await bondLink.click();
    await page.waitForTimeout(2000);

    // Take screenshot
    console.log('Taking screenshot...');
    await page.screenshot({ path: 'test-payment-summary.png' });

    // Check if the metrics are visible
    const pageText = await page.content();
    const hasPaid = pageText.includes('Выплачено');
    const hasRemaining = pageText.includes('Осталось выплатить');

    console.log(`✓ "Выплачено" metric: ${hasPaid ? 'FOUND' : 'NOT FOUND'}`);
    console.log(`✓ "Осталось выплатить" metric: ${hasRemaining ? 'FOUND' : 'NOT FOUND'}`);

    if (hasPaid && hasRemaining) {
      console.log('✓ Both payment summary metrics are displayed!');
    }

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await context.close();
    await browser.close();
  }
})();
