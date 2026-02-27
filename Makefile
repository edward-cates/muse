.PHONY: dev setup validate test typecheck install clean db-reset

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

# Stop local Supabase
clean:
	supabase stop
