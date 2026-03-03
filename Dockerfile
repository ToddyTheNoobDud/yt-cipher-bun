FROM oven/bun:latest

WORKDIR /usr/src/app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends git ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN bun install --frozen-lockfile || bun install

COPY . .

ARG EJS_REF=5bc9811c7a2f64a88279d2b90884df2160e51b34
RUN if [ ! -f ejs/src/yt/solver/main.ts ]; then \
		echo "ejs submodule missing, fetching ${EJS_REF}"; \
		rm -rf ejs; \
		git clone https://github.com/yt-dlp/ejs.git ejs; \
		cd ejs; \
		git checkout "${EJS_REF}"; \
		cd /usr/src/app; \
	fi

RUN test -f ejs/src/yt/solver/main.ts

RUN mkdir -p player_cache

EXPOSE 8080

CMD ["bun", "run", "server.ts"]
