.PHONY: dev setup validate test typecheck install clean db-reset test-e2e test-e2e-ui test-integration

# Start all dev servers
dev:
	npm run dev

# Install all dependencies
install:
	npm install

# Initialize local Supabase + generate .env files
setup:
	supabase start
	./scripts/setup-env.sh

# Run everything that should pass before committing
validate: typecheck test

# TypeScript type checking (no emit)
typecheck:
	npx tsc -p client/tsconfig.json --noEmit
	npx tsc -p server/tsconfig.json --noEmit

# Run server tests
test:
	node --import tsx/esm --test server/test/*.test.ts

# Reset local database (re-applies migrations)
db-reset:
	supabase db reset

# Run E2E tests (Playwright)
test-e2e:
	npx playwright test --config e2e/playwright.config.ts

# Run E2E tests with Playwright UI mode
test-e2e-ui:
	npx playwright test --config e2e/playwright.config.ts --ui

# Run integration E2E tests (requires local Supabase running)
test-integration:
	npx playwright test --config e2e/integration.config.ts

# Stop local Supabase
clean:
	supabase stop
