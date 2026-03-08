.PHONY: help start stop logs-view clean test build docs

ROOT_DIR := $(shell pwd)

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'

start: ## Start everything (PostgreSQL + Server + Client)
	@echo "🚀 Starting all services..."
	@mkdir -p $(ROOT_DIR)/logs
	@docker-compose up -d
	@echo "✓ PostgreSQL started on port 5433"
	@sleep 2
	@echo "✓ Starting server on port 5556..."
	@cd versus-server && PORT=5556 DATABASE_URL=postgresql://versus_user:dev_password@localhost:5433/versus_db bun run dev > $(ROOT_DIR)/logs/server.log 2>&1 & echo $$! > $(ROOT_DIR)/logs/server.pid
	@sleep 3
	@echo "✓ Starting client on port 5555..."
	@cd versus-client && PORT=5555 bun run dev > $(ROOT_DIR)/logs/client.log 2>&1 & echo $$! > $(ROOT_DIR)/logs/client.pid
	@sleep 2
	@echo ""
	@echo "✅ All services running!"
	@echo ""
	@echo "  🌐 Client:   http://localhost:5555"
	@echo "  🔌 Server:   http://localhost:5556"
	@echo "  🗄️  Database: localhost:5433"
	@echo ""
	@echo "Stop: make stop"

stop: ## Stop all services
	@echo "Stopping services..."
	@[ -f logs/server.pid ] && kill $$(cat logs/server.pid) 2>/dev/null && rm logs/server.pid && echo "✓ Server stopped" || true
	@[ -f logs/client.pid ] && kill $$(cat logs/client.pid) 2>/dev/null && rm logs/client.pid && echo "✓ Client stopped" || true
	@docker-compose down 2>/dev/null && echo "✓ PostgreSQL stopped" || true
	@echo "All stopped!"

logs-view: ## View all logs in real-time
	@echo "Logs (Ctrl+C to exit):"
	@tail -f logs/server.log logs/client.log 2>/dev/null || echo "No logs yet. Run 'make start' first."

clean: ## Stop and remove all data
	@$(MAKE) stop
	@docker-compose down -v 2>/dev/null || true
	@rm -rf logs
	@echo "✓ Cleaned up"

test: ## Run all tests
	@cd versus-server && bun run test

build: ## Build for production
	@bun run build

docs: ## Serve documentation locally
	@cd docs && mkdocs serve -a localhost:8000
