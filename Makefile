.PHONY: dev setup validate test typecheck install clean db-reset test-ui test-ui-open test-integration

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

# Run UI tests (Playwright, no backend needed)
test-ui:
	npx playwright test --config e2e/ui.config.ts

# Run UI tests with Playwright interactive mode
test-ui-open:
	npx playwright test --config e2e/ui.config.ts --ui

# Run integration tests (requires local Supabase running)
test-integration:
	npx playwright test --config e2e/integration.config.ts

# Stop local Supabase
clean:
	supabase stop
