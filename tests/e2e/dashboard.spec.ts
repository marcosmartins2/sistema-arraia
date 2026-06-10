import { test, expect, type Page } from "@playwright/test";
import {
  createSandbox,
  teardownSandbox,
  getProductStock,
  listSalesFor,
  listProductsFor,
  type SandboxContext,
} from "./helpers/sandbox";

let ctx: SandboxContext;

test.beforeAll(async () => {
  ctx = await createSandbox();
  console.log(
    `[sandbox ready] org=${ctx.organizationName} slug=${ctx.organizationSlug} code=${ctx.accessCode}`,
  );
});

test.afterAll(async () => {
  if (ctx) {
    await teardownSandbox(ctx);
    console.log(`[sandbox cleaned] org=${ctx.organizationName}`);
  }
});

const polite = (page: Page) => page.locator('[role="alert"][aria-live="polite"]');
const sectionTabs = (page: Page) => page.getByLabel("Áreas do sistema");
const cartPanel = (page: Page) => page.locator("aside").filter({ hasText: "Venda atual" });

async function loginWithAccessCode(page: Page, code: string) {
  await page.goto("/");
  await expect(page.getByPlaceholder("Código do evento")).toBeVisible();
  await page.getByPlaceholder("Código do evento").fill(code);
  await page.getByRole("button", { name: /Entrar com código/i }).click();
  await expect(cartPanel(page)).toBeVisible({ timeout: 15_000 });
}

test.describe("Auth", () => {
  test("rejects empty access code", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Entrar com código/i }).click();
    await expect(polite(page)).toContainText(/Digite o código/i);
  });

  test("rejects malformed access code", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Código do evento").fill("ABC");
    await page.getByRole("button", { name: /Entrar com código/i }).click();
    await expect(polite(page)).toContainText(/inválido/i);
  });

  test("rejects unknown but well-formed access code", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Código do evento").fill("ZZZZZZZZ");
    await page.getByRole("button", { name: /Entrar com código/i }).click();
    await expect(polite(page)).toBeVisible({ timeout: 15_000 });
    await expect(polite(page)).toContainText(/não encontrei|não consegui validar/i);
  });

  test("accepts valid sandbox access code and loads dashboard", async ({ page }) => {
    await loginWithAccessCode(page, ctx.accessCode);
    await expect(page.getByText("E2E Refrigerante")).toBeVisible();
    await expect(page.getByText("E2E Salgado")).toBeVisible();
  });

  test("rejects invalid admin login", async ({ page }) => {
    await page.goto("/");
    await sectionTabs(page).getByRole("button", { name: /^Admin$/ }).click().catch(async () => {
      await page.getByRole("button", { name: /^Admin$/ }).first().click();
    });
    await page.getByPlaceholder("Email admin").fill("invalid@example.com");
    await page.getByPlaceholder("Senha").fill("wrongpassword");
    await page.getByRole("button", { name: /Entrar como admin/i }).click();
    await expect(polite(page)).toContainText(/inválido|incorret/i);
  });
});

