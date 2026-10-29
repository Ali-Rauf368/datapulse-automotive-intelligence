import { expect, type Page } from '@playwright/test'

export const PASSWORD = 'E2e-Password-2026!'
export const ADMIN = { email: 'e2e.admin@example.test', name: 'Avery Admin' }
export const OPERATOR = { email: 'e2e.operator@example.test', name: 'Olivia Operator' }

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText(/Updated at/)).toBeVisible()
}

export const kpi = (page: Page, label: string) =>
  page.getByRole('region', { name: 'Key performance indicators' })
    .locator('article', { hasText: label })
    .locator('p.text-2xl')
