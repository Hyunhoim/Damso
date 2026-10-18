#! /usr/bin/env bash

set -e

# Run migrations
alembic upgrade head

# Create initial data in DB
python -m app.initial_data
python -m app.seed_questions