test.describe("Sale persistence", () => {
  test("registers a sale, decrements stock, persists in DB", async ({ page }) => {
    await loginWithAccessCode(page, ctx.accessCode);

    const initialStock = await getProductStock(ctx.productIds[0]);
    expect(initialStock).toBe(50);

    await page
      .getByRole("button", { name: /E2E Refrigerante/ })
      .first()
      .click();
    await page.getByRole("button", { name: /Aumentar quantidade/ }).click();
    await page.getByRole("button", { name: /Aumentar quantidade/ }).click();

    await expect(cartPanel(page).getByText("E2E Refrigerante")).toBeVisible();

    const salesBefore = await listSalesFor(ctx.organizationId);
    await page.getByRole("button", { name: /Finalizar venda/i }).click();

    await expect
      .poll(async () => (await listSalesFor(ctx.organizationId)).length, { timeout: 15_000 })
      .toBeGreaterThan(salesBefore.length);

    const sales = await listSalesFor(ctx.organizationId);
    const latest = sales[0];
    expect(Number(latest.gross_total)).toBe(15);
    expect(Number(latest.profit_total)).toBe(9);
    expect(latest.cashier_name).toBe(ctx.cashierName);

    await expect
      .poll(async () => getProductStock(ctx.productIds[0]), { timeout: 15_000 })
      .toBe(47);
  });

  test("deletes a sale and restores stock", async ({ page }) => {
    const deleteResponses: Array<{ status: number; body: string }> = [];
    page.on("response", async (response) => {
      if (response.url().includes("delete-sale")) {
        let body = "";
        try {
          body = await response.text();
        } catch {}
        deleteResponses.push({ status: response.status(), body });
      }
    });

    await loginWithAccessCode(page, ctx.accessCode);

    const stockBefore = await getProductStock(ctx.productIds[1]);
    expect(stockBefore).toBe(30);

    test.info().annotations.push({
      type: "issue",
      description:
        "Requires the 'delete-sale' edge function to be redeployed with --no-verify-jwt " +
        "(supabase/config.toml now declares verify_jwt = false). Until redeployed, the " +
        "Supabase gateway rejects access-code-based delete requests with 401 " +
        "UNAUTHORIZED_NO_AUTH_HEADER.",
    });

    await page
      .getByRole("button", { name: /E2E Salgado/ })
      .first()
      .click();
    await page.getByRole("button", { name: /Finalizar venda/i }).click();

    await expect
      .poll(async () => getProductStock(ctx.productIds[1]), { timeout: 15_000 })
      .toBe(29);

    await sectionTabs(page).getByRole("button", { name: /^Vendas$/ }).click();

    await expect(page.getByRole("button", { name: "Excluir venda" }).first()).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Excluir venda" }).first().click();

    await expect(page.getByRole("heading", { name: "Excluir venda" })).toBeVisible();
    await page.getByRole("button", { name: "Excluir", exact: true }).click();

    const finalConfirm = page.getByRole("button", { name: /Sim, excluir definitivamente/ });
    await expect(finalConfirm).toBeEnabled();
    await finalConfirm.click();

    await expect(page.getByRole("heading", { name: "Excluir venda" })).not.toBeVisible({
      timeout: 15_000,
    });

    const errorNotice = page.locator('[role="alert"][aria-live="polite"]');
    const errorCount = await errorNotice.count();
    if (errorCount > 0) {
      const text = await errorNotice.first().textContent();
      if (text && /não foi possível|não consegui|erro|falha/i.test(text)) {
        throw new Error(`Delete sale showed error notice: "${text.trim()}"`);
      }
    }

    await page.waitForTimeout(2000);
    if (deleteResponses.some((r) => r.status === 401)) {
      throw new Error(
        `delete-sale gateway returned 401: ${JSON.stringify(deleteResponses)}. ` +
          `Redeploy: npx supabase functions deploy delete-sale --no-verify-jwt`,
      );
    }

    await expect
      .poll(async () => getProductStock(ctx.productIds[1]), { timeout: 20_000 })
      .toBe(30);

    await expect
      .poll(async () => (await listSalesFor(ctx.organizationId)).length, { timeout: 10_000 })
      .toBe(0);
  });
});

test.describe("Product persistence", () => {
  test("creates a new product via edge function", async ({ page }) => {
    await loginWithAccessCode(page, ctx.accessCode);

    await sectionTabs(page).getByRole("button", { name: /^Produtos$/ }).click();

    const uniqueName = `E2E Brigadeiro ${Date.now()}`;
    await page.getByPlaceholder("Produto").first().fill(uniqueName);
    await page.getByPlaceholder("Categoria").first().fill("Doce");
    await page.getByPlaceholder("Responsável").first().fill("E2E Responsavel");
    await page.getByPlaceholder("Valor de venda").first().fill("3,50");
    await page.getByPlaceholder("Custo").first().fill("1,00");
    await page.getByPlaceholder("Estoque").first().fill("40");

    await page.getByRole("button", { name: /^Cadastrar produto$/ }).click();

    await expect
      .poll(
        async () => {
          const products = await listProductsFor(ctx.organizationId);
          return products.find((p) => p.name === uniqueName);
        },
        { timeout: 15_000 },
      )
      .toBeTruthy();

    const products = await listProductsFor(ctx.organizationId);
    const created = products.find((p) => p.name === uniqueName);
    expect(Number(created?.sale_price)).toBe(3.5);
    expect(Number(created?.unit_cost)).toBe(1);
    expect(Number(created?.stock_quantity)).toBe(40);
    expect(created?.is_active).toBe(true);
  });
});

test.describe("Session restore", () => {
  test("persists login through reload via localStorage", async ({ page }) => {
    await loginWithAccessCode(page, ctx.accessCode);
    await expect(page.getByText("E2E Refrigerante")).toBeVisible();

    const storedCode = await page.evaluate(() => window.localStorage.getItem("vendas:accessCode"));
    expect(storedCode).toBe(ctx.accessCode);

    await page.reload();
    await expect(cartPanel(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("E2E Refrigerante")).toBeVisible();
    await expect(page.getByPlaceholder("Código do evento")).not.toBeVisible();
  });
});
