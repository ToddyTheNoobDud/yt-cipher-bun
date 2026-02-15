FROM oven/bun:latest

WORKDIR /usr/src/app

# Copy project files (ejs submodule is already checked out)
COPY . .

# Install dependencies
RUN bun install --frozen-lockfile || bun install

RUN mkdir -p player_cache

EXPOSE 8001

CMD ["bun", "run", "server.ts"]
