.PHONY: up down test seed
up:
	docker compose up --build
down:
	docker compose down
test:
	cd backend && PYTHONPATH=.:.. pytest -q
seed:
	cd backend && PYTHONPATH=.:.. python -m database.seed
