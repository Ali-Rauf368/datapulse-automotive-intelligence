import { expect, test, type Page } from '@playwright/test'
import { ADMIN, OPERATOR, kpi, signIn } from './fixtures.ts'

let counter = 0
// 17 valid VIN characters, unique per run and per call.
const newVin = () => `E2E${String(Date.now() % 1e11).padStart(11, '0')}${String(counter++).padStart(3, '0')}`

async function addVehicle(page: Page, make: string, model: string) {
  const vin = newVin()
  await page.getByRole('button', { name: 'Add vehicle' }).click()
  await page.getByLabel('VIN').fill(vin)
  await page.getByLabel('Make').fill(make)
  await page.getByLabel('Model', { exact: true }).fill(model)
  await page.getByRole('button', { name: 'Save vehicle' }).click()
  await expect(page.getByText(`${make} ${model} added to inventory as Active.`)).toBeVisible()
  return vin
}

test.describe('Accounts', () => {
  test('sign-up creates a read-only viewer, and sign-out returns to sign-in', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Create an account' }).click()
    await page.getByLabel('Name').fill('Jordan Viewer')
    await page.getByLabel('Email').fill(`viewer.${Date.now()}@example.test`)
    await page.getByLabel('Password', { exact: true }).fill('secret1')
    await page.getByRole('button', { name: 'Create account' }).click()

    const sidebar = page.getByRole('complementary')
    await expect(sidebar).toContainText('Jordan Viewer')
    await expect(sidebar).toContainText('Viewer role')
    await expect(page.getByRole('button', { name: 'Add vehicle' })).toHaveCount(0)
    await expect(page.getByText('Your account has read-only access')).toBeVisible()

    await sidebar.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('a wrong password is rejected with a clear message', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Email').fill(ADMIN.email)
    await page.getByLabel('Password', { exact: true }).fill('not-the-password')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
  })
})

test.describe('Dealership workflows', () => {
  test('adding and selling a vehicle updates inventory, KPIs and revenue', async ({ page }) => {
    await signIn(page, ADMIN.email)
    const vin = await addVehicle(page, 'Polestar', '2 Long Range')

    const soldBefore = Number(await kpi(page, 'Sold vehicles').textContent())
    await page.locator('#sale-vehicle').selectOption({ label: `Polestar 2 Long Range · ${vin}` })
    await page.getByLabel('Sale price (€)').fill('45990')
    await page.getByRole('button', { name: 'Record sale' }).click()

    await expect(page.getByText('Sale recorded: Polestar 2 Long Range for €45,990.00')).toBeVisible()
    await expect(kpi(page, 'Sold vehicles')).toHaveText(String(soldBefore + 1))
    await expect(page.locator('#sales-service')).toContainText('€45,990.00')
    // A sold vehicle is never offered for sale again.
    await expect(page.locator('#sale-vehicle option', { hasText: vin })).toHaveCount(0)
  })

  test('a service job moves through its lifecycle and the vehicle follows', async ({ page }) => {
    await signIn(page, OPERATOR.email)
    const vin = await addVehicle(page, 'Cupra', 'Born')

    await page.locator('#service-vehicle').selectOption({ label: `Cupra Born · ${vin} (Active)` })
    await page.getByRole('button', { name: 'Brake inspection' }).click()
    await page.getByRole('button', { name: 'Create service job' }).click()
    await expect(page.getByText('Service job opened for Cupra Born')).toBeVisible()

    const job = page.locator('#sales-service li', { hasText: 'Cupra Born' })
    await job.getByRole('combobox').selectOption('in_progress')
    await expect(page.getByText('Cupra Born: service job marked in progress.')).toBeVisible()
    await job.getByRole('combobox').selectOption('completed')
    await expect(page.getByText('Cupra Born: service job marked completed.')).toBeVisible()

    await page.getByLabel('Search vehicles').fill(vin)
    await expect(page.locator('#inventory tbody tr')).toHaveCount(1)
    await expect(page.locator('#inventory tbody tr')).toContainText('Active')
  })

  test('the vehicle history timeline shows the whole story', async ({ page }) => {
    await signIn(page, ADMIN.email)
    await page.getByLabel('Search vehicles').fill('A4 Avant')
    await page.getByRole('button', { name: 'Audi A4 Avant 40 TDI', exact: true }).click()

    const drawer = page.getByRole('dialog', { name: 'Vehicle history' })
    await expect(drawer.locator('ol li')).toHaveCount(4)
    await expect(drawer.locator('ol li').first()).toContainText('Sold for EUR 29990.00')
    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
  })
})

test('live updates: one user sells, another user’s dashboard updates by itself', async ({ browser }) => {
  const adminContext = await browser.newContext()
  const operatorContext = await browser.newContext()
  const admin = await adminContext.newPage()
  const operator = await operatorContext.newPage()

  await signIn(admin, ADMIN.email)
  await expect(admin.getByText('Live updates on')).toBeVisible()
  const soldBefore = Number(await kpi(admin, 'Sold vehicles').textContent())

  await signIn(operator, OPERATOR.email)
  const vin = await addVehicle(operator, 'Lynk & Co', '01')
  await operator.locator('#sale-vehicle').selectOption({ label: `Lynk & Co 01 · ${vin}` })
  await operator.getByLabel('Sale price (€)').fill('29900')
  await operator.getByRole('button', { name: 'Record sale' }).click()

  // The admin did nothing: their dashboard is told and refreshes itself.
  const toast = admin.locator('[aria-live=polite]')
  await expect(toast).toContainText('Sold Lynk & Co 01 for EUR 29900.00')
  await expect(toast).toContainText(OPERATOR.email)
  await expect(kpi(admin, 'Sold vehicles')).toHaveText(String(soldBefore + 1))

  await adminContext.close()
  await operatorContext.close()
})

test.describe('Advanced features', () => {
  test('a CSV of vehicles is imported with a row-by-row report', async ({ page }) => {
    await signIn(page, ADMIN.email)
    const good = newVin()
    const csv = [
      'VIN,Make,Model,Model year',
      `${good},Kia,"EV9, GT-Line",2025`,
      `${good},Kia,EV9,2025`,
      'BAD-VIN,Fiat,500,2021',
    ].join('\r\n')

    await page.getByRole('button', { name: 'Import CSV' }).click()
    await page.getByLabel('Vehicle CSV file').setInputFiles({ name: 'stock.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })

    const report = page.getByRole('status').filter({ hasText: 'imported' })
    await expect(report).toContainText('1 imported')
    await expect(report).toContainText('1 already present')
    await expect(report).toContainText('1 invalid')
    await expect(report).toContainText('VIN must contain 17 valid characters')

    await page.getByLabel('Search vehicles').fill(good)
    await expect(page.locator('#inventory tbody tr').filter({ hasText: 'Kia EV9, GT-Line' })).toHaveCount(1)
  })

  test('insights compare periods and explain the numbers', async ({ page }) => {
    await signIn(page, ADMIN.email)
    const insights = page.locator('#insights')
    await expect(insights.getByText('Highlights')).toBeVisible()
    await expect(insights).toContainText(/ready to sell and \d+ service jobs? (is|are) open right now/)
  })

  test('on a phone the menu folds away behind a button', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, ADMIN.email)
    const menu = page.locator('#sidebar-menu')
    await expect(menu).toBeHidden()
    await page.getByRole('button', { name: 'Open menu' }).click()
    await expect(menu).toBeVisible()
    await menu.getByRole('link', { name: 'Insights' }).click()
    await expect(menu).toBeHidden()
  })
})
