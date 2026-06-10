# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard.spec.ts >> Sale persistence >> deletes a sale and restores stock
- Location: tests\e2e\dashboard.spec.ts:113:7

# Error details

```
Error: delete-sale gateway returned 401: [{"status":401,"body":"{\"code\":\"UNAUTHORIZED_NO_AUTH_HEADER\",\"message\":\"Missing authorization header\"}"}]. Redeploy: npx supabase functions deploy delete-sale --no-verify-jwt
```

# Test source

```ts
  78  | 
  79  | test.describe("Sale persistence", () => {
  80  |   test("registers a sale, decrements stock, persists in DB", async ({ page }) => {
  81  |     await loginWithAccessCode(page, ctx.accessCode);
  82  | 
  83  |     const initialStock = await getProductStock(ctx.productIds[0]);
  84  |     expect(initialStock).toBe(50);
  85  | 
  86  |     await page
  87  |       .getByRole("button", { name: /E2E Refrigerante/ })
  88  |       .first()
  89  |       .click();
  90  |     await page.getByRole("button", { name: /Aumentar quantidade/ }).click();
  91  |     await page.getByRole("button", { name: /Aumentar quantidade/ }).click();
  92  | 
  93  |     await expect(cartPanel(page).getByText("E2E Refrigerante")).toBeVisible();
  94  | 
  95  |     const salesBefore = await listSalesFor(ctx.organizationId);
  96  |     await page.getByRole("button", { name: /Finalizar venda/i }).click();
  97  | 
  98  |     await expect
  99  |       .poll(async () => (await listSalesFor(ctx.organizationId)).length, { timeout: 15_000 })
  100 |       .toBeGreaterThan(salesBefore.length);
  101 | 
  102 |     const sales = await listSalesFor(ctx.organizationId);
  103 |     const latest = sales[0];
  104 |     expect(Number(latest.gross_total)).toBe(15);
  105 |     expect(Number(latest.profit_total)).toBe(9);
  106 |     expect(latest.cashier_name).toBe(ctx.cashierName);
  107 | 
  108 |     await expect
  109 |       .poll(async () => getProductStock(ctx.productIds[0]), { timeout: 15_000 })
  110 |       .toBe(47);
  111 |   });
  112 | 
  113 |   test("deletes a sale and restores stock", async ({ page }) => {
  114 |     const deleteResponses: Array<{ status: number; body: string }> = [];
  115 |     page.on("response", async (response) => {
  116 |       if (response.url().includes("delete-sale")) {
  117 |         let body = "";
  118 |         try {
  119 |           body = await response.text();
  120 |         } catch {}
  121 |         deleteResponses.push({ status: response.status(), body });
  122 |       }
  123 |     });
  124 | 
  125 |     await loginWithAccessCode(page, ctx.accessCode);
  126 | 
  127 |     const stockBefore = await getProductStock(ctx.productIds[1]);
  128 |     expect(stockBefore).toBe(30);
  129 | 
  130 |     test.info().annotations.push({
  131 |       type: "issue",
  132 |       description:
  133 |         "Requires the 'delete-sale' edge function to be redeployed with --no-verify-jwt " +
  134 |         "(supabase/config.toml now declares verify_jwt = false). Until redeployed, the " +
  135 |         "Supabase gateway rejects access-code-based delete requests with 401 " +
  136 |         "UNAUTHORIZED_NO_AUTH_HEADER.",
  137 |     });
  138 | 
  139 |     await page
  140 |       .getByRole("button", { name: /E2E Salgado/ })
  141 |       .first()
  142 |       .click();
  143 |     await page.getByRole("button", { name: /Finalizar venda/i }).click();
  144 | 
  145 |     await expect
  146 |       .poll(async () => getProductStock(ctx.productIds[1]), { timeout: 15_000 })
  147 |       .toBe(29);
  148 | 
  149 |     await sectionTabs(page).getByRole("button", { name: /^Vendas$/ }).click();
  150 | 
  151 |     await expect(page.getByRole("button", { name: "Excluir venda" }).first()).toBeVisible({
  152 |       timeout: 10_000,
  153 |     });
  154 |     await page.getByRole("button", { name: "Excluir venda" }).first().click();
  155 | 
  156 |     await expect(page.getByRole("heading", { name: "Excluir venda" })).toBeVisible();
  157 |     await page.getByRole("button", { name: "Excluir", exact: true }).click();
  158 | 
  159 |     const finalConfirm = page.getByRole("button", { name: /Sim, excluir definitivamente/ });
  160 |     await expect(finalConfirm).toBeEnabled();
  161 |     await finalConfirm.click();
  162 | 
  163 |     await expect(page.getByRole("heading", { name: "Excluir venda" })).not.toBeVisible({
  164 |       timeout: 15_000,
  165 |     });
  166 | 
  167 |     const errorNotice = page.locator('[role="alert"][aria-live="polite"]');
  168 |     const errorCount = await errorNotice.count();
  169 |     if (errorCount > 0) {
  170 |       const text = await errorNotice.first().textContent();
  171 |       if (text && /não foi possível|não consegui|erro|falha/i.test(text)) {
  172 |         throw new Error(`Delete sale showed error notice: "${text.trim()}"`);
  173 |       }
  174 |     }
  175 | 
  176 |     await page.waitForTimeout(2000);
  177 |     if (deleteResponses.some((r) => r.status === 401)) {
> 178 |       throw new Error(
      |             ^ Error: delete-sale gateway returned 401: [{"status":401,"body":"{\"code\":\"UNAUTHORIZED_NO_AUTH_HEADER\",\"message\":\"Missing authorization header\"}"}]. Redeploy: npx supabase functions deploy delete-sale --no-verify-jwt
  179 |         `delete-sale gateway returned 401: ${JSON.stringify(deleteResponses)}. ` +
  180 |           `Redeploy: npx supabase functions deploy delete-sale --no-verify-jwt`,
  181 |       );
  182 |     }
  183 | 
  184 |     await expect
  185 |       .poll(async () => getProductStock(ctx.productIds[1]), { timeout: 20_000 })
  186 |       .toBe(30);
  187 | 
  188 |     await expect
  189 |       .poll(async () => (await listSalesFor(ctx.organizationId)).length, { timeout: 10_000 })
  190 |       .toBe(0);
  191 |   });
  192 | });
  193 | 
  194 | test.describe("Product persistence", () => {
  195 |   test("creates a new product via edge function", async ({ page }) => {
  196 |     await loginWithAccessCode(page, ctx.accessCode);
  197 | 
  198 |     await sectionTabs(page).getByRole("button", { name: /^Produtos$/ }).click();
  199 | 
  200 |     const uniqueName = `E2E Brigadeiro ${Date.now()}`;
  201 |     await page.getByPlaceholder("Produto").first().fill(uniqueName);
  202 |     await page.getByPlaceholder("Categoria").first().fill("Doce");
  203 |     await page.getByPlaceholder("Responsável").first().fill("E2E Responsavel");
  204 |     await page.getByPlaceholder("Valor de venda").first().fill("3,50");
  205 |     await page.getByPlaceholder("Custo").first().fill("1,00");
  206 |     await page.getByPlaceholder("Estoque").first().fill("40");
  207 | 
  208 |     await page.getByRole("button", { name: /^Cadastrar produto$/ }).click();
  209 | 
  210 |     await expect
  211 |       .poll(
  212 |         async () => {
  213 |           const products = await listProductsFor(ctx.organizationId);
  214 |           return products.find((p) => p.name === uniqueName);
  215 |         },
  216 |         { timeout: 15_000 },
  217 |       )
  218 |       .toBeTruthy();
  219 | 
  220 |     const products = await listProductsFor(ctx.organizationId);
  221 |     const created = products.find((p) => p.name === uniqueName);
  222 |     expect(Number(created?.sale_price)).toBe(3.5);
  223 |     expect(Number(created?.unit_cost)).toBe(1);
  224 |     expect(Number(created?.stock_quantity)).toBe(40);
  225 |     expect(created?.is_active).toBe(true);
  226 |   });
  227 | });
  228 | 
  229 | test.describe("Session restore", () => {
  230 |   test("persists login through reload via localStorage", async ({ page }) => {
  231 |     await loginWithAccessCode(page, ctx.accessCode);
  232 |     await expect(page.getByText("E2E Refrigerante")).toBeVisible();
  233 | 
  234 |     const storedCode = await page.evaluate(() => window.localStorage.getItem("vendas:accessCode"));
  235 |     expect(storedCode).toBe(ctx.accessCode);
  236 | 
  237 |     await page.reload();
  238 |     await expect(cartPanel(page)).toBeVisible({ timeout: 15_000 });
  239 |     await expect(page.getByText("E2E Refrigerante")).toBeVisible();
  240 |     await expect(page.getByPlaceholder("Código do evento")).not.toBeVisible();
  241 |   });
  242 | });
  243 | 
```